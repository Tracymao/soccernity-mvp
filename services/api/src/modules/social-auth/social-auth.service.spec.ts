import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { SocialAuthClient, SocialProfile } from './social-auth.client';
import { SocialProvider } from './social-auth.constants';
import { SocialAuthService } from './social-auth.service';
import { SocialAuthStateStore, SocialRegistrationStore } from './social-auth.stores';
import { FakeRedis } from './social-auth.test-support';

// The social sign-in rules (B-084, Decision Log #378, #468), against an in-memory Redis and a fake provider client.
// Nothing here reaches a network or a database; the real-Postgres proof is test/social-auth.e2e-spec.ts.

const WEB = 'https://app.soccernity.test';

class FakeClient extends SocialAuthClient {
  enabled = new Set<SocialProvider>(['google', 'facebook']);
  profile: SocialProfile | Error = google({});
  exchanged: { provider: SocialProvider; code: string; codeVerifier: string; redirectUri: string }[] = [];
  isConfigured(provider: SocialProvider) {
    return this.enabled.has(provider);
  }
  buildAuthorizationUrl(provider: SocialProvider, p: { state: string; codeChallenge: string; redirectUri: string }) {
    return `https://idp.test/${provider}?state=${p.state}&cc=${p.codeChallenge}&ru=${encodeURIComponent(p.redirectUri)}`;
  }
  async exchangeCode(provider: SocialProvider, p: { code: string; codeVerifier: string; redirectUri: string }) {
    this.exchanged.push({ provider, ...p });
    if (this.profile instanceof Error) throw this.profile;
    return this.profile;
  }
}

function google(over: Partial<SocialProfile>): SocialProfile {
  return {
    provider: 'google',
    providerAccountId: 'g-1',
    displayName: 'Ada',
    email: 'ada@example.com',
    emailVerified: true,
    ...over,
  };
}
function facebook(over: Partial<SocialProfile>): SocialProfile {
  return {
    provider: 'facebook',
    providerAccountId: 'fb-1',
    displayName: 'Grace',
    email: 'grace@example.com',
    emailVerified: false,
    ...over,
  };
}

const user = (over: Record<string, unknown> = {}) => ({
  id: 'user-1',
  email: 'ada@example.com',
  verificationStatus: 'verified',
  accountStatus: 'active',
  ...over,
});

