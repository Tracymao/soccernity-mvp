import { FakeTwoFactorRedis } from './test-support/in-memory-two-factor.fakes';
import { TwoFactorTokenKind, TwoFactorTokenStore, audienceOfKind } from './two-factor-token.store';

describe('TwoFactorTokenStore', () => {
  let redis: FakeTwoFactorRedis;
  let store: TwoFactorTokenStore;

  beforeEach(() => {
    redis = new FakeTwoFactorRedis();
    store = new TwoFactorTokenStore(redis);
  });

  it('issues an id.secret token and keeps only a hash of the secret', async () => {
    const { token, expiresInSeconds } = await store.issue('user-login', 'u1', 300);
    const [id, secret] = token.split('.');
    expect(expiresInSeconds).toBe(300);
    const stored = redis.rawValue(`2fa:token:user-login:${id}`);
    expect(stored).toBeDefined();
    expect(stored).not.toContain(secret);
    expect(JSON.parse(stored as string)).toMatchObject({ kind: 'user-login', subjectId: 'u1', persistent: false });
  });

  it('peeks without consuming, and consumes exactly once', async () => {
    const { token } = await store.issue('user-login', 'u1', 300, { persistent: true });
    const first = await store.peek('user-login', token);
    expect(first).toMatchObject({ subjectId: 'u1', persistent: true, purpose: 'login' });
    expect(await store.peek('user-login', token)).not.toBeNull(); // still there

    expect(await store.consume('user-login', first!.id)).toBe(true);
    expect(await store.consume('user-login', first!.id)).toBe(false); // the second caller loses
    expect(await store.peek('user-login', token)).toBeNull();
  });

  it('expires after its TTL', async () => {
    const { token } = await store.issue('user-login', 'u1', 300);
    redis.advance(299);
    expect(await store.peek('user-login', token)).not.toBeNull();
    redis.advance(2);
    expect(await store.peek('user-login', token)).toBeNull();
  });

  it('carries the purpose, so a reactivation challenge stays a reactivation challenge', async () => {
    const { token } = await store.issue('user-login', 'u1', 300, { purpose: 'reactivate' });
    expect((await store.peek('user-login', token))?.purpose).toBe('reactivate');
  });

  describe('a token of one kind never works as another kind', () => {
    const kinds: TwoFactorTokenKind[] = ['user-login', 'admin-login', 'admin-enrol'];
    for (const issuedAs of kinds) {
      for (const presentedAs of kinds) {
        if (issuedAs === presentedAs) continue;
        it(`${issuedAs} token presented as ${presentedAs} -> not found`, async () => {
          const { token } = await store.issue(issuedAs, 'subject-1', 300);
          expect(await store.peek(presentedAs, token)).toBeNull();
        });
      }
    }

    it('even if the key were guessed, the kind stored INSIDE the record is checked too', async () => {
      const { token } = await store.issue('admin-login', 'a1', 300);
      const [id] = token.split('.');
      // Plant the admin-login record under the user-login key: the namespace now matches, the stored kind does not.
      await redis.set(`2fa:token:user-login:${id}`, redis.rawValue(`2fa:token:admin-login:${id}`) as string, 'EX', 300);
      expect(await store.peek('user-login', token)).toBeNull();
    });

    it('maps kinds to audiences', () => {
      expect(audienceOfKind('user-login')).toBe('user');
      expect(audienceOfKind('admin-login')).toBe('admin');
      expect(audienceOfKind('admin-enrol')).toBe('admin');
    });
  });

  it('rejects a wrong secret, a malformed token and a non-string without throwing', async () => {
    const { token } = await store.issue('user-login', 'u1', 300);
    const [id] = token.split('.');
    expect(await store.peek('user-login', `${id}.not-the-secret`)).toBeNull();
    expect(await store.peek('user-login', 'no-dot-here')).toBeNull();
    expect(await store.peek('user-login', `${id}.`)).toBeNull();
    expect(await store.peek('user-login', '.secret')).toBeNull();
    expect(await store.peek('user-login', undefined)).toBeNull();
    expect(await store.peek('user-login', 12345)).toBeNull();
    expect(await store.peek('user-login', { token })).toBeNull();
  });
});
