import { InMemoryRedisFake } from '../../auth/token/test-support/in-memory-redis.fake';
import { InvalidRefreshTokenError, RefreshTokenReuseDetectedError } from '../../auth/token/token.errors';
import { AdminRefreshTokenStore } from './admin-refresh-token.store';

const ONE_DAY_SECONDS = 24 * 60 * 60;

describe('AdminRefreshTokenStore', () => {
  let redis: InMemoryRedisFake;
  let store: AdminRefreshTokenStore;

  beforeEach(() => {
    redis = new InMemoryRedisFake();
    store = new AdminRefreshTokenStore(redis);
  });

  it('issues an opaque token distinct from the stored secret hash', async () => {
    const issued = await store.issue('admin-1', 'editor', ONE_DAY_SECONDS);

    expect(issued.token).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]+$/);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('verifies and consumes a freshly issued token, returning its owner', async () => {
    const issued = await store.issue('admin-1', 'editor', ONE_DAY_SECONDS);

    const consumed = await store.verifyAndConsume(issued.token);

    expect(consumed.adminId).toBe('admin-1');
    expect(consumed.role).toBe('editor');
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
    const issued = await store.issue('admin-1', 'editor', ONE_DAY_SECONDS);
    const [id] = issued.token.split('.');
    const tampered = `${id}.wrong-secret-entirely`;

    await expect(store.verifyAndConsume(tampered)).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('is single-use — consuming the same token twice fails the second time', async () => {
    const issued = await store.issue('admin-1', 'editor', ONE_DAY_SECONDS);

    await store.verifyAndConsume(issued.token);

    await expect(store.verifyAndConsume(issued.token)).rejects.toThrow();
  });

  it('treats reuse of an already-consumed token as theft and revokes its whole family', async () => {
    const first = await store.issue('admin-1', 'editor', ONE_DAY_SECONDS);
    await store.verifyAndConsume(first.token);
    const second = await store.issue('admin-1', 'editor', ONE_DAY_SECONDS, first.familyId);

    await expect(store.verifyAndConsume(first.token)).rejects.toBeInstanceOf(
      RefreshTokenReuseDetectedError,
    );
    await expect(store.verifyAndConsume(second.token)).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('revokeToken invalidates a single session without touching others', async () => {
    const a = await store.issue('admin-1', 'editor', ONE_DAY_SECONDS);
    const b = await store.issue('admin-1', 'editor', ONE_DAY_SECONDS);

    await store.revokeToken(a.token);

    await expect(store.verifyAndConsume(a.token)).rejects.toThrow();
    await expect(store.verifyAndConsume(b.token)).resolves.toMatchObject({ adminId: 'admin-1' });
  });

  it('revokeAllForAdmin invalidates every active session for that admin', async () => {
    const a = await store.issue('admin-1', 'editor', ONE_DAY_SECONDS);
    const b = await store.issue('admin-1', 'editor', ONE_DAY_SECONDS);
    const other = await store.issue('admin-2', 'editor', ONE_DAY_SECONDS);

    await store.revokeAllForAdmin('admin-1');

    await expect(store.verifyAndConsume(a.token)).rejects.toThrow();
    await expect(store.verifyAndConsume(b.token)).rejects.toThrow();
    await expect(store.verifyAndConsume(other.token)).resolves.toMatchObject({ adminId: 'admin-2' });
  });

  // Genuine namespace-isolation proof, not present in the User-facing
  // sibling spec (there's only one store there to compare against): an
  // admin token and a User token issued with the SAME underlying id never
  // collide in the same (fake, but key-shaped-identically-to-real) Redis
  // client, because every key this store touches is prefixed
  // `admin:refresh:*`, never `auth:refresh:*`.
  it('uses a Redis key namespace distinct from the User-facing RefreshTokenStore', async () => {
    const issued = await store.issue('shared-id-1', 'editor', ONE_DAY_SECONDS);
    const [id] = issued.token.split('.');

    expect(await redis.get(`admin:refresh:token:${id}`)).not.toBeNull();
    expect(await redis.get(`auth:refresh:token:${id}`)).toBeNull();
  });
});
