import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthThrottlerGuard } from '../auth/rate-limit/auth-throttler.guard';
import { CodeEntryLockedException } from '../two-factor/two-factor-attempt.limiter';
import { ADMIN_TWO_FACTOR_ENROLMENT_REQUIRED_CODE } from '../two-factor/two-factor.constants';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';

// The two-factor branches of the ADMIN auth controller (B-086, B-270; Decision Log #446): the challenge and the
// enrolment token are not sessions (no tokens, no cookie), and the second step issues the session on the admin
// cookie (sn_admin_rt, Path /admin/auth).
const CHALLENGE = { twoFactorRequired: true, challengeToken: 'id.secret', challengeExpiresInSeconds: 300 };
const ENROLMENT = { twoFactorEnrolmentRequired: true, enrolmentToken: 'id.secret', expiresInSeconds: 600 };
const SESSION = {
  accessToken: 'admin-access',
  accessTokenExpiresIn: 900,
  refreshToken: 'admin-refresh.secret',
  refreshTokenExpiresAt: new Date('2026-12-01T00:00:00.000Z').toISOString(),
  admin: { id: 'admin-1' },
};
const COOKIE_MODE = { 'X-Auth-Mode': 'cookie', Origin: 'http://localhost:5174' };

describe('AdminAuthController two-factor sign-in (HTTP layer)', () => {
  let app: INestApplication;
  const adminAuthService = {
    login: jest.fn(),
    completeTwoFactorLogin: jest.fn(),
    completeEnrolmentLogin: jest.fn(),
    refresh: jest.fn(),
    refreshSession: jest.fn(),
  };
  const twoFactor = { startAdminEnrolmentWithToken: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminAuthController],
      providers: [
        { provide: AdminAuthService, useValue: adminAuthService },
        { provide: TwoFactorService, useValue: twoFactor },
      ],
    })
      .overrideGuard(AuthThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  beforeEach(() => jest.resetAllMocks());
  afterAll(async () => {
    await app.close();
  });

  describe('POST /admin/auth/login', () => {
    it('a challenge is returned as is: no tokens, no cookie, even in cookie mode', async () => {
      adminAuthService.login.mockResolvedValue(CHALLENGE);
      const res = await request(app.getHttpServer())
        .post('/admin/auth/login')
        .set(COOKIE_MODE)
        .send({ email: 'admin@example.com', password: 'pw' })
        .expect(200);
      expect(res.body).toEqual(CHALLENGE);
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('an enrolment-required answer is returned as is: no tokens, no cookie', async () => {
      adminAuthService.login.mockResolvedValue(ENROLMENT);
      const res = await request(app.getHttpServer())
        .post('/admin/auth/login')
        .set(COOKIE_MODE)
        .send({ email: 'admin@example.com', password: 'pw' })
        .expect(200);
      expect(res.body).toEqual(ENROLMENT);
      expect(res.body).not.toHaveProperty('accessToken');
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('a session in cookie mode still gets the ADMIN cookie', async () => {
      adminAuthService.login.mockResolvedValue(SESSION);
      const res = await request(app.getHttpServer())
        .post('/admin/auth/login')
        .set(COOKIE_MODE)
        .send({ email: 'admin@example.com', password: 'pw' })
        .expect(200);
      expect(String(res.headers['set-cookie'])).toContain('sn_admin_rt=admin-refresh.secret');
    });
  });

  describe('POST /admin/auth/login/two-factor', () => {
    it('issues the session on the admin cookie (httpOnly, Path /admin/auth), refresh token only in the cookie', async () => {
      adminAuthService.completeTwoFactorLogin.mockResolvedValue({ response: SESSION, persistent: false });
      const res = await request(app.getHttpServer())
        .post('/admin/auth/login/two-factor')
        .set(COOKIE_MODE)
        .send({ challengeToken: 'id.secret', code: '123456' })
        .expect(200);
      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toContain('sn_admin_rt=admin-refresh.secret');
      expect(cookie).toContain('Path=/admin/auth');
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).not.toMatch(/Max-Age/i); // the admin session stays non-persistent (the founder's decision of 2026-10-29)
      expect(res.body).not.toHaveProperty('refreshToken');
      expect(adminAuthService.completeTwoFactorLogin).toHaveBeenCalledWith('id.secret', '123456');
    });

    it('validates the body, and a locked account is a 429 with Retry-After', async () => {
      await request(app.getHttpServer()).post('/admin/auth/login/two-factor').send({ code: '123456' }).expect(400);
      await request(app.getHttpServer()).post('/admin/auth/login/two-factor').send({ challengeToken: 'x' }).expect(400);
      expect(adminAuthService.completeTwoFactorLogin).not.toHaveBeenCalled();

      adminAuthService.completeTwoFactorLogin.mockRejectedValue(new CodeEntryLockedException(901));
      const res = await request(app.getHttpServer())
        .post('/admin/auth/login/two-factor')
        .send({ challengeToken: 'id.secret', code: '000000' })
        .expect(429);
      expect(res.headers['retry-after']).toBe('901');
    });
  });

  describe('the enrolment gate: /admin/auth/login/two-factor/enrol/{start,confirm}', () => {
    it('start returns the secret and URI for the token', async () => {
      twoFactor.startAdminEnrolmentWithToken.mockResolvedValue({ secret: 'S', otpauthUri: 'otpauth://totp/x' });
      const res = await request(app.getHttpServer())
        .post('/admin/auth/login/two-factor/enrol/start')
        .send({ enrolmentToken: 'id.secret' })
        .expect(200);
      expect(res.body).toEqual({ secret: 'S', otpauthUri: 'otpauth://totp/x' });
      expect(twoFactor.startAdminEnrolmentWithToken).toHaveBeenCalledWith('id.secret');
    });

    it('confirm returns the SESSION and the backup codes together; the refresh token goes only into the admin cookie', async () => {
      adminAuthService.completeEnrolmentLogin.mockResolvedValue({
        response: SESSION,
        persistent: false,
        backupCodes: ['AAAAAAAAAA', 'BBBBBBBBBB'],
      });
      const res = await request(app.getHttpServer())
        .post('/admin/auth/login/two-factor/enrol/confirm')
        .set(COOKIE_MODE)
        .send({ enrolmentToken: 'id.secret', code: '123456' })
        .expect(200);
      expect(res.body.backupCodes).toEqual(['AAAAAAAAAA', 'BBBBBBBBBB']);
      expect(res.body.accessToken).toBe('admin-access');
      expect(res.body).not.toHaveProperty('refreshToken');
      expect(String(res.headers['set-cookie'])).toContain('sn_admin_rt=admin-refresh.secret');
      expect(adminAuthService.completeEnrolmentLogin).toHaveBeenCalledWith('id.secret', '123456');
    });

    it('both validate their bodies and pass a refusal through', async () => {
      const http = request(app.getHttpServer());
      await http.post('/admin/auth/login/two-factor/enrol/start').send({}).expect(400);
      await http.post('/admin/auth/login/two-factor/enrol/confirm').send({ enrolmentToken: 'x' }).expect(400);
      await http.post('/admin/auth/login/two-factor/enrol/confirm').send({ code: '123456' }).expect(400);

      adminAuthService.completeEnrolmentLogin.mockRejectedValue(new UnauthorizedException('This sign-in step has expired. Sign in again.'));
      const res = await http
        .post('/admin/auth/login/two-factor/enrol/confirm')
        .set(COOKIE_MODE)
        .send({ enrolmentToken: 'x.y', code: '123456' })
        .expect(401);
      expect(res.headers['set-cookie']).toBeUndefined();
    });
  });
  // backend/b086-two-factor-followups: the refresh gate, as it reaches the client. The service throws the coded 401
  // (admin-auth.service.refresh-gate.spec.ts); these prove how each mode carries it.
  describe('POST /admin/auth/refresh with the enrolment gate', () => {
    const gate = () =>
      new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        code: ADMIN_TWO_FACTOR_ENROLMENT_REQUIRED_CODE,
        message: 'Two-factor enrolment is required.',
      });

    it('cookie mode: 401 with the code, and the sn_admin_rt cookie is CLEARED', async () => {
      adminAuthService.refreshSession.mockRejectedValue(gate());
      const res = await request(app.getHttpServer())
        .post('/admin/auth/refresh')
        .set({ ...COOKIE_MODE, Cookie: 'sn_admin_rt=admin-refresh.secret' })
        .send({})
        .expect(401);
      expect(res.body).toMatchObject({ code: ADMIN_TWO_FACTOR_ENROLMENT_REQUIRED_CODE, message: 'Two-factor enrolment is required.' });
      expect(res.body).not.toHaveProperty('accessToken');
      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toContain('sn_admin_rt=;');
      expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);
      expect(cookie).toContain('Path=/admin/auth');
    });

    it('body mode: 401 with the code, no cookie is touched, no tokens in the body', async () => {
      adminAuthService.refresh.mockRejectedValue(gate());
      const res = await request(app.getHttpServer())
        .post('/admin/auth/refresh')
        .send({ refreshToken: 'admin-refresh.secret' })
        .expect(401);
      expect(res.body).toMatchObject({ code: ADMIN_TWO_FACTOR_ENROLMENT_REQUIRED_CODE });
      expect(res.body).not.toHaveProperty('accessToken');
      expect(res.body).not.toHaveProperty('refreshToken');
      expect(res.headers['set-cookie']).toBeUndefined();
    });
  });
});
