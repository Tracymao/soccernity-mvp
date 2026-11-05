import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthLimitsInterceptor } from '../auth/rate-limit/auth-limits/auth-limits.interceptor';
import { AuthThrottlerGuard } from '../auth/rate-limit/auth-throttler.guard';
import { SocialAuthController } from './social-auth.controller';
import { SocialAuthService } from './social-auth.service';

// The HTTP layer of social sign-in (B-084): routing, validation, what each outcome looks like on the wire, and the
// session cookie. The rules themselves are social-auth.service.spec.ts.
const COOKIE_MODE = { 'X-Auth-Mode': 'cookie', Origin: 'http://localhost:5173' };
const SESSION = {
  accessToken: 'access',
  accessTokenExpiresIn: 900,
  refreshToken: 'refresh-id.secret',
  refreshTokenExpiresAt: new Date('2030-01-01T00:00:00.000Z').toISOString(),
  user: { id: 'user-1' },
};
const CHALLENGE = { twoFactorRequired: true as const, challengeToken: 'chal', challengeExpiresInSeconds: 300 };

const registerResult = () => ({
  user: {
    id: 'new-1',
    email: 'ada@example.com',
    phone: null,
    displayName: 'Ada',
    username: null,
    isMinor: false,
    role: 'user',
    verificationStatus: 'verified',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  },
  dateOfBirth: new Date('2000-01-01T00:00:00.000Z'),
  guardian: null,
  tokens: {
    accessToken: { token: 'a-tok', expiresIn: 900 },
    refreshToken: { token: 'r-tok', expiresAt: new Date('2030-01-01T00:00:00.000Z') },
    persistent: false,
  },
});

