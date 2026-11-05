import { ConfigService } from '@nestjs/config';
import { FACEBOOK_SCOPES, GOOGLE_SCOPES, HttpSocialAuthClient } from './http-social-auth.client';

// The real provider client, with the network replaced by a recorded fetch. No call here leaves the process.
function client(env: Record<string, string | undefined>): HttpSocialAuthClient {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new HttpSocialAuthClient(config);
}

const FULL = {
  GOOGLE_OAUTH_CLIENT_ID: 'g-id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'g-secret',
  FACEBOOK_OAUTH_CLIENT_ID: 'f-id',
  FACEBOOK_OAUTH_CLIENT_SECRET: 'f-secret',
};
const PARAMS = { state: 'st', codeChallenge: 'ch', redirectUri: 'https://app.soccernity.test/auth/social/google/callback' };

describe('HttpSocialAuthClient', () => {
  const realFetch = global.fetch;
  let calls: { url: string; init?: Parameters<typeof fetch>[1] }[];
  let responses: unknown[];
  let statuses: number[];

  beforeEach(() => {
    calls = [];
    responses = [];
    statuses = [];
    global.fetch = jest.fn(async (url: string | URL | Request, init?: Parameters<typeof fetch>[1]) => {
      calls.push({ url: String(url), init });
      const body = responses.shift();
      const status = statuses.shift() ?? 200;
      return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
    }) as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = realFetch;
  });

  describe('configuration: a provider is on only when its id AND secret are real', () => {
    it.each([
      ['both unset', {}, false],
      ['placeholders', { GOOGLE_OAUTH_CLIENT_ID: 'replace-me', GOOGLE_OAUTH_CLIENT_SECRET: 'replace-me' }, false],
      ['blank id', { GOOGLE_OAUTH_CLIENT_ID: '  ', GOOGLE_OAUTH_CLIENT_SECRET: 'x' }, false],
      ['only the id', { GOOGLE_OAUTH_CLIENT_ID: 'x' }, false],
      ['only the secret', { GOOGLE_OAUTH_CLIENT_SECRET: 'x' }, false],
      ['both real', { GOOGLE_OAUTH_CLIENT_ID: 'x', GOOGLE_OAUTH_CLIENT_SECRET: 'y' }, true],
    ])('google: %s -> %s', (_name, env, expected) => {
      expect(client(env as Record<string, string>).isConfigured('google')).toBe(expected);
    });

    it('google and facebook are independent', () => {
      const c = client({ GOOGLE_OAUTH_CLIENT_ID: 'x', GOOGLE_OAUTH_CLIENT_SECRET: 'y' });
      expect(c.isConfigured('google')).toBe(true);
      expect(c.isConfigured('facebook')).toBe(false);
    });

    it('building a URL or exchanging a code for a provider that is off throws and calls nothing', async () => {
      const c = client({});
      expect(() => c.buildAuthorizationUrl('google', PARAMS)).toThrow();
      await expect(c.exchangeCode('google', { code: 'c', codeVerifier: 'v', redirectUri: 'r' })).rejects.toThrow();
      expect(calls).toHaveLength(0);
    });
  });

  describe('authorisation URLs', () => {
    it('google: code flow with PKCE S256, the state, the redirect, and identity scopes only', () => {
      const url = new URL(client(FULL).buildAuthorizationUrl('google', PARAMS));
      expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url.searchParams.get('client_id')).toBe('g-id');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('state')).toBe('st');
      expect(url.searchParams.get('redirect_uri')).toBe(PARAMS.redirectUri);
      expect(url.searchParams.get('code_challenge')).toBe('ch');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('scope')).toBe('openid email profile');
      expect(url.searchParams.get('client_secret')).toBeNull();
    });

    it('facebook: code flow with PKCE S256, and public_profile + email only', () => {
      const url = new URL(client(FULL).buildAuthorizationUrl('facebook', PARAMS));
      expect(url.hostname).toBe('www.facebook.com');
      expect(url.pathname).toMatch(/^\/v\d+\.\d+\/dialog\/oauth$/);
      expect(url.searchParams.get('scope')).toBe('public_profile,email');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('client_secret')).toBeNull();
    });

    it('NEITHER provider is ever asked for a birthday, age range, gender or anything beyond identity', () => {
      for (const scopes of [GOOGLE_SCOPES, FACEBOOK_SCOPES]) {
        expect(scopes).not.toMatch(/birth|age|gender|friends|location|phone|address|contacts/i);
      }
      expect(GOOGLE_SCOPES.split(' ').sort()).toEqual(['email', 'openid', 'profile']);
      expect(FACEBOOK_SCOPES.split(',').sort()).toEqual(['email', 'public_profile']);
    });
  });

  describe('google profile', () => {
    const exchange = { code: 'the-code', codeVerifier: 'the-verifier', redirectUri: PARAMS.redirectUri };

    it('exchanges the code with the PKCE verifier, then reads the profile with the access token', async () => {
      responses.push({ access_token: 'at' }, { sub: 'g-123', name: 'Ada Lovelace', email: 'Ada@Example.com', email_verified: true });
      const profile = await client(FULL).exchangeCode('google', exchange);
      expect(profile).toEqual({
        provider: 'google',
        providerAccountId: 'g-123',
        displayName: 'Ada Lovelace',
        email: 'ada@example.com',
        emailVerified: true,
      });
      expect(calls[0].url).toBe('https://oauth2.googleapis.com/token');
      const form = new URLSearchParams(String(calls[0].init?.body));
      expect(form.get('code')).toBe('the-code');
      expect(form.get('code_verifier')).toBe('the-verifier');
      expect(form.get('grant_type')).toBe('authorization_code');
      expect(form.get('client_secret')).toBe('g-secret');
      expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe('Bearer at');
    });

    it.each([
      [false, false],
      ['true', true],
      ['false', false],
      [undefined, false],
      ['yes', false],
    ])('email_verified %p -> emailVerified %p (anything but true is NOT verified)', async (claim, expected) => {
      responses.push({ access_token: 'at' }, { sub: 'g-1', name: 'A', email: 'a@b.test', email_verified: claim });
      expect((await client(FULL).exchangeCode('google', exchange)).emailVerified).toBe(expected);
    });

    it('no email at all is a null email that is never "verified"', async () => {
      responses.push({ access_token: 'at' }, { sub: 'g-1', name: 'A', email_verified: true });
      const profile = await client(FULL).exchangeCode('google', exchange);
      expect(profile.email).toBeNull();
      expect(profile.emailVerified).toBe(false);
    });

    it('falls back to the start of the email, then a neutral name, when Google gives no name', async () => {
      responses.push({ access_token: 'at' }, { sub: 'g-1', email: 'sam.jones@b.test', email_verified: true });
      expect((await client(FULL).exchangeCode('google', exchange)).displayName).toBe('sam.jones');
      responses.push({ access_token: 'at' }, { sub: 'g-2' });
      expect((await client(FULL).exchangeCode('google', exchange)).displayName).toBe('New member');
    });

    it('throws on a provider error, a missing token, or a missing subject', async () => {
      statuses.push(400);
      responses.push({});
      await expect(client(FULL).exchangeCode('google', exchange)).rejects.toThrow('provider responded 400');
      responses.push({});
      await expect(client(FULL).exchangeCode('google', exchange)).rejects.toThrow('no access token');
      responses.push({ access_token: 'at' }, { name: 'A' });
      await expect(client(FULL).exchangeCode('google', exchange)).rejects.toThrow('no subject');
    });

    it('an error message carries the status only: never the code, the secret or the profile', async () => {
      statuses.push(401);
      responses.push({ error: 'bad', email: 'secret@person.test' });
      const err = await client(FULL).exchangeCode('google', exchange).catch((e: Error) => e);
      expect(String((err as Error).message)).not.toMatch(/the-code|g-secret|secret@person/);
    });
  });

  describe('facebook profile', () => {
    const exchange = { code: 'fb-code', codeVerifier: 'fb-verifier', redirectUri: 'https://app.soccernity.test/auth/social/facebook/callback' };

    it('reads only id, name and email, and ALWAYS reports the email as unverified', async () => {
      responses.push({ access_token: 'fat' }, { id: 'fb-9', name: 'Grace', email: 'Grace@Example.com' });
      const profile = await client(FULL).exchangeCode('facebook', exchange);
      expect(profile).toEqual({
        provider: 'facebook',
        providerAccountId: 'fb-9',
        displayName: 'Grace',
        email: 'grace@example.com',
        emailVerified: false,
      });
      const me = new URL(calls[1].url);
      expect(me.searchParams.get('fields')).toBe('id,name,email');
      expect(me.searchParams.get('fields')).not.toMatch(/birth|age|gender/);
      const token = new URL(calls[0].url);
      expect(token.searchParams.get('code_verifier')).toBe('fb-verifier');
    });

    it('a Facebook account with no email gives a null email', async () => {
      responses.push({ access_token: 'fat' }, { id: 'fb-9', name: 'Grace' });
      const profile = await client(FULL).exchangeCode('facebook', exchange);
      expect(profile.email).toBeNull();
      expect(profile.emailVerified).toBe(false);
    });

    it('throws on a missing token or id', async () => {
      responses.push({});
      await expect(client(FULL).exchangeCode('facebook', exchange)).rejects.toThrow('no access token');
      responses.push({ access_token: 'x' }, { name: 'G' });
      await expect(client(FULL).exchangeCode('facebook', exchange)).rejects.toThrow('no user id');
    });
  });
});
