import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { CodeEntryLockedException } from '../two-factor/two-factor-attempt.limiter';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthLimitsInterceptor } from './rate-limit/auth-limits/auth-limits.interceptor';
import { AuthThrottlerGuard } from './rate-limit/auth-throttler.guard';

// The two-factor branches of the user auth controller (B-086, Decision Log #446). A challenge is NOT a session: it must
// carry no tokens and set no cookie, in either mode. POST /auth/login/two-factor is public (the challenge is the
// credential) and issues the session exactly as login does.
const CHALLENGE = { twoFactorRequired: true, challengeToken: 'id.secret', challengeExpiresInSeconds: 300 };
const SESSION = {
  accessToken: 'access',
  accessTokenExpiresIn: 900,
  refreshToken: 'refresh-id.secret',
  refreshTokenExpiresAt: new Date('2026-12-01T00:00:00.000Z').toISOString(),
  user: { id: 'user-1', email: 'kid@example.com' },
};
const COOKIE_MODE = { 'X-Auth-Mode': 'cookie', Origin: 'http://localhost:5173' };

describe('AuthController two-factor sign-in (HTTP layer)', () => {
  let app: INestApplication;
  const authService = {
    login: jest.fn(),
    reactivateAccount: jest.fn(),
    completeTwoFactorLogin: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    })
      .overrideInterceptor(AuthLimitsInterceptor)
      .useValue({ intercept: (_ctx: unknown, next: { handle(): unknown }) => next.handle() })
      .overrideGuard(AuthThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
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

  describe('POST /auth/login for an account with two-factor on', () => {
    it('returns the challenge (200) with no tokens and no cookie', async () => {
      authService.login.mockResolvedValue(CHALLENGE);
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'kid@example.com', password: 'pw', staySignedIn: true })
        .expect(200);
      expect(res.body).toEqual(CHALLENGE);
      expect(res.body).not.toHaveProperty('accessToken');
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(authService.login).toHaveBeenCalledWith('kid@example.com', 'pw', true);
    });

    it('sets NO cookie for a challenge even in cookie mode, where a session would set one', async () => {
      authService.login.mockResolvedValue(CHALLENGE);
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set(COOKIE_MODE)
        .send({ email: 'kid@example.com', password: 'pw' })
        .expect(200);
      expect(res.body).toEqual(CHALLENGE);
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('a normal session in cookie mode still gets its cookie (the new branch only catches the challenge)', async () => {
      authService.login.mockResolvedValue(SESSION);
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set(COOKIE_MODE)
        .send({ email: 'kid@example.com', password: 'pw' })
        .expect(200);
      expect(String(res.headers['set-cookie'])).toContain('sn_rt=refresh-id.secret');
      expect(res.body).not.toHaveProperty('refreshToken');
    });
  });

  it('POST /auth/reactivate-account answers a challenge the same way (no tokens, no cookie)', async () => {
    authService.reactivateAccount.mockResolvedValue(CHALLENGE);
    const res = await request(app.getHttpServer())
      .post('/auth/reactivate-account')
      .set(COOKIE_MODE)
      .send({ email: 'kid@example.com', password: 'pw' })
      .expect(200);
    expect(res.body).toEqual(CHALLENGE);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  describe('POST /auth/login/two-factor', () => {
    it('is public: no bearer token needed, the challenge is the credential', async () => {
      authService.completeTwoFactorLogin.mockResolvedValue({ response: SESSION, persistent: false });
      const res = await request(app.getHttpServer())
        .post('/auth/login/two-factor')
        .send({ challengeToken: 'id.secret', code: '123456' })
        .expect(200);
      expect(authService.completeTwoFactorLogin).toHaveBeenCalledWith('id.secret', '123456');
      // Not cookie mode (a native client): tokens in the body, as login does.
      expect(res.body.refreshToken).toBe('refresh-id.secret');
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('in cookie mode: the refresh token goes into the httpOnly cookie, not the body', async () => {
      authService.completeTwoFactorLogin.mockResolvedValue({ response: SESSION, persistent: false });
      const res = await request(app.getHttpServer())
        .post('/auth/login/two-factor')
        .set(COOKIE_MODE)
        .send({ challengeToken: 'id.secret', code: '123456' })
        .expect(200);
      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toContain('sn_rt=refresh-id.secret');
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toContain('Path=/auth');
      expect(cookie).not.toMatch(/Max-Age/i); // a session cookie: "stay signed in" was not chosen
      expect(res.body).not.toHaveProperty('refreshToken');
      expect(res.body.accessToken).toBe('access');
    });

    it('keeps the "stay signed in" choice made at the password step: a persistent cookie', async () => {
      authService.completeTwoFactorLogin.mockResolvedValue({ response: SESSION, persistent: true });
      const res = await request(app.getHttpServer())
        .post('/auth/login/two-factor')
        .set(COOKIE_MODE)
        .send({ challengeToken: 'id.secret', code: 'abcde-fghjk' })
        .expect(200);
      expect(String(res.headers['set-cookie'])).toMatch(/Max-Age=\d+/i);
    });

    it('validates the body before the service is touched', async () => {
      const http = request(app.getHttpServer());
      await http.post('/auth/login/two-factor').send({}).expect(400);
      await http.post('/auth/login/two-factor').send({ challengeToken: 'id.secret' }).expect(400);
      await http.post('/auth/login/two-factor').send({ code: '123456' }).expect(400);
      await http.post('/auth/login/two-factor').send({ challengeToken: '', code: '123456' }).expect(400);
      await http.post('/auth/login/two-factor').send({ challengeToken: 'id.secret', code: 123456 }).expect(400);
      await http.post('/auth/login/two-factor').send({ challengeToken: 'id.secret', code: 'x'.repeat(33) }).expect(400);
      await http.post('/auth/login/two-factor').send({ challengeToken: 'id.secret', code: '123456', userId: 'u2' }).expect(400);
      expect(authService.completeTwoFactorLogin).not.toHaveBeenCalled();
    });

    it('a wrong code is a 401 with no cookie; a locked account is a 429 with Retry-After', async () => {
      authService.completeTwoFactorLogin.mockRejectedValueOnce(new UnauthorizedException('That code did not work. Check it and try again.'));
      const wrong = await request(app.getHttpServer())
        .post('/auth/login/two-factor')
        .set(COOKIE_MODE)
        .send({ challengeToken: 'id.secret', code: '000000' })
        .expect(401);
      expect(wrong.headers['set-cookie']).toBeUndefined();

      authService.completeTwoFactorLogin.mockRejectedValueOnce(new CodeEntryLockedException(812));
      const locked = await request(app.getHttpServer())
        .post('/auth/login/two-factor')
        .send({ challengeToken: 'id.secret', code: '000000' })
        .expect(429);
      expect(locked.headers['retry-after']).toBe('812');
    });
  });
});
