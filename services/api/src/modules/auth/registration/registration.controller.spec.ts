import { BadRequestException, ConflictException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthThrottlerGuard } from '../rate-limit/auth-throttler.guard';
import { RegistrationController } from './registration.controller';
import { RegistrationService } from './registration.service';

// Exercises real HTTP request/response handling (routing, DTO
// validation, status codes) with RegistrationService mocked out — the
// live-server curl/supertest pass in this PR's report covers the real
// Postgres/Redis-backed path end to end; this covers the HTTP layer in
// CI without needing live infra.
describe('RegistrationController (HTTP layer)', () => {
  let app: INestApplication;
  const registrationService = {
    register: jest.fn(),
    verifyEmail: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RegistrationController],
      providers: [{ provide: RegistrationService, useValue: registrationService }],
    })
      // AuthThrottlerGuard (behind @AuthRateLimit(), applied via
      // @UseGuards() directly on the /register handler) needs
      // AuthRateLimitModule's real DI graph (ThrottlerStorage, the
      // THROTTLER:MODULE_OPTIONS token, Reflector) to resolve, which this
      // narrow controller-only test module doesn't build. @UseGuards()
      // resolves guards by class reference, not through the global
      // APP_GUARD multi-provider token, so overrideGuard() — not an
      // APP_GUARD provider — is the correct way to bypass it here without
      // faking rate-limit behavior itself; that behavior is exercised
      // directly by rate-limit/auth-throttler.guard.spec.ts (PR B1) and by
      // this PR's live curl pass.
      .overrideGuard(AuthThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/register', () => {
    it('returns 201 with the shaped response on success', async () => {
      registrationService.register.mockResolvedValueOnce({
        user: {
          id: 'user-1',
          email: 'adult@example.com',
          phone: null,
          displayName: 'Adult User',
          dateOfBirth: new Date('1990-01-01'),
          isMinor: false,
          role: 'fan',
          verificationStatus: 'unverified',
          createdAt: new Date('2026-08-16T00:00:00.000Z'),
          passwordHash: 'should-not-leak',
        },
        guardian: null,
        tokens: {
          accessToken: { token: 'access-token', expiresIn: 900 },
          refreshToken: { token: 'refresh-id.secret', expiresAt: new Date() },
        },
      });

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'adult@example.com',
          password: 'password123',
          displayName: 'Adult User',
          dateOfBirth: '1990-01-01',
        })
        .expect(201);

      expect(response.body.user.email).toBe('adult@example.com');
      expect(response.body.user.passwordHash).toBeUndefined();
      expect(response.body.guardian).toBeNull();
      // Flat shape, matching /auth/login's toTokenPairResponse output --
      // see auth-response.mapper.ts and auth/README.md's response-shape
      // reconciliation note.
      expect(response.body.accessToken).toBe('access-token');
      expect(response.body.accessTokenExpiresIn).toBe(900);
      expect(response.body.refreshToken).toBe('refresh-id.secret');
    });

    it('rejects a body missing required fields with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-enough@example.com' })
        .expect(400);

      expect(registrationService.register).not.toHaveBeenCalled();
    });

    it('rejects an invalid guardian relationship with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'minor@example.com',
          password: 'password123',
          displayName: 'Minor',
          dateOfBirth: '2015-01-01',
          guardian: { name: 'Someone', email: 'someone@example.com', relationship: 'Uncle' },
        })
        .expect(400);

      expect(registrationService.register).not.toHaveBeenCalled();
    });

    it('rejects unknown top-level fields (whitelist enforcement)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'adult@example.com',
          password: 'password123',
          displayName: 'Adult User',
          dateOfBirth: '1990-01-01',
          role: 'admin',
        })
        .expect(400);
    });

    it('maps a duplicate-email ConflictException to 409', async () => {
      registrationService.register.mockRejectedValueOnce(
        new ConflictException('An account with this email already exists'),
      );

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'taken@example.com',
          password: 'password123',
          displayName: 'Someone',
          dateOfBirth: '1990-01-01',
        })
        .expect(409);
    });
  });

  describe('POST /auth/verify-email', () => {
    it('returns 200 and the verified flag on success (non-minor, "not_applicable")', async () => {
      registrationService.verifyEmail.mockResolvedValueOnce({
        userId: 'user-1',
        guardianConsentStatus: 'not_applicable',
      });

      const response = await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send({ token: 'a-real-token' })
        .expect(200);

      expect(response.body).toEqual({
        verified: true,
        userId: 'user-1',
        guardianConsentStatus: 'not_applicable',
      });
    });

    // Decision Log #38: the two minor cases, at the HTTP layer.
    it('returns guardianConsentStatus "confirmed" for a minor whose guardian already confirmed', async () => {
      registrationService.verifyEmail.mockResolvedValueOnce({
        userId: 'minor-1',
        guardianConsentStatus: 'confirmed',
      });

      const response = await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send({ token: 'a-real-token' })
        .expect(200);

      expect(response.body).toEqual({
        verified: true,
        userId: 'minor-1',
        guardianConsentStatus: 'confirmed',
      });
    });

    it('returns guardianConsentStatus "pending" for a minor whose guardian consent is still pending', async () => {
      registrationService.verifyEmail.mockResolvedValueOnce({
        userId: 'minor-2',
        guardianConsentStatus: 'pending',
      });

      const response = await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send({ token: 'a-real-token' })
        .expect(200);

      expect(response.body).toEqual({
        verified: true,
        userId: 'minor-2',
        guardianConsentStatus: 'pending',
      });
    });

    it('maps an invalid-token BadRequestException to 400', async () => {
      registrationService.verifyEmail.mockRejectedValueOnce(
        new BadRequestException('Invalid or expired verification token'),
      );

      await request(app.getHttpServer()).post('/auth/verify-email').send({ token: 'bad' }).expect(400);
    });

    it('rejects a missing token with 400', async () => {
      await request(app.getHttpServer()).post('/auth/verify-email').send({}).expect(400);
    });
  });
});
