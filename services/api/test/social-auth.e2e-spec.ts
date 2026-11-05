import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { RegistrationEmailService } from '../src/modules/auth/registration/email/registration-email.service';
import { SocialAuthClient, SocialProfile } from '../src/modules/social-auth/social-auth.client';
import { SocialProvider } from '../src/modules/social-auth/social-auth.constants';
import { RedisService } from '../src/redis/redis.service';
import { seedDob } from './dob-seed';
import { applyRealAuthLimits, clearAuthLimitCounters } from './auth-limits';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// ---------------------------------------------------------------------------------------------------------------
// B-084 (Decision Log #378, #468): Google / Facebook sign-in, against REAL Postgres and REAL Redis and the real
// AppModule. Only the provider's network edge is faked (SocialAuthClient), and the outgoing email is recorded.
//
// WHAT IS PROVEN HERE THAT A MOCK CANNOT SHOW
//   - provider off = nothing happens: no Redis key, no row, a 404 with a code
//   - a social sign-up creates the account AND its identity link in one create, with an unusable password that no
//     password login can match, and a second sign-in through the provider then signs the same account in
//   - the registration steps still apply: a minor needs a guardian and ends restricted-pending with a pending Guardian
//   - Facebook never auto-links; Google links only a verified email to a verified, active account; every other
//     email clash ends in ONE generic answer and writes nothing
//   - an account with two-factor on still gets the challenge; a suspended/deactivated account gets no session
//   - the SocialIdentity row is deleted when the account is anonymised
// ---------------------------------------------------------------------------------------------------------------

jest.setTimeout(180_000);

// Same value test/env.ts pins; the redirect URI the app builds is WEB + /auth/social/<provider>/callback.
const WEB = 'http://localhost:5173';
const COOKIE_MODE = { 'X-Auth-Mode': 'cookie', Origin: WEB };

class FakeProviderClient extends SocialAuthClient {
  enabled = new Set<SocialProvider>();
  profile: SocialProfile | null = null;
  isConfigured(provider: SocialProvider) {
    return this.enabled.has(provider);
  }
  buildAuthorizationUrl(provider: SocialProvider, p: { state: string; codeChallenge: string; redirectUri: string }) {
    const url = new URL(`https://idp.test/${provider}/authorize`);
    url.searchParams.set('state', p.state);
    url.searchParams.set('code_challenge', p.codeChallenge);
    url.searchParams.set('redirect_uri', p.redirectUri);
    return url.toString();
  }
  async exchangeCode() {
    if (!this.profile) throw new Error('the provider rejected the code');
    return this.profile;
  }
}

type SentCall = { method: string; args: unknown[] };

