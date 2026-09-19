import { BadRequestException, ExecutionContext, INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AuthRateLimitModule } from '../rate-limit/rate-limit.module';
import { AuthThrottlerGuard } from '../rate-limit/auth-throttler.guard';
import { GuardianConsentController } from './guardian-consent.controller';
import { GuardianConsentService } from './guardian-consent.service';

const AUTHENTICATED_MINOR = { sub: 'minor-1', role: 'fan' };

// Exercises real HTTP request/response handling (routing, DTO
// validation, status codes) with GuardianConsentService mocked out,
// mirroring registration/registration.controller.spec.ts's and
// password-reset/password-reset.controller.spec.ts's pattern.
describe('GuardianConsentController (HTTP layer)', () => {
  let app: INestApplication;
  const guardianConsentService = {
    confirmConsent: jest.fn(),
    resendConsent: jest.fn(),
    getConsentStatus: jest.fn(),
    // sprint-1/guardian-consent-decline-withdraw-expiry
    declineConsent: jest.fn(),
    requestWithdrawal: jest.fn(),
    withdrawConsent: jest.fn(),
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
      // GET /auth/guardian-consent/status (sprint-1/f5-f6-missing-endpoints)
      // carries JwtAuthGuard -- overridden here, same pattern
      // auth.controller.http.spec.ts and users.controller.http.spec.ts
      // already use, since this TestingModule has no real
      // TokenService/PrismaService for the real guard to depend on.
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = AUTHENTICATED_MINOR;
          return true;
        },
      })
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

  // GET /auth/guardian-consent/status (sprint-1/f5-f6-missing-endpoints).
  // JwtAuthGuard only -- see guardian-consent.service.ts's
  // getConsentStatus() and auth/README.md for the full guard-choice
  // reasoning (a restricted-pending minor must be able to check their own
  // status, so this can't be gated behind GuardianConsentGuard itself).
  describe('GET /auth/guardian-consent/status', () => {
    it('returns 200 with the real consent-status shape, keyed off the caller-from-JWT id', async () => {
      guardianConsentService.getConsentStatus.mockResolvedValueOnce({
        consentStatus: 'pending',
        guardianEmail: 'guardian@example.com',
        canResend: true,
        consentTimestamp: null,
      });

      const response = await request(app.getHttpServer())
        .get('/auth/guardian-consent/status')
        .expect(200);

      expect(response.body).toEqual({
        consentStatus: 'pending',
        guardianEmail: 'guardian@example.com',
        canResend: true,
        consentTimestamp: null,
      });
      expect(guardianConsentService.getConsentStatus).toHaveBeenCalledWith(AUTHENTICATED_MINOR.sub);
    });

    it('maps a NotFoundException (no Guardian row for this caller) to 404', async () => {
      guardianConsentService.getConsentStatus.mockRejectedValueOnce(
        new NotFoundException('No guardian consent record exists for this account'),
      );

      await request(app.getHttpServer()).get('/auth/guardian-consent/status').expect(404);
    });
  });

  // -----------------------------------------------------------------
  // sprint-1/guardian-consent-decline-withdraw-expiry
  // -----------------------------------------------------------------

  describe('POST /auth/guardian-consent/decline', () => {
    it('returns 200 and forwards the consent token', async () => {
      guardianConsentService.declineConsent.mockResolvedValueOnce(undefined);

      await request(app.getHttpServer())
        .post('/auth/guardian-consent/decline')
        .send({ consentToken: 'token-123' })
        .expect(200)
        .expect({ message: 'Guardian consent declined.' });

      expect(guardianConsentService.declineConsent).toHaveBeenCalledWith('token-123');
    });

    it('rejects a missing consentToken with 400 before reaching the service', async () => {
      await request(app.getHttpServer())
        .post('/auth/guardian-consent/decline')
        .send({})
        .expect(400);

      expect(guardianConsentService.declineConsent).not.toHaveBeenCalled();
    });

    it('rejects an unknown extra property (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/auth/guardian-consent/decline')
        .send({ consentToken: 'token-123', accountStatus: 'active' })
        .expect(400);

      expect(guardianConsentService.declineConsent).not.toHaveBeenCalled();
    });

    it('surfaces the service\'s BadRequestException as a 400', async () => {
      guardianConsentService.declineConsent.mockRejectedValueOnce(
        new BadRequestException('Invalid or expired consent token'),
      );

      await request(app.getHttpServer())
        .post('/auth/guardian-consent/decline')
        .send({ consentToken: 'stale' })
        .expect(400);
    });
  });

  describe('POST /auth/guardian-consent/withdraw/request', () => {
    it('returns the same generic message whether or not anything matched', async () => {
      guardianConsentService.requestWithdrawal.mockResolvedValue(undefined);

      const matched = await request(app.getHttpServer())
        .post('/auth/guardian-consent/withdraw/request')
        .send({ email: 'minor@example.com' })
        .expect(200);

      const unmatched = await request(app.getHttpServer())
        .post('/auth/guardian-consent/withdraw/request')
        .send({ email: 'nobody@example.com' })
        .expect(200);

      // Non-enumeration: the two responses must be byte-identical.
      expect(matched.body).toEqual(unmatched.body);
      expect(matched.body.message).toMatch(/if that account/i);
    });

    it('rejects a malformed email with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/guardian-consent/withdraw/request')
        .send({ email: 'not-an-email' })
        .expect(400);

      expect(guardianConsentService.requestWithdrawal).not.toHaveBeenCalled();
    });

    it('is routed distinctly from POST /auth/guardian-consent/withdraw', async () => {
      // The two withdrawal routes are a prefix of one another; this
      // guards against a routing regression where /withdraw/request
      // silently falls through to /withdraw (which would consume a
      // token that was never issued).
      guardianConsentService.requestWithdrawal.mockResolvedValueOnce(undefined);

      await request(app.getHttpServer())
        .post('/auth/guardian-consent/withdraw/request')
        .send({ email: 'minor@example.com' })
        .expect(200);

      expect(guardianConsentService.requestWithdrawal).toHaveBeenCalledTimes(1);
      expect(guardianConsentService.withdrawConsent).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/guardian-consent/withdraw', () => {
    it('returns 200 and forwards the withdrawal token', async () => {
      guardianConsentService.withdrawConsent.mockResolvedValueOnce(undefined);

      await request(app.getHttpServer())
        .post('/auth/guardian-consent/withdraw')
        .send({ withdrawalToken: 'wd-123' })
        .expect(200)
        .expect({ message: 'Guardian consent withdrawn.' });

      expect(guardianConsentService.withdrawConsent).toHaveBeenCalledWith('wd-123');
    });

    it('rejects a consentToken posted to the withdrawal route', async () => {
      // The DTO field is deliberately named differently from the consent
      // DTO's, so a frontend cannot post the wrong credential and have it
      // silently accepted.
      await request(app.getHttpServer())
        .post('/auth/guardian-consent/withdraw')
        .send({ consentToken: 'token-123' })
        .expect(400);

      expect(guardianConsentService.withdrawConsent).not.toHaveBeenCalled();
    });

    it('surfaces the service\'s BadRequestException as a 400', async () => {
      guardianConsentService.withdrawConsent.mockRejectedValueOnce(
        new BadRequestException('Invalid or expired withdrawal token'),
      );

      await request(app.getHttpServer())
        .post('/auth/guardian-consent/withdraw')
        .send({ withdrawalToken: 'spent' })
        .expect(400);
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
    })
      // Same reasoning as the block above -- GET /auth/guardian-consent/status's
      // JwtAuthGuard needs overriding here too, or module compilation
      // itself fails (this describe block never exercises that route,
      // but Nest still resolves every guard referenced anywhere in the
      // controller at compile time).
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = AUTHENTICATED_MINOR;
          return true;
        },
      })
      .compile();

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
