import { createHash } from 'crypto';
import {
  SOCIAL_EMAIL_CODE_MAX_ATTEMPTS,
  SOCIAL_EMAIL_CODE_MAX_SENDS,
  SOCIAL_REGISTRATION_TTL_SECONDS,
  SOCIAL_STATE_TTL_SECONDS,
} from './social-auth.constants';
import {
  SocialAuthStateStore,
  SocialRegistrationPayload,
  SocialRegistrationStore,
  codeChallengeFor,
} from './social-auth.stores';
import { FakeRedis } from './social-auth.test-support';

const PAYLOAD: SocialRegistrationPayload = {
  provider: 'facebook',
  providerAccountId: 'fb-1',
  displayName: 'Ada',
  email: null,
  emailVerified: false,
};

describe('SocialAuthStateStore', () => {
  it('issues a state with a real S3-style PKCE pair: the challenge is the base64url SHA-256 of the verifier', async () => {
    const redis = new FakeRedis();
    const store = new SocialAuthStateStore(redis);
    const { state, codeVerifier, codeChallenge } = await store.issue('google', false);
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(codeVerifier.length).toBeLessThanOrEqual(128);
    expect(codeChallenge).toBe(createHash('sha256').update(codeVerifier).digest('base64url'));
    expect(codeChallenge).toBe(codeChallengeFor(codeVerifier));
    expect(state.length).toBeGreaterThanOrEqual(43);
  });

  it('keeps no raw state or verifier in a Redis key, and gives the entry a ten-minute life', async () => {
    const redis = new FakeRedis();
    const store = new SocialAuthStateStore(redis);
    const { state } = await store.issue('google', true);
    const [key] = [...redis.data.keys()];
    expect(key).not.toContain(state);
    expect(redis.ttls.get(key)).toBe(SOCIAL_STATE_TTL_SECONDS);
  });

  it('consumes a state once: the second try, an unknown state and a malformed entry are all null', async () => {
    const redis = new FakeRedis();
    const store = new SocialAuthStateStore(redis);
    const { state, codeVerifier } = await store.issue('facebook', true);
    expect(await store.consume(state)).toEqual({ provider: 'facebook', codeVerifier, persistent: true });
    expect(await store.consume(state)).toBeNull();
    expect(await store.consume('never-issued')).toBeNull();
    const { state: s2 } = await store.issue('google', false);
    const key = [...redis.data.keys()][0];
    redis.data.set(key, '{not json');
    expect(await store.consume(s2)).toBeNull();
  });

  it('two issues give different states and different verifiers', async () => {
    const store = new SocialAuthStateStore(new FakeRedis());
    const a = await store.issue('google', false);
    const b = await store.issue('google', false);
    expect(a.state).not.toBe(b.state);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });
});