describe('Social sign-in (B-084) -- real Postgres + real Redis', () => {
  let app: INestApplication;
  let redis: RedisService;
  const provider = new FakeProviderClient();
  const sent: SentCall[] = [];
  const prisma = () => getTestPrismaClient();
  const http = () => request(app.getHttpServer());

  // Only send* methods exist: answering every property would look like a thenable and hang Nest.
  const emailRecorder = new Proxy(
    {},
    {
      get: (_t, name: string | symbol) => {
        if (typeof name !== 'string' || !name.startsWith('send')) return undefined;
        return (...args: unknown[]) => {
          sent.push({ method: name, args });
          return Promise.resolve(undefined);
        };
      },
    },
  );

  // The shared 'auth' throttler (5 per 60 s per IP, in memory for the life of an app) covers start, email-code and
  // email-code/verify. This file calls them far more often than that, so the main app runs with a high limit; the
  // limits themselves are proven in the last describe block, on apps built with their real numbers.
  const priorRateLimit = process.env.AUTH_RATE_LIMIT_MAX;

  async function buildApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RegistrationEmailService)
      .useValue(emailRecorder)
      .overrideProvider(SocialAuthClient)
      .useValue(provider)
      .compile();
    const built = moduleRef.createNestApplication();
    built.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await built.init();
    return built;
  }

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '1000';
    app = await buildApp();
    redis = app.get(RedisService);
  });

  beforeEach(async () => {
    await resetDatabase();
    const keys = await redis.keys('social:*');
    if (keys.length > 0) await redis.del(...keys);
    sent.length = 0;
    provider.enabled = new Set(['google', 'facebook']);
    provider.profile = null;
  });

  afterAll(async () => {
    await app.close();
    if (priorRateLimit === undefined) delete process.env.AUTH_RATE_LIMIT_MAX;
    else process.env.AUTH_RATE_LIMIT_MAX = priorRateLimit;
    await disconnectTestPrismaClient();
  });

  // ---------------------------------------------------------------- helpers

  const google = (over: Partial<SocialProfile> = {}): SocialProfile => ({
    provider: 'google',
    providerAccountId: 'g-100',
    displayName: 'Ada Lovelace',
    email: 'ada@example.com',
    emailVerified: true,
    ...over,
  });
  const facebook = (over: Partial<SocialProfile> = {}): SocialProfile => ({
    provider: 'facebook',
    providerAccountId: 'fb-200',
    displayName: 'Grace Hopper',
    email: 'grace@example.com',
    emailVerified: false,
    ...over,
  });

  // Runs start (so a real state is stored in Redis) and returns the state the provider would send back.
  async function startFlow(p: SocialProvider, body: Record<string, unknown> = {}): Promise<string> {
    const res = await http().post(`/auth/social/${p}/start`).send(body).expect(200);
    const url = new URL(res.body.authorizationUrl);
    expect(url.searchParams.get('redirect_uri')).toBe(`${WEB}/auth/social/${p}/callback`);
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    return url.searchParams.get('state')!;
  }

  async function callback(p: SocialProvider, profile: SocialProfile | null, headers: Record<string, string> = {}, startBody: Record<string, unknown> = {}) {
    provider.profile = profile;
    const state = await startFlow(p, startBody);
    return http().post(`/auth/social/${p}/callback`).set(headers).send({ code: 'the-code', state });
  }

  const adultBody = (token: string, over: Record<string, unknown> = {}) => ({
    socialRegistrationToken: token,
    dateOfBirth: '1990-01-01',
    countryCode: 'GB',
    ...over,
  });

  async function existingUser(over: Record<string, unknown> = {}) {
    return prisma().user.create({
      data: {
        email: 'ada@example.com',
        passwordHash: 'not-a-real-hash',
        displayName: 'Existing Ada',
        dateOfBirth: seedDob('1990-01-01'),
        isMinor: false,
        verificationStatus: 'verified',
        ...over,
      },
    });
  }

  // ---------------------------------------------------------------- provider off

  describe('built behind configuration: a provider that is off does nothing', () => {
    it('lists only the enabled providers', async () => {
      expect((await http().get('/auth/social/providers').expect(200)).body).toEqual({ providers: ['google', 'facebook'] });
      provider.enabled = new Set(['facebook']);
      expect((await http().get('/auth/social/providers').expect(200)).body).toEqual({ providers: ['facebook'] });
      provider.enabled = new Set();
      expect((await http().get('/auth/social/providers').expect(200)).body).toEqual({ providers: [] });
    });

    it('start and callback for a provider that is off are 404 with a code, and write nothing anywhere', async () => {
      provider.enabled = new Set();
      const start = await http().post('/auth/social/google/start').send({}).expect(404);
      expect(start.body.code).toBe('social_provider_unavailable');
      const cb = await http().post('/auth/social/google/callback').send({ code: 'c', state: 's' }).expect(404);
      expect(cb.body.code).toBe('social_provider_unavailable');
      expect(await redis.keys('social:*')).toEqual([]);
      expect(await prisma().user.count()).toBe(0);
      expect(await prisma().socialIdentity.count()).toBe(0);
    });

    it('an unknown provider (Apple is out of scope) is the same 404', async () => {
      const res = await http().post('/auth/social/apple/start').send({}).expect(404);
      expect(res.body.code).toBe('social_provider_unavailable');
    });

    it('the real client with the e2e placeholder keys reports every provider as off', async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      const real = moduleRef.createNestApplication();
      await real.init();
      try {
        const res = await request(real.getHttpServer()).get('/auth/social/providers').expect(200);
        expect(res.body).toEqual({ providers: [] });
        await request(real.getHttpServer()).post('/auth/social/google/start').send({}).expect(404);
      } finally {
        await real.close();
      }
    });
  });

  // ---------------------------------------------------------------- state

  describe('the OAuth state', () => {
    it('is single use, and an unknown or other-provider state is the same generic 401', async () => {
      provider.profile = google();
      const state = await startFlow('google');
      await http().post('/auth/social/facebook/callback').send({ code: 'c', state }).expect(401);
      // The cross-provider attempt consumed it.
      await http().post('/auth/social/google/callback').send({ code: 'c', state }).expect(401);
      const res = await http().post('/auth/social/google/callback').send({ code: 'c', state: 'made-up' }).expect(401);
      expect(res.body.code).toBe('social_auth_failed');
    });

    it('a provider failure is the same generic 401 and creates nothing', async () => {
      const res = await callback('google', null);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('social_auth_failed');
      expect(await prisma().user.count()).toBe(0);
    });

    it('callback and register bodies are strictly validated', async () => {
      await http().post('/auth/social/google/callback').send({ code: 'c' }).expect(400);
      await http().post('/auth/social/register').send({ socialRegistrationToken: 't', dateOfBirth: '1990-01-01', countryCode: 'GB', birthday: '1980-01-01' }).expect(400);
    });
  });

  // ---------------------------------------------------------------- new person, Google

  describe('a new person signs up with Google', () => {
    it('gets a registration token first (no account yet), then the normal registration creates the account and the link together', async () => {
      const res = await callback('google', google());
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'registration_required',
        profile: { displayName: 'Ada Lovelace', email: 'ada@example.com', emailVerified: true, needsEmail: false },
      });
      expect(res.body).not.toHaveProperty('accessToken');
      expect(await prisma().user.count()).toBe(0);
      const token = res.body.socialRegistrationToken as string;

      const created = await http().post('/auth/social/register').send(adultBody(token)).expect(201);
      expect(created.body).toMatchObject({ user: { email: 'ada@example.com', verificationStatus: 'verified', isMinor: false } });
      expect(created.body.accessToken).toBeTruthy();

      const user = await prisma().user.findUniqueOrThrow({ where: { email: 'ada@example.com' }, include: { socialIdentities: true } });
      expect(user.verificationStatus).toBe('verified');
      expect(user.socialIdentities).toEqual([expect.objectContaining({ provider: 'google', providerAccountId: 'g-100' })]);
      // Google vouched for the address: no verification email.
      expect(sent.filter((c) => c.method === 'sendVerificationEmail')).toHaveLength(0);
      // The provider's own birthday is nowhere: the date of birth is the Age Gate's, encrypted.
      expect(user.dateOfBirth).toMatch(/^v\d+:/);
    });

    it('the password is unusable: argon2id, and no password login succeeds for the account', async () => {
      const token = (await callback('google', google())).body.socialRegistrationToken as string;
      await http().post('/auth/social/register').send(adultBody(token)).expect(201);
      const user = await prisma().user.findUniqueOrThrow({ where: { email: 'ada@example.com' } });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      for (const guess of ['password', 'ada@example.com', 'Ada Lovelace', 'g-100', '']) {
        const login = await http().post('/auth/login').send({ email: 'ada@example.com', password: guess.padEnd(8, 'x') });
        expect(login.status).toBe(401);
      }
    });

    it('a second sign-in through the provider signs the SAME account in (a session in the body, or a cookie in cookie mode)', async () => {
      const token = (await callback('google', google())).body.socialRegistrationToken as string;
      const created = await http().post('/auth/social/register').send(adultBody(token)).expect(201);
      const userId = created.body.user.id as string;

      const again = await callback('google', google());
      expect(again.status).toBe(200);
      expect(again.body).toMatchObject({ status: 'signed_in', user: { id: userId } });
      expect(again.body.accessToken).toBeTruthy();
      const me = await http().get(`/users/${userId}`).set('Authorization', `Bearer ${again.body.accessToken}`).expect(200);
      expect(me.body.id).toBe(userId);

      const cookie = await callback('google', google(), COOKIE_MODE, { staySignedIn: true });
      expect(cookie.body.status).toBe('signed_in');
      expect(cookie.body).not.toHaveProperty('refreshToken');
      expect(String(cookie.headers['set-cookie'])).toMatch(/sn_rt=.*HttpOnly/i);
      expect(await prisma().user.count()).toBe(1);
    });

    it('the registration token is single use: a replay after success is refused and creates nothing', async () => {
      const token = (await callback('google', google())).body.socialRegistrationToken as string;
      await http().post('/auth/social/register').send(adultBody(token)).expect(201);
      const replay = await http().post('/auth/social/register').send(adultBody(token)).expect(400);
      expect(replay.body.code).toBe('social_registration_invalid');
      expect(await prisma().user.count()).toBe(1);
    });

    it('two simultaneous completions of one token create exactly one account', async () => {
      const token = (await callback('google', google())).body.socialRegistrationToken as string;
      await app.listen(0);
      const results = await Promise.all([
        http().post('/auth/social/register').send(adultBody(token)),
        http().post('/auth/social/register').send(adultBody(token)),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)?.body.code).toBe('social_signup_unavailable');
      expect(await prisma().user.count()).toBe(1);
      expect(await prisma().socialIdentity.count()).toBe(1);
    });

    it('a rejected registration (a date of birth under the minimum age) writes nothing and leaves the token usable', async () => {
      const token = (await callback('google', google())).body.socialRegistrationToken as string;
      const young = new Date(Date.now() - 2 * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const res = await http().post('/auth/social/register').send(adultBody(token, { dateOfBirth: young })).expect(400);
      expect(res.body.code).toBe('below_minimum_age');
      expect(await prisma().user.count()).toBe(0);
      await http().post('/auth/social/register').send(adultBody(token)).expect(201);
    });
  });

  // ---------------------------------------------------------------- minors

  describe('the Age Gate and the guardian flow always apply', () => {
    const GUARDIAN = { name: 'Mum Lovelace', email: 'mum@example.com', relationship: 'Parent' };

    it('a minor via social sign-in needs guardian details, and then ends restricted-pending with a pending Guardian and the consent email', async () => {
      const token = (await callback('google', google())).body.socialRegistrationToken as string;
      const noGuardian = await http().post('/auth/social/register').send(adultBody(token, { dateOfBirth: '2012-05-01' })).expect(400);
      expect(noGuardian.body.message).toMatch(/guardian/i);
      expect(await prisma().user.count()).toBe(0);

      const created = await http()
        .post('/auth/social/register')
        .send(adultBody(token, { dateOfBirth: '2012-05-01', guardian: GUARDIAN }))
        .expect(201);
      expect(created.body.user).toMatchObject({ isMinor: true, nextStep: 'restricted_pending' });
      const guardian = await prisma().guardian.findUniqueOrThrow({ where: { minorUserId: created.body.user.id } });
      expect(guardian).toMatchObject({ email: 'mum@example.com', consentStatus: 'pending' });
      expect(sent.filter((c) => c.method === 'sendGuardianConsentEmail')).toHaveLength(1);
      // Still the child's Google-verified email, still linked.
      expect(await prisma().socialIdentity.count()).toBe(1);
    });

    it('a minor cannot name their own address as the guardian', async () => {
      const token = (await callback('google', google())).body.socialRegistrationToken as string;
      const res = await http()
        .post('/auth/social/register')
        .send(adultBody(token, { dateOfBirth: '2012-05-01', guardian: { ...GUARDIAN, email: 'ada@example.com' } }))
        .expect(400);
      expect(res.body.message).toMatch(/own email/i);
      expect(await prisma().user.count()).toBe(0);
    });
  });

  // ---------------------------------------------------------------- Facebook

  describe('Facebook', () => {
    it('with an email: it is UNVERIFIED and gets the usual verification email', async () => {
      const res = await callback('facebook', facebook());
      expect(res.body.profile).toMatchObject({ email: 'grace@example.com', emailVerified: false, needsEmail: false });
      await http().post('/auth/social/register').send(adultBody(res.body.socialRegistrationToken)).expect(201);
      const user = await prisma().user.findUniqueOrThrow({ where: { email: 'grace@example.com' } });
      expect(user.verificationStatus).toBe('unverified');
      expect(sent.filter((c) => c.method === 'sendVerificationEmail')).toEqual([
        expect.objectContaining({ args: ['grace@example.com', expect.any(String)] }),
      ]);
    });

    it('with NO email: the person enters one and verifies it with a code BEFORE any account exists', async () => {
      const res = await callback('facebook', facebook({ email: null }));
      expect(res.body.profile).toMatchObject({ email: null, needsEmail: true });
      const token = res.body.socialRegistrationToken as string;

      // No account can be made until an email exists on the token.
      const early = await http().post('/auth/social/register').send(adultBody(token)).expect(400);
      expect(early.body.code).toBe('social_email_required');
      expect(await prisma().user.count()).toBe(0);

      await http().post('/auth/social/email-code').send({ socialRegistrationToken: token, email: 'Me@Example.com' }).expect(200, { sent: true });
      const call = sent.find((c) => c.method === 'sendSocialEmailCodeEmail')!;
      expect(call.args[0]).toBe('me@example.com');
      const code = call.args[1] as string;
      expect(code).toMatch(/^\d{6}$/);

      const wrong = code === '000000' ? '000001' : '000000';
      const bad = await http().post('/auth/social/email-code/verify').send({ socialRegistrationToken: token, code: wrong }).expect(400);
      expect(bad.body.code).toBe('social_email_code_invalid');
      expect(await prisma().user.count()).toBe(0);

      await http().post('/auth/social/email-code/verify').send({ socialRegistrationToken: token, code }).expect(200, { email: 'me@example.com', emailVerified: true });
      const created = await http().post('/auth/social/register').send(adultBody(token)).expect(201);
      expect(created.body.user).toMatchObject({ email: 'me@example.com', verificationStatus: 'verified' });
      // We proved the address ourselves, so no second verification email.
      expect(sent.filter((c) => c.method === 'sendVerificationEmail')).toHaveLength(0);
    });

    it('the code is single use, bound to its registration, and limited in sends and guesses', async () => {
      const a = (await callback('facebook', facebook({ email: null }))).body.socialRegistrationToken as string;
      const b = (await callback('facebook', facebook({ email: null, providerAccountId: 'fb-201' }))).body.socialRegistrationToken as string;
      await http().post('/auth/social/email-code').send({ socialRegistrationToken: a, email: 'a@example.com' }).expect(200);
      const code = sent.find((c) => c.method === 'sendSocialEmailCodeEmail')!.args[1] as string;
      // Another registration cannot use it.
      await http().post('/auth/social/email-code').send({ socialRegistrationToken: b, email: 'b@example.com' }).expect(200);
      await http().post('/auth/social/email-code/verify').send({ socialRegistrationToken: b, code }).expect(400);
      // Single use.
      await http().post('/auth/social/email-code/verify').send({ socialRegistrationToken: a, code }).expect(200);
      await http().post('/auth/social/email-code/verify').send({ socialRegistrationToken: a, code }).expect(400);
      // An address was already verified on `a`, so another code for it is refused.
      await http().post('/auth/social/email-code').send({ socialRegistrationToken: a, email: 'x@example.com' }).expect(400);

      // A third and fourth send for `b`: the cap is three per registration.
      await http().post('/auth/social/email-code').send({ socialRegistrationToken: b, email: 'b@example.com' }).expect(200);
      await http().post('/auth/social/email-code').send({ socialRegistrationToken: b, email: 'b@example.com' }).expect(200);
      const capped = await http().post('/auth/social/email-code').send({ socialRegistrationToken: b, email: 'b@example.com' }).expect(429);
      expect(capped.body.code).toBe('social_email_code_rate_limited');
    });

    it('the email-code answer is identical for an address that already has an account', async () => {
      await existingUser({ email: 'taken@example.com' });
      const token = (await callback('facebook', facebook({ email: null }))).body.socialRegistrationToken as string;
      const taken = await http().post('/auth/social/email-code').send({ socialRegistrationToken: token, email: 'taken@example.com' });
      const fresh = await http().post('/auth/social/email-code').send({ socialRegistrationToken: token, email: 'fresh@example.com' });
      expect([taken.status, taken.body]).toEqual([fresh.status, fresh.body]);
    });
  });

  // ---------------------------------------------------------------- linking rules

  describe('an email that already has an account (adopted default c)', () => {
    it('Facebook NEVER links, even when its email matches a verified active account: the same answer as a new person, then one generic refusal, nothing written', async () => {
      const existing = await existingUser();
      const taken = await callback('facebook', facebook({ email: 'ada@example.com' }));
      const fresh = await callback('facebook', facebook({ email: 'brand-new@example.com', providerAccountId: 'fb-300' }));
      expect(taken.status).toBe(200);
      expect(Object.keys(taken.body).sort()).toEqual(Object.keys(fresh.body).sort());
      expect(taken.body.status).toBe('registration_required');

      const refused = await http().post('/auth/social/register').send(adultBody(taken.body.socialRegistrationToken)).expect(409);
      expect(refused.body.code).toBe('social_signup_unavailable');
      expect(refused.body.message).toMatch(/sign in with your email and password/i);
      expect(await prisma().socialIdentity.count()).toBe(0);
      expect(await prisma().user.count()).toBe(1);
      expect((await prisma().user.findUniqueOrThrow({ where: { id: existing.id } })).passwordHash).toBe('not-a-real-hash');
    });

    it('Google with a provider-verified email links a VERIFIED ACTIVE account and signs it in (no new account)', async () => {
      const existing = await existingUser();
      const res = await callback('google', google());
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'signed_in', user: { id: existing.id } });
      expect(await prisma().user.count()).toBe(1);
      expect(await prisma().socialIdentity.findMany()).toEqual([
        expect.objectContaining({ userId: existing.id, provider: 'google', providerAccountId: 'g-100' }),
      ]);
    });

    it.each([
      ['whose own email is UNVERIFIED', { verificationStatus: 'unverified' }],
      ['that is deactivated', { accountStatus: 'deactivated' }],
      ['that is suspended', { accountStatus: 'suspended' }],
    ])('Google + verified email but the existing account is %s: NO link, then the generic refusal', async (_n, over) => {
      await existingUser(over);
      const res = await callback('google', google());
      expect(res.body.status).toBe('registration_required');
      await http().post('/auth/social/register').send(adultBody(res.body.socialRegistrationToken)).expect(409);
      expect(await prisma().socialIdentity.count()).toBe(0);
    });

    it('Google with an email Google does NOT vouch for never links', async () => {
      await existingUser();
      const res = await callback('google', google({ emailVerified: false }));
      expect(res.body.status).toBe('registration_required');
      expect(await prisma().socialIdentity.count()).toBe(0);
    });
  });

  // ---------------------------------------------------------------- the shared sign-in

  describe('an existing identity goes through the same sign-in as the password login', () => {
    async function linkedUser(over: Record<string, unknown> = {}) {
      const user = await existingUser(over);
      await prisma().socialIdentity.create({ data: { provider: 'google', providerAccountId: 'g-100', userId: user.id } });
      return user;
    }

    it('two-factor on: the callback returns the challenge, no tokens, no cookie', async () => {
      await linkedUser({ totpEnabledAt: new Date() });
      const res = await callback('google', google(), COOKIE_MODE);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'two_factor_required', twoFactorRequired: true });
      expect(res.body.challengeToken).toBeTruthy();
      expect(res.body).not.toHaveProperty('accessToken');
      expect(res.headers['set-cookie']).toBeUndefined();
      // The challenge is finished by the same endpoint as after a password; a wrong code is refused.
      await http().post('/auth/login/two-factor').send({ challengeToken: res.body.challengeToken, code: '000000' }).expect(401);
    });

    it('a suspended account gets no session (the generic refusal), a deactivated one the deactivated code', async () => {
      const suspended = await linkedUser({ accountStatus: 'suspended' });
      const s = await callback('google', google());
      expect(s.status).toBe(401);
      expect(s.body).not.toHaveProperty('accessToken');
      await prisma().user.update({ where: { id: suspended.id }, data: { accountStatus: 'deactivated' } });
      const d = await callback('google', google());
      expect(d.status).toBe(401);
      expect(d.body.code).toBe('account_deactivated');
    });

    it('a Google identity never matches a Facebook one with the same provider id', async () => {
      await linkedUser();
      const res = await callback('facebook', facebook({ providerAccountId: 'g-100', email: null }));
      expect(res.body.status).toBe('registration_required');
    });
  });

  // ---------------------------------------------------------------- limits

  describe('the rate limits are the shared auth limiters, with their real numbers', () => {
    it('start, email-code and verify each carry the shared per-IP auth limit (AUTH_RATE_LIMIT_MAX, one bucket per route): the third request inside a minute is a 429 when it is 2', async () => {
      process.env.AUTH_RATE_LIMIT_MAX = '2';
      const limited = await buildApp();
      try {
        const routes: [string, Record<string, unknown>][] = [
          ['/auth/social/google/start', {}],
          // Not a valid request (the token is unknown): the guard runs before validation and the service, so these
          // count against the limit whatever they answer.
          ['/auth/social/email-code', { socialRegistrationToken: 't', email: 'a@b.test' }],
          ['/auth/social/email-code/verify', { socialRegistrationToken: 't', code: '123456' }],
        ];
        for (const [url, body] of routes) {
          const post = () => request(limited.getHttpServer()).post(url).send(body);
          expect((await post()).status).not.toBe(429);
          expect((await post()).status).not.toBe(429);
          expect((await post()).status).toBe(429);
        }
      } finally {
        process.env.AUTH_RATE_LIMIT_MAX = '1000';
        await limited.close();
      }
    });

    it('the callback is under the per-IP ceiling of the password login (60 per 10 minutes): the 61st attempt is a 429 with Retry-After', async () => {
      const restore = applyRealAuthLimits();
      const real = await buildApp();
      try {
        await clearAuthLimitCounters(real);
        const attempt = () => request(real.getHttpServer()).post('/auth/social/google/callback').send({ code: 'c', state: 'not-a-real-state' });
        for (let i = 0; i < 60; i += 1) {
          const res = await attempt();
          expect(res.status).toBe(401);
        }
        const over = await attempt();
        expect(over.status).toBe(429);
        expect(Number(over.headers['retry-after'])).toBeGreaterThan(0);
        // Registration is its own ceiling (signup): not spent by the callback attempts above.
        await clearAuthLimitCounters(real);
      } finally {
        restore();
        await real.close();
      }
    });
  });

  // ---------------------------------------------------------------- account deletion

  describe('account deletion', () => {
    it('anonymising an account deletes its social identity links', async () => {
      const user = await existingUser();
      await prisma().socialIdentity.create({ data: { provider: 'google', providerAccountId: 'g-100', userId: user.id } });
      await prisma().socialIdentity.create({ data: { provider: 'facebook', providerAccountId: 'fb-1', userId: user.id } });
      await app.get(AccountDeletionSweepService).anonymizeUser(user.id, false);
      expect(await prisma().socialIdentity.count({ where: { userId: user.id } })).toBe(0);
      // The identity is free again: the same Google account can sign up afresh.
      const res = await callback('google', google({ email: 'someone-new@example.com' }));
      expect(res.body.status).toBe('registration_required');
    });

    it('deleting the User row cascades the links away too (the FK is ON DELETE CASCADE)', async () => {
      const user = await existingUser();
      await prisma().socialIdentity.create({ data: { provider: 'google', providerAccountId: 'g-100', userId: user.id } });
      await prisma().user.delete({ where: { id: user.id } });
      expect(await prisma().socialIdentity.count()).toBe(0);
    });

    it('a provider identity belongs to exactly one account (unique), enforced by the database', async () => {
      const a = await existingUser();
      const b = await existingUser({ email: 'other@example.com' });
      await prisma().socialIdentity.create({ data: { provider: 'google', providerAccountId: 'g-100', userId: a.id } });
      await expect(
        prisma().socialIdentity.create({ data: { provider: 'google', providerAccountId: 'g-100', userId: b.id } }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });
});