describe('SocialAuthController (HTTP layer)', () => {
  let app: INestApplication;
  const service = {
    enabledProviders: jest.fn(),
    start: jest.fn(),
    handleCallback: jest.fn(),
    requestEmailCode: jest.fn(),
    verifyEmailCode: jest.fn(),
    completeRegistration: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SocialAuthController],
      providers: [{ provide: SocialAuthService, useValue: service }],
    })
      .overrideInterceptor(AuthLimitsInterceptor)
      .useValue({ intercept: (_ctx: unknown, next: { handle(): unknown }) => next.handle() })
      .overrideGuard(AuthThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  beforeEach(() => jest.resetAllMocks());
  afterAll(async () => {
    await app.close();
  });
  const http = () => request(app.getHttpServer());

  describe('GET /auth/social/providers', () => {
    it('lists the enabled providers, and nothing else (no keys, no account information)', async () => {
      service.enabledProviders.mockReturnValue(['google']);
      const res = await http().get('/auth/social/providers').expect(200);
      expect(res.body).toEqual({ providers: ['google'] });
    });

    it('is an empty list when nothing is switched on', async () => {
      service.enabledProviders.mockReturnValue([]);
      expect((await http().get('/auth/social/providers').expect(200)).body).toEqual({ providers: [] });
    });
  });

  describe('provider routes', () => {
    it.each([
      ['start', {}],
      ['callback', { code: 'c', state: 's' }],
    ])('an unknown provider is a 404 with the same code as a disabled one, and the service is not reached (%s)', async (route, body) => {
      const res = await http().post(`/auth/social/apple/${route}`).send(body).expect(404);
      expect(res.body.code).toBe('social_provider_unavailable');
      expect(service.start).not.toHaveBeenCalled();
      expect(service.handleCallback).not.toHaveBeenCalled();
    });

    it('start returns the authorisation URL and passes the stay-signed-in choice', async () => {
      service.start.mockResolvedValue({ authorizationUrl: 'https://idp.test/x' });
      const res = await http().post('/auth/social/google/start').send({ staySignedIn: true }).expect(200);
      expect(res.body).toEqual({ authorizationUrl: 'https://idp.test/x' });
      expect(service.start).toHaveBeenCalledWith('google', true);
    });

    it('start defaults to a session cookie, and rejects a non-boolean choice and unknown fields', async () => {
      service.start.mockResolvedValue({ authorizationUrl: 'u' });
      await http().post('/auth/social/facebook/start').send({}).expect(200);
      expect(service.start).toHaveBeenCalledWith('facebook', false);
      await http().post('/auth/social/google/start').send({ staySignedIn: 'yes' }).expect(400);
      await http().post('/auth/social/google/start').send({ redirectUri: 'https://evil.test' }).expect(400);
    });

    it('a start for a provider that is switched off carries the service 404', async () => {
      service.start.mockRejectedValue(new NotFoundException({ code: 'social_provider_unavailable' }));
      await http().post('/auth/social/google/start').send({}).expect(404);
    });
  });

  describe('POST /auth/social/:provider/callback', () => {
    it('validates the body: code and state are required strings, nothing else is accepted', async () => {
      await http().post('/auth/social/google/callback').send({ state: 's' }).expect(400);
      await http().post('/auth/social/google/callback').send({ code: 'c' }).expect(400);
      await http().post('/auth/social/google/callback').send({ code: 'c', state: 's', email: 'a@b.test' }).expect(400);
      expect(service.handleCallback).not.toHaveBeenCalled();
    });

    it('a known identity: 200 signed_in with the session in the body (native client, no cookie)', async () => {
      service.handleCallback.mockResolvedValue({ kind: 'session', response: SESSION, persistent: false });
      const res = await http().post('/auth/social/google/callback').send({ code: 'c', state: 's' }).expect(200);
      expect(res.body).toMatchObject({ status: 'signed_in', accessToken: 'access', refreshToken: 'refresh-id.secret' });
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(service.handleCallback).toHaveBeenCalledWith('google', 'c', 's');
    });

    it('in cookie mode the refresh token goes into the httpOnly cookie and is NOT in the body, exactly as for a password login', async () => {
      service.handleCallback.mockResolvedValue({ kind: 'session', response: SESSION, persistent: true });
      const res = await http().post('/auth/social/google/callback').set(COOKIE_MODE).send({ code: 'c', state: 's' }).expect(200);
      expect(res.body.status).toBe('signed_in');
      expect(res.body).not.toHaveProperty('refreshToken');
      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toContain('sn_rt=');
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Max-Age=/i); // stay signed in: a persistent cookie
    });

    it('a session started without "stay signed in" is a session cookie (no Max-Age)', async () => {
      service.handleCallback.mockResolvedValue({ kind: 'session', response: SESSION, persistent: false });
      const res = await http().post('/auth/social/google/callback').set(COOKIE_MODE).send({ code: 'c', state: 's' }).expect(200);
      expect(String(res.headers['set-cookie'])).not.toMatch(/Max-Age=/i);
    });

    it('an account with two-factor on gets the challenge: no tokens and NO cookie, even in cookie mode', async () => {
      service.handleCallback.mockResolvedValue({ kind: 'two_factor_required', challenge: CHALLENGE });
      const res = await http().post('/auth/social/google/callback').set(COOKIE_MODE).send({ code: 'c', state: 's' }).expect(200);
      expect(res.body).toEqual({ status: 'two_factor_required', ...CHALLENGE });
      expect(res.body).not.toHaveProperty('accessToken');
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('a new person: registration_required with the token and the profile, and no cookie', async () => {
      const profile = { displayName: 'Ada', email: null, emailVerified: false, needsEmail: true };
      service.handleCallback.mockResolvedValue({ kind: 'registration_required', socialRegistrationToken: 'tok', profile });
      const res = await http().post('/auth/social/facebook/callback').set(COOKIE_MODE).send({ code: 'c', state: 's' }).expect(200);
      expect(res.body).toEqual({ status: 'registration_required', socialRegistrationToken: 'tok', profile });
      expect(res.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('email code routes do not clash with the provider routes', () => {
    it('POST /auth/social/email-code reaches the email handler (not ":provider/start")', async () => {
      service.requestEmailCode.mockResolvedValue({ sent: true });
      const res = await http().post('/auth/social/email-code').send({ socialRegistrationToken: 't', email: 'a@b.test' }).expect(200);
      expect(res.body).toEqual({ sent: true });
      expect(service.requestEmailCode).toHaveBeenCalledWith('t', 'a@b.test');
      expect(service.start).not.toHaveBeenCalled();
    });

    it('POST /auth/social/email-code/verify reaches the verify handler', async () => {
      service.verifyEmailCode.mockResolvedValue({ email: 'a@b.test', emailVerified: true });
      const res = await http().post('/auth/social/email-code/verify').send({ socialRegistrationToken: 't', code: '123456' }).expect(200);
      expect(res.body).toEqual({ email: 'a@b.test', emailVerified: true });
      expect(service.verifyEmailCode).toHaveBeenCalledWith('t', '123456');
    });

    it.each([
      ['a malformed email', '/auth/social/email-code', { socialRegistrationToken: 't', email: 'not-an-email' }],
      ['no token', '/auth/social/email-code', { email: 'a@b.test' }],
      ['a code that is not six digits', '/auth/social/email-code/verify', { socialRegistrationToken: 't', code: '12345' }],
      ['letters in the code', '/auth/social/email-code/verify', { socialRegistrationToken: 't', code: '12345a' }],
    ])('validation: %s -> 400', async (_n, url, body) => {
      await http().post(url).send(body).expect(400);
      expect(service.requestEmailCode).not.toHaveBeenCalled();
      expect(service.verifyEmailCode).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/social/register', () => {
    const BODY = { socialRegistrationToken: 'tok', dateOfBirth: '2000-01-01', countryCode: 'gb' };

    it('201 with the SAME body as POST /auth/register, and the client IP handed to the registration', async () => {
      service.completeRegistration.mockResolvedValue(registerResult());
      const res = await http().post('/auth/social/register').send(BODY).expect(201);
      expect(res.body).toMatchObject({ accessToken: 'a-tok', refreshToken: 'r-tok', guardian: null });
      expect(res.body.user).toMatchObject({ id: 'new-1', email: 'ada@example.com', verificationStatus: 'verified' });
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(service.completeRegistration).toHaveBeenCalledWith(expect.objectContaining(BODY), expect.any(String));
    });

    it('in cookie mode the refresh token is a SESSION cookie (register has no stay-signed-in choice)', async () => {
      service.completeRegistration.mockResolvedValue(registerResult());
      const res = await http().post('/auth/social/register').set(COOKIE_MODE).send(BODY).expect(201);
      expect(res.body).not.toHaveProperty('refreshToken');
      expect(String(res.headers['set-cookie'])).toContain('sn_rt=');
      expect(String(res.headers['set-cookie'])).not.toMatch(/Max-Age=/i);
    });

    it('accepts the Age Gate guardian block and a club, exactly like email registration', async () => {
      service.completeRegistration.mockResolvedValue(registerResult());
      const body = {
        ...BODY,
        dateOfBirth: '2012-01-01',
        guardian: { name: 'Mum', email: 'mum@example.com', relationship: 'Parent' },
        clubId: '8a0f2d52-3b2f-4a7e-9f0e-0a6d6f3f0c11',
      };
      await http().post('/auth/social/register').send(body).expect(201);
      expect(service.completeRegistration.mock.calls[0][0]).toMatchObject(body);
    });

    it.each([
      ['an email (it comes from the token)', { email: 'x@y.test' }],
      ['a password (there is none)', { password: 'long-enough-1' }],
      ["the provider's birthday (it is never used)", { birthday: '1990-01-01' }],
      ['a provider account id (it comes from the token)', { providerAccountId: 'g-1' }],
    ])('a body that carries %s is refused (400): nothing but the token can supply those', async (_n, extra) => {
      await http().post('/auth/social/register').send({ ...BODY, ...extra }).expect(400);
      expect(service.completeRegistration).not.toHaveBeenCalled();
    });

    it.each([
      ['no token', { dateOfBirth: '2000-01-01', countryCode: 'GB' }],
      ['no date of birth', { socialRegistrationToken: 't', countryCode: 'GB' }],
      ['no country', { socialRegistrationToken: 't', dateOfBirth: '2000-01-01' }],
      ['a bad country', { socialRegistrationToken: 't', dateOfBirth: '2000-01-01', countryCode: 'GBR' }],
      ['a bad date', { socialRegistrationToken: 't', dateOfBirth: 'yesterday', countryCode: 'GB' }],
    ])('validation: %s -> 400', async (_n, body) => {
      await http().post('/auth/social/register').send(body).expect(400);
      expect(service.completeRegistration).not.toHaveBeenCalled();
    });
  });
});
