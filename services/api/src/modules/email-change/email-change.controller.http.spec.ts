import { BadRequestException, ExecutionContext, ForbiddenException, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthLimitExceeded } from '../auth/rate-limit/auth-limits/auth-limits.service';
import { AuthThrottlerGuard } from '../auth/rate-limit/auth-throttler.guard';
import { EmailChangeController } from './email-change.controller';
import { EmailChangeService } from './email-change.service';

// HTTP wiring of the two email-change routes: routing, status codes, DTO validation, which guards run where, and the
// Retry-After header of a spent budget. The service is mocked (its logic is in email-change.service.spec.ts).
describe('EmailChangeController (HTTP layer)', () => {
  let app: INestApplication;
  let authenticated = true;
  let consentOk = true;
  const service = { requestChange: jest.fn(), confirmChange: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [EmailChangeController],
      providers: [{ provide: EmailChangeService, useValue: service }],
    })
      .overrideGuard(AuthThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!authenticated) throw new UnauthorizedException('Missing bearer token');
          context.switchToHttp().getRequest().user = { sub: 'user-1', role: 'fan' };
          return true;
        },
      })
      .overrideGuard(GuardianConsentGuard)
      .useValue({
        canActivate: () => {
          if (!consentOk) throw new ForbiddenException({ statusCode: 403, code: 'guardian_consent_pending', message: 'x' });
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  beforeEach(() => {
    authenticated = true;
    consentOk = true;
    jest.resetAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /users/me/email-change', () => {
    const body = { password: 'pw', newEmail: 'new@example.com' };

    it('202 { status: verification_sent }; the caller comes from the token, never the body', async () => {
      service.requestChange.mockResolvedValue(undefined);
      const res = await request(app.getHttpServer()).post('/users/me/email-change').send(body).expect(202);
      expect(res.body).toEqual({ status: 'verification_sent' });
      expect(service.requestChange).toHaveBeenCalledWith('user-1', body);
    });

    it('passes the optional two-factor code through', async () => {
      service.requestChange.mockResolvedValue(undefined);
      await request(app.getHttpServer()).post('/users/me/email-change').send({ ...body, twoFactorCode: '123456' }).expect(202);
      expect(service.requestChange).toHaveBeenCalledWith('user-1', { ...body, twoFactorCode: '123456' });
    });

    it('401 without a sign-in; the service is not called', async () => {
      authenticated = false;
      await request(app.getHttpServer()).post('/users/me/email-change').send(body).expect(401);
      expect(service.requestChange).not.toHaveBeenCalled();
    });

    it('a restricted-pending minor gets a plain 403 from the consent guard; the service is not called', async () => {
      consentOk = false;
      const res = await request(app.getHttpServer()).post('/users/me/email-change').send(body).expect(403);
      expect(res.body.code).toBe('guardian_consent_pending');
      expect(service.requestChange).not.toHaveBeenCalled();
    });

    it('a malformed address reaches the service (it must be the SAME answer as any other unusable address)', async () => {
      service.requestChange.mockRejectedValue(
        new BadRequestException({ statusCode: 400, error: 'Bad Request', code: 'email_change_not_accepted', message: 'That email address cannot be used.' }),
      );
      const res = await request(app.getHttpServer()).post('/users/me/email-change').send({ ...body, newEmail: 'nonsense' }).expect(400);
      expect(res.body.code).toBe('email_change_not_accepted');
      expect(service.requestChange).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['no password', { newEmail: 'a@b.com' }],
      ['no new address', { password: 'pw' }],
      ['a non-string password', { password: 5, newEmail: 'a@b.com' }],
      ['an unknown field', { ...body, extra: true }],
      ['a code longer than 64 characters', { ...body, twoFactorCode: 'x'.repeat(65) }],
    ])('rejects %s with a 400 before the service', async (_n, payload) => {
      await request(app.getHttpServer()).post('/users/me/email-change').send(payload).expect(400);
      expect(service.requestChange).not.toHaveBeenCalled();
    });

    it('a spent failed-attempt budget is a 429 with Retry-After', async () => {
      service.requestChange.mockRejectedValue(new AuthLimitExceeded(321));
      const res = await request(app.getHttpServer()).post('/users/me/email-change').send(body).expect(429);
      expect(res.headers['retry-after']).toBe('321');
    });

    it('the coded identity errors keep their codes', async () => {
      service.requestChange.mockRejectedValue(new ForbiddenException({ statusCode: 403, code: 'wrong_password', message: 'Incorrect password' }));
      const res = await request(app.getHttpServer()).post('/users/me/email-change').send(body).expect(403);
      expect(res.body.code).toBe('wrong_password');
    });
  });

  describe('POST /auth/email-change/confirm', () => {
    const token = 'x'.repeat(43);

    it('204, with NO sign-in required (the secret is the credential)', async () => {
      authenticated = false;
      service.confirmChange.mockResolvedValue(undefined);
      await request(app.getHttpServer()).post('/auth/email-change/confirm').send({ token }).expect(204);
      expect(service.confirmChange).toHaveBeenCalledWith(token);
    });

    it('does not run the consent guard (the service re-checks inside the transaction)', async () => {
      consentOk = false;
      service.confirmChange.mockResolvedValue(undefined);
      await request(app.getHttpServer()).post('/auth/email-change/confirm').send({ token }).expect(204);
    });

    it.each([
      ['no token', {}],
      ['a too-short token', { token: 'abc' }],
      ['an over-long token', { token: 'x'.repeat(257) }],
      ['a non-string token', { token: 1234567890123456 }],
      ['an unknown field', { token, extra: 1 }],
    ])('rejects %s with a 400 before the service', async (_n, payload) => {
      await request(app.getHttpServer()).post('/auth/email-change/confirm').send(payload).expect(400);
      expect(service.confirmChange).not.toHaveBeenCalled();
    });

    it('a dead link is the coded 400', async () => {
      service.confirmChange.mockRejectedValue(
        new BadRequestException({ statusCode: 400, error: 'Bad Request', code: 'email_change_link_invalid', message: 'x' }),
      );
      const res = await request(app.getHttpServer()).post('/auth/email-change/confirm').send({ token }).expect(400);
      expect(res.body.code).toBe('email_change_link_invalid');
    });
  });
});