describe('SocialRegistrationStore', () => {
  it('issues an opaque token, stores the payload under a hashed key for thirty minutes, and reads it back', async () => {
    const redis = new FakeRedis();
    const store = new SocialRegistrationStore(redis);
    const token = await store.issue(PAYLOAD);
    expect([...redis.data.keys()].every((k) => !k.includes(token))).toBe(true);
    expect(redis.ttls.get([...redis.data.keys()][0])).toBe(SOCIAL_REGISTRATION_TTL_SECONDS);
    expect(await store.peek(token)).toEqual(PAYLOAD);
    expect(await store.peek('nope')).toBeNull();
  });

  it('replace swaps the payload; discard removes the token and everything hanging off it', async () => {
    const redis = new FakeRedis();
    const store = new SocialRegistrationStore(redis);
    const token = await store.issue(PAYLOAD);
    await store.replace(token, { ...PAYLOAD, email: 'a@b.test', emailVerified: true });
    expect((await store.peek(token))?.emailVerified).toBe(true);
    await store.startEmailCode(token, 'a@b.test');
    await store.discard(token);
    expect(await store.peek(token)).toBeNull();
    expect(redis.data.size).toBe(0);
  });

  describe('email code', () => {
    it('issues a 6-digit code, never stores it in the clear, and accepts it once', async () => {
      const redis = new FakeRedis();
      const store = new SocialRegistrationStore(redis);
      const token = await store.issue(PAYLOAD);
      const code = await store.startEmailCode(token, 'a@b.test');
      expect(code).toMatch(/^\d{6}$/);
      expect([...redis.data.values()].some((v) => v.includes(code!))).toBe(false);
      expect(await store.checkEmailCode(token, code!)).toEqual({ result: 'ok', email: 'a@b.test' });
      // single use
      expect(await store.checkEmailCode(token, code!)).toEqual({ result: 'expired' });
    });

    it('a wrong code is "wrong" and the right one still works afterwards', async () => {
      const store = new SocialRegistrationStore(new FakeRedis());
      const token = await store.issue(PAYLOAD);
      const code = (await store.startEmailCode(token, 'a@b.test'))!;
      const wrong = code === '000000' ? '000001' : '000000';
      expect((await store.checkEmailCode(token, wrong)).result).toBe('wrong');
      expect((await store.checkEmailCode(token, code)).result).toBe('ok');
    });

    it('discards the code after too many wrong guesses, even if the next guess is right', async () => {
      const store = new SocialRegistrationStore(new FakeRedis());
      const token = await store.issue(PAYLOAD);
      const code = (await store.startEmailCode(token, 'a@b.test'))!;
      const wrong = code === '000000' ? '000001' : '000000';
      for (let i = 0; i < SOCIAL_EMAIL_CODE_MAX_ATTEMPTS; i += 1) {
        expect((await store.checkEmailCode(token, wrong)).result).toBe('wrong');
      }
      expect((await store.checkEmailCode(token, code)).result).toBe('expired');
      expect((await store.checkEmailCode(token, code)).result).toBe('expired');
    });

    it('a code is bound to its own token: another token cannot use it', async () => {
      const store = new SocialRegistrationStore(new FakeRedis());
      const a = await store.issue(PAYLOAD);
      const b = await store.issue({ ...PAYLOAD, providerAccountId: 'fb-2' });
      const codeA = (await store.startEmailCode(a, 'a@b.test'))!;
      await store.startEmailCode(b, 'b@b.test');
      expect((await store.checkEmailCode(b, codeA)).result).toBe('wrong');
    });

    it('a new code replaces the old one and resets the guess counter', async () => {
      const store = new SocialRegistrationStore(new FakeRedis());
      const token = await store.issue(PAYLOAD);
      const first = (await store.startEmailCode(token, 'a@b.test'))!;
      const second = (await store.startEmailCode(token, 'c@d.test'))!;
      if (first !== second) expect((await store.checkEmailCode(token, first)).result).toBe('wrong');
      expect(await store.checkEmailCode(token, second)).toEqual({ result: 'ok', email: 'c@d.test' });
    });

    it('allows only a few codes to be sent per registration token', async () => {
      const store = new SocialRegistrationStore(new FakeRedis());
      const token = await store.issue(PAYLOAD);
      for (let i = 0; i < SOCIAL_EMAIL_CODE_MAX_SENDS; i += 1) {
        expect(await store.startEmailCode(token, 'a@b.test')).not.toBeNull();
      }
      expect(await store.startEmailCode(token, 'a@b.test')).toBeNull();
    });

    it('two simultaneous correct submissions: exactly one passes', async () => {
      const store = new SocialRegistrationStore(new FakeRedis());
      const token = await store.issue(PAYLOAD);
      const code = (await store.startEmailCode(token, 'a@b.test'))!;
      const results = await Promise.all([store.checkEmailCode(token, code), store.checkEmailCode(token, code)]);
      expect(results.map((r) => r.result).sort()).toEqual(['expired', 'ok']);
    });
  });
});
