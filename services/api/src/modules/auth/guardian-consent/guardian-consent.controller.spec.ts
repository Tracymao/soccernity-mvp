import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthRateLimitModule } from '../rate-limit/rate-limit.module';
import { AuthThrottlerGuard } from '../rate-limit/auth-throttler.guard';
import { GuardianConsentController } from './guardian-consent.controller';
import { GuardianConsentService } from './guardian-consent.service';

// Exercises real HTTP request/response handling (routing, DTO
// validation, status codes) with GuardianConsentService mocked out,
// mirroring registration/registration.controller.spec.ts's and
// password-reset/password-reset.controller.spec.ts's pattern.
describe('GuardianConsentController (HTTP layer)', () => {
  let app: INestApplication;
  const guardianConsentService = {
    confirmConsent: jest.fn(),
    resendConsent: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GuardianConsentController],
      providers: [{ provide: GuardianConsentService, useValue: guardianConsentService }],
    })
      // /auth/guardian-consent/resend carries @AuthRateLimit() (DPIA
      // finding R5) -- overridden here, same reasoning as
      // registration.controller.spec.ts's AuthThrottlerGuard override,
      // so these unrelated assertions aren't affected by request count.
      // Real rate-limit enforcement is exercised separately below.
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

  describe('POST /auth/guardian-consent', () => {
    it('returns 200 on a valid, unused token', async () => {
      guardianConsentService.confirmConsent.mockResolvedValueOnce(undefined);

      const response = await request(app.getHttpServer())
        .post('/auth/guardian-consent')
        .send({ consentToken: 'a-real-token' })
        .expect(200);

      expect(response.body).toEqual({ message: 'Guardian consent confirmed.' });
      expect(guardianConsentService.confirmConsent).toHaveBeenCalledWith('a-real-token');
    });

    it('returns 200 idempotently when the same token is submitted again', async () => {
      guardianConsentService.confirmConsent.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .post('/auth/guardian-consent')
        .send({ consentToken: 'a-real-token' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/auth/guardian-consent')
        .send({ consentToken: 'a-real-token' })
        .expect(200);

      expect(response.body).toEqual({ message: 'Guardian consent confirmed.' });
      expect(guardianConsentService.confirmConsent).toHaveBeenCalledTimes(2);
    });

    it('maps an invalid-token BadRequestException to 400', async () => {
      guardianConsentService.confirmConsent.mockRejectedValueOnce(
        new BadRequestException('Invalid or expired consent token'),
      );

      await request(app.getHttpServer())
        .post('/auth/guardian-consent')
        .send({ consentToken: 'not-a-real-token' })
        .expect(400);
    });

    it('rejects a body missing consentToken with 400', async () => {
      await request(app.getHttpServer()).post('/auth/guardian-consent').send({}).expect(400);

      expect(guardianConsentService.confirmConsent).not.toHaveBeenCalled();
    });

    it('rejects a wrong-type consentToken field with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/guardian-consent')
        .send({ consentToken: 12345 })
        .expect(400);

      expect(guardianConsentService.confirmConsent).not.toHaveBeenCalled();
    });

    it('rejects an unexpected extra field with 400 (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/auth/guardian-consent')
        .send({ consentToken: 'a-real-token', role: 'admin' })
        .expect(400);

      expect(guardianConsentService.confirmConsent).not.toHaveBeenCalled();
    });
  });

  // DPIA finding R5's re-send path.
  describe('POST /auth/guardian-consent/resend', () => {
    it('returns 200 with a generic message for a known, pending email', async () => {
      guardianConsentService.resendConsent.mockResolvedValueOnce(undefined);

      const response = await request(app.getHttpServer())
        .post('/auth/guardian-consent/resend')
        .send({ email: 'minor@example.com' })
        .expect(200);

      expect(response.body).toEqual({
        message: 'If that account has a guardian consent request pending, a new email has been sent.',
      });
      expect(guardianConsentService.resendConsent).toHaveBeenCalledWith('minor@example.com');
    });

    it('returns the exact same generic response for an unknown email (non-enumeration)', async () => {
      guardianConsentService.resendConsent.mockResolvedValueOnce(undefined);

      const response = await request(app.getHttpServer())
        .post('/auth/guardian-consent/resend')
        .send({ email: 'nobody@example.com' })
        .expect(200);

      expect(response.body).toEqual({
        message: 'If that account has a guardian consent request pending, a new email has been sent.',
      });
    });

    it('returns the exact same generic response for an already-confirmed guardian (non-enumeration)', async () => {
      guardianConsentService.resendConsent.mockResolvedValueOnce(undefined);

      const response = await request(app.getHttpServer())
        .post('/auth/guardian-consent/resend')
        .send({ email: 'already-confirmed@example.com' })
        .expect(200);

      expect(response.body).toEqual({
        message: 'If that account has a guardian consent request pending, a new email has been sent.',
      });
    });

    it('rejects a body missing email with 400', async () => {
      await request(app.getHttpServer()).post('/auth/guardian-consent/resend').send({}).expect(400);

      expect(guardianConsentService.resendConsent).not.toHaveBeenCalled();
    });

    it('rejects a non-email string with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/guardian-consent/resend')
        .send({ email: 'not-an-email' })
        .expect(400);

      expect(guardianConsentService.resendConsent).not.toHaveBeenCalled();
    });

    it('rejects an unexpected extra field with 400 (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/auth/guardian-consent/resend')
        .send({ email: 'minor@example.com', consentToken: 'sneaking-this-in' })
        .expect(400);

      expect(guardianConsentService.resendConsent).not.toHaveBeenCalled();
    });
  });
});

// Separate app instance with the REAL AuthThrottlerGuard (not overridden)
// wired via AuthRateLimitModule, same DI graph GuardianConsentModule
// actually uses in production -- proves @AuthRateLimit() is genuinely
// applied to POST /auth/guardian-consent/resend, not just present in
// source but silently no-op'd. AuthThrottlerGuard's own general
// "blocks once the limit is exceeded" counting logic is already
// thoroughly covered by rate-limit/auth-throttler.guard.spec.ts; this
// test only proves this specific route is actually behind it.
describe('POST /auth/guardian-consent/resend (real rate limiting)', () => {
  let app: INestApplication;
  const guardianConsentService = { confirmConsent: jest.fn(), resendConsent: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthRateLimitModule],
      controllers: [GuardianConsentController],
      providers: [{ provide: GuardianConsentService, useValue: guardianConsentService }, AuthThrottlerGuard],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks with 429 once the default rate limit (5 per window) is exceeded', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/auth/guardian-consent/resend')
        .send({ email: 'minor@example.com' })
        .expect(200);
    }

    await request(app.getHttpServer())
      .post('/auth/guardian-consent/resend')
      .send({ email: 'minor@example.com' })
      .expect(429);
  });
});
