import { InMemoryRedisFake } from './test-support/in-memory-redis.fake';
import { RefreshTokenStore } from './refresh-token.store';
import { InvalidRefreshTokenError, RefreshTokenReuseDetectedError } from './token.errors';

const ONE_DAY_SECONDS = 24 * 60 * 60;

describe('RefreshTokenStore', () => {
  let redis: InMemoryRedisFake;
  let store: RefreshTokenStore;

  beforeEach(() => {
    redis = new InMemoryRedisFake();
    store = new RefreshTokenStore(redis);
  });

  it('issues an opaque token distinct from the stored secret hash', async () => {
    const issued = await store.issue('user-1', 'fan', ONE_DAY_SECONDS);

    expect(issued.token).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]+$/);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('verifies and consumes a freshly issued token, returning its owner', async () => {
    const issued = await store.issue('user-1', 'fan', ONE_DAY_SECONDS);

    const consumed = await store.verifyAndConsume(issued.token);

    expect(consumed.userId).toBe('user-1');
    expect(consumed.role).toBe('fan');
    expect(consumed.familyId).toBe(issued.familyId);
  });

  it('rejects a token that was never issued', async () => {
    await expect(store.verifyAndConsume('not-a-real-id.not-a-real-secret')).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('rejects a malformed token string', async () => {
    await expect(store.verifyAndConsume('missing-a-separator')).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('rejects a token whose secret does not match its id (tampered token)', async () => {
    const issued = await store.issue('user-1', 'fan', ONE_DAY_SECONDS);
    const [id] = issued.token.split('.');
    const tampered = `${id}.wrong-secret-entirely`;

    await expect(store.verifyAndConsume(tampered)).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('is single-use — consuming the same token twice fails the second time', async () => {
    const issued = await store.issue('user-1', 'fan', ONE_DAY_SECONDS);

    await store.verifyAndConsume(issued.token);

    await expect(store.verifyAndConsume(issued.token)).rejects.toThrow();
  });

  it('treats reuse of an already-consumed token as theft and revokes its whole family', async () => {
    const first = await store.issue('user-1', 'fan', ONE_DAY_SECONDS);
    await store.verifyAndConsume(first.token);
    // Legitimate rotation: issue the replacement in the same family.
    const second = await store.issue('user-1', 'fan', ONE_DAY_SECONDS, first.familyId);

    // An attacker (or a retried request) replays the already-consumed
    // first token.
    await expect(store.verifyAndConsume(first.token)).rejects.toBeInstanceOf(
      RefreshTokenReuseDetectedError,
    );

    // The legitimate rotated token is now also dead, because the whole
    // family was revoked.
    await expect(store.verifyAndConsume(second.token)).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('revokeToken invalidates a single session without touching others', async () => {
    const a = await store.issue('user-1', 'fan', ONE_DAY_SECONDS);
    const b = await store.issue('user-1', 'fan', ONE_DAY_SECONDS);

    await store.revokeToken(a.token);

    await expect(store.verifyAndConsume(a.token)).rejects.toThrow();
    await expect(store.verifyAndConsume(b.token)).resolves.toMatchObject({ userId: 'user-1' });
  });

  it('revokeAllForUser invalidates every active session for that user', async () => {
    const a = await store.issue('user-1', 'fan', ONE_DAY_SECONDS);
    const b = await store.issue('user-1', 'fan', ONE_DAY_SECONDS);
    const other = await store.issue('user-2', 'fan', ONE_DAY_SECONDS);

    await store.revokeAllForUser('user-1');

    await expect(store.verifyAndConsume(a.token)).rejects.toThrow();
    await expect(store.verifyAndConsume(b.token)).rejects.toThrow();
    await expect(store.verifyAndConsume(other.token)).resolves.toMatchObject({ userId: 'user-2' });
  });
});