function build(env: Record<string, string | undefined> = { WEB_APP_BASE_URL: WEB }) {
  const redis = new FakeRedis();
  const client = new FakeClient();
  const prisma = {
    socialIdentity: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const auth = { signInVerifiedUser: jest.fn() };
  const registration = { register: jest.fn() };
  const emailService = { sendSocialEmailCodeEmail: jest.fn().mockResolvedValue(undefined) };
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  const states = new SocialAuthStateStore(redis);
  const registrations = new SocialRegistrationStore(redis);
  const service = new SocialAuthService(
    prisma as never,
    client,
    states,
    registrations,
    auth as never,
    registration as never,
    emailService as never,
    config,
  );
  return { service, redis, client, prisma, auth, registration, emailService, states, registrations };
}

// Runs start() and returns the state the provider would send back.
async function started(ctx: ReturnType<typeof build>, provider: SocialProvider = 'google', stay = false) {
  const { authorizationUrl } = await ctx.service.start(provider, stay);
  return new URL(authorizationUrl).searchParams.get('state')!;
}

const SESSION = { accessToken: 'a', refreshToken: 'r', user: { id: 'user-1' } };
const CHALLENGE = { twoFactorRequired: true as const, challengeToken: 'c', challengeExpiresInSeconds: 300 };

describe('SocialAuthService', () => {
  describe('providers are built behind configuration', () => {
    it('lists exactly the providers whose keys are set', () => {
      const ctx = build();
      expect(ctx.service.enabledProviders()).toEqual(['google', 'facebook']);
      ctx.client.enabled = new Set(['facebook']);
      expect(ctx.service.enabledProviders()).toEqual(['facebook']);
      ctx.client.enabled = new Set();
      expect(ctx.service.enabledProviders()).toEqual([]);
    });

    it.each([
      ['unset', undefined],
      ['blank', ' '],
      ['a placeholder host', 'https://app.example'],
      ['plain http outside localhost', 'http://app.soccernity.test'],
    ])('with an unusable WEB_APP_BASE_URL (%s) NO provider is enabled, keys or not', (_n, value) => {
      const ctx = build({ WEB_APP_BASE_URL: value });
      expect(ctx.service.enabledProviders()).toEqual([]);
    });

    it('start on a provider that is off is a 404 with a code, and creates no state at all', async () => {
      const ctx = build();
      ctx.client.enabled = new Set();
      await expect(ctx.service.start('google', false)).rejects.toMatchObject({
        status: 404,
        response: { code: 'social_provider_unavailable' },
      });
      expect(ctx.redis.data.size).toBe(0);
    });

    it('callback on a provider that is off is a 404 and touches neither Redis, the provider nor the database', async () => {
      const ctx = build();
      ctx.client.enabled = new Set();
      await expect(ctx.service.handleCallback('google', 'code', 'state')).rejects.toMatchObject({ status: 404 });
      expect(ctx.client.exchanged).toHaveLength(0);
      expect(ctx.prisma.socialIdentity.findUnique).not.toHaveBeenCalled();
      expect(ctx.auth.signInVerifiedUser).not.toHaveBeenCalled();
    });

    it('start returns the provider URL with the state, the PKCE challenge and the redirect page on the web app', async () => {
      const ctx = build();
      const { authorizationUrl } = await ctx.service.start('google', false);
      const url = new URL(authorizationUrl);
      expect(url.searchParams.get('state')).toBeTruthy();
      expect(url.searchParams.get('cc')).toBeTruthy();
      expect(url.searchParams.get('ru')).toBe(`${WEB}/auth/social/google/callback`);
    });
  });

  describe('the callback: state and provider failures', () => {
    it('an unknown, spent or other-provider state is the same generic 401, and the provider is never called', async () => {
      const ctx = build();
      const state = await started(ctx, 'google');
      await expect(ctx.service.handleCallback('google', 'c', 'never-issued')).rejects.toMatchObject({
        status: 401,
        response: { code: 'social_auth_failed' },
      });
      await expect(ctx.service.handleCallback('facebook', 'c', state)).rejects.toMatchObject({ status: 401 });
      // The cross-provider attempt consumed it, so the right provider cannot reuse it either.
      await expect(ctx.service.handleCallback('google', 'c', state)).rejects.toMatchObject({ status: 401 });
      expect(ctx.client.exchanged).toHaveLength(0);
    });

    it('passes the PKCE verifier and the redirect URI to the provider exchange', async () => {
      const ctx = build();
      const state = await started(ctx);
      ctx.auth.signInVerifiedUser.mockResolvedValue(SESSION);
      ctx.prisma.socialIdentity.findUnique.mockResolvedValue({ user: user() });
      await ctx.service.handleCallback('google', 'the-code', state);
      expect(ctx.client.exchanged).toEqual([
        expect.objectContaining({ provider: 'google', code: 'the-code', redirectUri: `${WEB}/auth/social/google/callback`, codeVerifier: expect.any(String) }),
      ]);
    });

    it('a failed code exchange is the generic 401 and leaks nothing from the provider error', async () => {
      const ctx = build();
      ctx.client.profile = new Error('provider said: secret@person.test code=abc');
      const state = await started(ctx);
      const err = await ctx.service.handleCallback('google', 'abc', state).catch((e) => e);
      expect(err.status).toBe(401);
      expect(JSON.stringify(err.response)).not.toMatch(/secret@person|abc/);
    });

    it('a state is single use even when the exchange then fails', async () => {
      const ctx = build();
      ctx.client.profile = new Error('boom');
      const state = await started(ctx);
      await expect(ctx.service.handleCallback('google', 'c', state)).rejects.toMatchObject({ status: 401 });
      ctx.client.profile = google({});
      await expect(ctx.service.handleCallback('google', 'c', state)).rejects.toMatchObject({ status: 401 });
      expect(ctx.client.exchanged).toHaveLength(1);
    });
  });

  describe('a known identity signs in through the SAME code as the password login', () => {
    it('calls AuthService.signInVerifiedUser with the linked user and the persistence chosen at start', async () => {
      const ctx = build();
      const linked = user({ id: 'linked' });
      ctx.prisma.socialIdentity.findUnique.mockResolvedValue({ user: linked });
      ctx.auth.signInVerifiedUser.mockResolvedValue(SESSION);
      const state = await started(ctx, 'google', true);
      const result = await ctx.service.handleCallback('google', 'c', state);
      expect(ctx.auth.signInVerifiedUser).toHaveBeenCalledWith(linked, true);
      expect(result).toEqual({ kind: 'session', response: SESSION, persistent: true });
      expect(ctx.prisma.socialIdentity.create).not.toHaveBeenCalled();
    });

    it('an account with two-factor on gets the challenge, never a session', async () => {
      const ctx = build();
      ctx.prisma.socialIdentity.findUnique.mockResolvedValue({ user: user() });
      ctx.auth.signInVerifiedUser.mockResolvedValue(CHALLENGE);
      const state = await started(ctx);
      expect(await ctx.service.handleCallback('google', 'c', state)).toEqual({ kind: 'two_factor_required', challenge: CHALLENGE });
    });

    it('a refusal from the shared sign-in (deactivated, suspended, pending deletion) propagates unchanged', async () => {
      const ctx = build();
      ctx.prisma.socialIdentity.findUnique.mockResolvedValue({ user: user({ accountStatus: 'suspended' }) });
      const refusal = Object.assign(new Error('Invalid credentials'), { status: 401 });
      ctx.auth.signInVerifiedUser.mockRejectedValue(refusal);
      const state = await started(ctx);
      await expect(ctx.service.handleCallback('google', 'c', state)).rejects.toBe(refusal);
    });

    it('the identity is looked up by provider AND provider account id (a Facebook id never matches a Google one)', async () => {
      const ctx = build();
      ctx.client.profile = facebook({ providerAccountId: 'same-id' });
      const state = await started(ctx, 'facebook');
      await ctx.service.handleCallback('facebook', 'c', state);
      expect(ctx.prisma.socialIdentity.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { provider_providerAccountId: { provider: 'facebook', providerAccountId: 'same-id' } } }),
      );
    });
  });

  describe('linking to an existing account (adopted default c)', () => {
    it('Google + a provider-verified email + a VERIFIED ACTIVE existing account: links it and signs in', async () => {
      const ctx = build();
      const existing = user({ id: 'existing' });
      ctx.prisma.user.findUnique.mockResolvedValue(existing);
      ctx.auth.signInVerifiedUser.mockResolvedValue(SESSION);
      const state = await started(ctx);
      const result = await ctx.service.handleCallback('google', 'c', state);
      expect(ctx.prisma.socialIdentity.create).toHaveBeenCalledWith({
        data: { provider: 'google', providerAccountId: 'g-1', userId: 'existing' },
      });
      expect(ctx.auth.signInVerifiedUser).toHaveBeenCalledWith(existing, false);
      expect(result.kind).toBe('session');
    });

    it('linking does not skip two-factor: the linked account still gets the challenge', async () => {
      const ctx = build();
      ctx.prisma.user.findUnique.mockResolvedValue(user());
      ctx.auth.signInVerifiedUser.mockResolvedValue(CHALLENGE);
      const state = await started(ctx);
      expect((await ctx.service.handleCallback('google', 'c', state)).kind).toBe('two_factor_required');
    });

    it.each([
      ['the existing account email is unverified', { verificationStatus: 'unverified' }],
      ['the existing account is deactivated', { accountStatus: 'deactivated' }],
      ['the existing account is suspended', { accountStatus: 'suspended' }],
      ['the existing account is pending deletion', { accountStatus: 'pending_deletion' }],
    ])('Google + verified email but %s: NO link, and the same answer as a new person', async (_n, over) => {
      const ctx = build();
      ctx.prisma.user.findUnique.mockResolvedValue(user(over));
      const state = await started(ctx);
      const result = await ctx.service.handleCallback('google', 'c', state);
      expect(result.kind).toBe('registration_required');
      expect(ctx.prisma.socialIdentity.create).not.toHaveBeenCalled();
      expect(ctx.auth.signInVerifiedUser).not.toHaveBeenCalled();
    });

    it('Google with an email Google does NOT vouch for: NO link', async () => {
      const ctx = build();
      ctx.client.profile = google({ emailVerified: false });
      ctx.prisma.user.findUnique.mockResolvedValue(user());
      const state = await started(ctx);
      expect((await ctx.service.handleCallback('google', 'c', state)).kind).toBe('registration_required');
      expect(ctx.prisma.socialIdentity.create).not.toHaveBeenCalled();
    });

    it('Facebook NEVER links automatically, even when its email matches a verified active account', async () => {
      const ctx = build();
      ctx.client.profile = facebook({ email: 'ada@example.com' });
      ctx.prisma.user.findUnique.mockResolvedValue(user());
      const state = await started(ctx, 'facebook');
      const result = await ctx.service.handleCallback('facebook', 'c', state);
      expect(result.kind).toBe('registration_required');
      expect(ctx.prisma.socialIdentity.create).not.toHaveBeenCalled();
      expect(ctx.auth.signInVerifiedUser).not.toHaveBeenCalled();
      // It does not even look the email up: there is nothing it could do with the answer.
      expect(ctx.prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('the answer for an email that already has an account has the same shape as for a brand-new email', async () => {
      const taken = build();
      taken.client.profile = google({ emailVerified: false });
      taken.prisma.user.findUnique.mockResolvedValue(user());
      const fresh = build();
      fresh.client.profile = google({ emailVerified: false });
      const a = await taken.service.handleCallback('google', 'c', await started(taken));
      const b = await fresh.service.handleCallback('google', 'c', await started(fresh));
      if (a.kind !== 'registration_required' || b.kind !== 'registration_required') throw new Error('expected registration_required');
      expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
      expect(a.profile).toEqual(b.profile);
      expect(a.socialRegistrationToken.length).toBe(b.socialRegistrationToken.length);
    });

    it('a concurrent link of the same identity to the SAME account is fine; to ANOTHER account is refused', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
      const ctx = build();
      ctx.prisma.user.findUnique.mockResolvedValue(user({ id: 'u1' }));
      ctx.prisma.socialIdentity.create.mockRejectedValue(p2002);
      ctx.auth.signInVerifiedUser.mockResolvedValue(SESSION);
      ctx.prisma.socialIdentity.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ userId: 'u1' });
      expect((await ctx.service.handleCallback('google', 'c', await started(ctx))).kind).toBe('session');

      ctx.prisma.socialIdentity.findUnique.mockReset();
      ctx.prisma.socialIdentity.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ userId: 'someone-else' });
      await expect(ctx.service.handleCallback('google', 'c', await started(ctx))).rejects.toMatchObject({ status: 401 });
    });
  });

  describe('a new person gets a registration token, not an account', () => {
    it('Google with a verified email: the token carries it as verified, and no account or link is created', async () => {
      const ctx = build();
      const result = await ctx.service.handleCallback('google', 'c', await started(ctx));
      if (result.kind !== 'registration_required') throw new Error('expected registration_required');
      expect(result.profile).toEqual({ displayName: 'Ada', email: 'ada@example.com', emailVerified: true, needsEmail: false });
      expect(ctx.prisma.socialIdentity.create).not.toHaveBeenCalled();
      expect(ctx.registration.register).not.toHaveBeenCalled();
      expect(await ctx.registrations.peek(result.socialRegistrationToken)).toEqual({
        provider: 'google',
        providerAccountId: 'g-1',
        displayName: 'Ada',
        email: 'ada@example.com',
        emailVerified: true,
      });
    });

    it('Facebook with an email: carried as UNVERIFIED (it will get the usual verification email)', async () => {
      const ctx = build();
      ctx.client.profile = facebook({});
      const result = await ctx.service.handleCallback('facebook', 'c', await started(ctx, 'facebook'));
      if (result.kind !== 'registration_required') throw new Error('expected registration_required');
      expect(result.profile).toMatchObject({ email: 'grace@example.com', emailVerified: false, needsEmail: false });
    });

    it('Facebook with NO email: needsEmail is true and the token holds no email', async () => {
      const ctx = build();
      ctx.client.profile = facebook({ email: null });
      const result = await ctx.service.handleCallback('facebook', 'c', await started(ctx, 'facebook'));
      if (result.kind !== 'registration_required') throw new Error('expected registration_required');
      expect(result.profile).toEqual({ displayName: 'Grace', email: null, emailVerified: false, needsEmail: true });
    });
  });

  describe('an email for a sign-in that gave none: verified BEFORE any account exists', () => {
    async function noEmailToken(ctx: ReturnType<typeof build>) {
      ctx.client.profile = facebook({ email: null });
      const result = await ctx.service.handleCallback('facebook', 'c', await started(ctx, 'facebook'));
      if (result.kind !== 'registration_required') throw new Error('expected registration_required');
      return result.socialRegistrationToken;
    }

    it('sends a code to the address typed (lowercased) and answers { sent: true }', async () => {
      const ctx = build();
      const token = await noEmailToken(ctx);
      expect(await ctx.service.requestEmailCode(token, ' Me@Example.COM ')).toEqual({ sent: true });
      expect(ctx.emailService.sendSocialEmailCodeEmail).toHaveBeenCalledWith('me@example.com', expect.stringMatching(/^\d{6}$/));
    });

    it('the answer does not depend on whether that address already has an account: the database is never asked', async () => {
      const ctx = build();
      const token = await noEmailToken(ctx);
      ctx.prisma.user.findUnique.mockClear();
      await ctx.service.requestEmailCode(token, 'taken@example.com');
      expect(ctx.prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('an unknown or expired registration token is a 400 with a code', async () => {
      const ctx = build();
      await expect(ctx.service.requestEmailCode('nope', 'a@b.test')).rejects.toMatchObject({
        status: 400,
        response: { code: 'social_registration_invalid' },
      });
      await expect(ctx.service.verifyEmailCode('nope', '123456')).rejects.toMatchObject({ status: 400 });
    });

    it('is refused when the token already has an email (nothing to verify)', async () => {
      const ctx = build();
      const result = await ctx.service.handleCallback('google', 'c', await started(ctx));
      if (result.kind !== 'registration_required') throw new Error('x');
      await expect(ctx.service.requestEmailCode(result.socialRegistrationToken, 'x@y.test')).rejects.toMatchObject({
        status: 400,
        response: { code: 'social_email_not_needed' },
      });
    });

    it('caps how many codes one token can have sent (429 with a code)', async () => {
      const ctx = build();
      const token = await noEmailToken(ctx);
      for (let i = 0; i < 3; i += 1) await ctx.service.requestEmailCode(token, 'a@b.test');
      await expect(ctx.service.requestEmailCode(token, 'a@b.test')).rejects.toMatchObject({
        status: 429,
        response: { code: 'social_email_code_rate_limited' },
      });
    });

    it('the right code puts a VERIFIED email on the same token; a wrong one says so without saying why', async () => {
      const ctx = build();
      const token = await noEmailToken(ctx);
      await ctx.service.requestEmailCode(token, 'me@example.com');
      const code = ctx.emailService.sendSocialEmailCodeEmail.mock.calls[0][1] as string;
      const wrong = code === '000000' ? '000001' : '000000';
      await expect(ctx.service.verifyEmailCode(token, wrong)).rejects.toMatchObject({
        status: 400,
        response: { code: 'social_email_code_invalid' },
      });
      expect(await ctx.service.verifyEmailCode(token, code)).toEqual({ email: 'me@example.com', emailVerified: true });
      expect(await ctx.registrations.peek(token)).toMatchObject({ email: 'me@example.com', emailVerified: true });
    });

    it('registration is refused until an email exists on the token', async () => {
      const ctx = build();
      const token = await noEmailToken(ctx);
      await expect(
        ctx.service.completeRegistration({ socialRegistrationToken: token, dateOfBirth: '2000-01-01', countryCode: 'GB' }),
      ).rejects.toMatchObject({ status: 400, response: { code: 'social_email_required' } });
      expect(ctx.registration.register).not.toHaveBeenCalled();
    });
  });

  describe('completing the registration goes through the normal registration', () => {
    const DTO = { dateOfBirth: '2012-05-01', countryCode: 'GB', clubId: undefined, guardian: { name: 'Mum', email: 'mum@example.com', relationship: 'Parent' as const } };

    async function tokenFor(ctx: ReturnType<typeof build>, profile: SocialProfile = google({})) {
      ctx.client.profile = profile;
      const result = await ctx.service.handleCallback(profile.provider, 'c', await started(ctx, profile.provider));
      if (result.kind !== 'registration_required') throw new Error('x');
      return result.socialRegistrationToken;
    }

    it('calls RegistrationService.register with the email FROM THE TOKEN, the Age Gate fields, and the social context', async () => {
      const ctx = build();
      const token = await tokenFor(ctx);
      ctx.registration.register.mockResolvedValue({ user: { id: 'new' } });
      const result = await ctx.service.completeRegistration({ socialRegistrationToken: token, ...DTO }, '203.0.113.9');
      expect(result).toEqual({ user: { id: 'new' } });
      const [dto, ip, social] = ctx.registration.register.mock.calls[0];
      expect(dto).toMatchObject({
        email: 'ada@example.com',
        displayName: 'Ada',
        dateOfBirth: '2012-05-01',
        countryCode: 'GB',
        guardian: DTO.guardian,
      });
      expect(ip).toBe('203.0.113.9');
      expect(social).toEqual({ provider: 'google', providerAccountId: 'g-1', emailVerified: true });
    });

    it('a Facebook account carries emailVerified=false into the registration', async () => {
      const ctx = build();
      const token = await tokenFor(ctx, facebook({}));
      ctx.registration.register.mockResolvedValue({});
      await ctx.service.completeRegistration({ socialRegistrationToken: token, ...DTO });
      expect(ctx.registration.register.mock.calls[0][2]).toEqual({ provider: 'facebook', providerAccountId: 'fb-1', emailVerified: false });
    });

    it('the password is a long random value nobody is shown, different every time', async () => {
      const ctx = build();
      ctx.registration.register.mockResolvedValue({});
      const seen = new Set<string>();
      for (let i = 0; i < 3; i += 1) {
        const token = await tokenFor(ctx, google({ providerAccountId: `g-${i}` }));
        await ctx.service.completeRegistration({ socialRegistrationToken: token, ...DTO });
        seen.add(ctx.registration.register.mock.calls[i][0].password);
      }
      expect(seen.size).toBe(3);
      for (const p of seen) expect(p.length).toBeGreaterThanOrEqual(48);
    });

    it('the name can be overridden; the email cannot (there is no email field to send)', async () => {
      const ctx = build();
      const token = await tokenFor(ctx);
      ctx.registration.register.mockResolvedValue({});
      await ctx.service.completeRegistration({ socialRegistrationToken: token, displayName: ' Ada L ', ...DTO });
      expect(ctx.registration.register.mock.calls[0][0]).toMatchObject({ displayName: 'Ada L', email: 'ada@example.com' });
    });

    it('spends the token only AFTER the account exists: a rejected registration (say a mistyped birth date) leaves it usable', async () => {
      const ctx = build();
      const token = await tokenFor(ctx);
      ctx.registration.register.mockRejectedValueOnce(Object.assign(new Error('bad dob'), { status: 400 }));
      await expect(ctx.service.completeRegistration({ socialRegistrationToken: token, ...DTO })).rejects.toThrow('bad dob');
      expect(await ctx.registrations.peek(token)).not.toBeNull();
      ctx.registration.register.mockResolvedValueOnce({});
      await ctx.service.completeRegistration({ socialRegistrationToken: token, ...DTO });
      expect(await ctx.registrations.peek(token)).toBeNull();
    });

    it('an unknown or already-used token cannot complete a registration', async () => {
      const ctx = build();
      await expect(ctx.service.completeRegistration({ socialRegistrationToken: 'nope', ...DTO })).rejects.toMatchObject({
        status: 400,
        response: { code: 'social_registration_invalid' },
      });
      expect(ctx.registration.register).not.toHaveBeenCalled();
    });
  });
});
