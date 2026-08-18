import { InMemoryResetRedisFake } from './test-support/in-memory-reset-redis.fake';
import { InvalidResetTokenError } from './reset-token.errors';
import { ResetTokenStore } from './reset-token.store';

const SIXTY_MINUTES = 60;

describe('ResetTokenStore', () => {
  let redis: InMemoryResetRedisFake;
  let store: ResetTokenStore;

  beforeEach(() => {
    redis = new InMemoryResetRedisFake();
    store = new ResetTokenStore(redis);
  });

  it('issues an opaque token distinct from the stored secret hash', async () => {
    const issued = await store.issue('user-1', SIXTY_MINUTES);

    expect(issued.token).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]+$/);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('verifies and consumes a freshly issued token, returning its owner', async () => {
    const issued = await store.issue('user-1', SIXTY_MINUTES);

    const consumed = await store.verifyAndConsume(issued.token);

    expect(consumed.userId).toBe('user-1');
  });

  it('rejects a token that was never issued', async () => {
    await expect(
      store.verifyAndConsume('not-a-real-id.not-a-real-secret'),
    ).rejects.toBeInstanceOf(InvalidResetTokenError);
  });

  it('rejects a malformed token string', async () => {
    await expect(store.verifyAndConsume('missing-a-separator')).rejects.toBeInstanceOf(
      InvalidResetTokenError,
    );
  });

  it('rejects a token whose secret does not match its id (tampered token)', async () => {
    const issued = await store.issue('user-1', SIXTY_MINUTES);
    const [id] = issued.token.split('.');

    await expect(store.verifyAndConsume(`${id}.wrong-secret-entirely`)).rejects.toBeInstanceOf(
      InvalidResetTokenError,
    );
  });

  it('is single-use — consuming the same token twice fails the second time', async () => {
    const issued = await store.issue('user-1', SIXTY_MINUTES);

    await store.verifyAndConsume(issued.token);

    await expect(store.verifyAndConsume(issued.token)).rejects.toBeInstanceOf(
      InvalidResetTokenError,
    );
  });

  it('issuing a new token for the same user invalidates the previous one', async () => {
    const first = await store.issue('user-1', SIXTY_MINUTES);
    const second = await store.issue('user-1', SIXTY_MINUTES);

    await expect(store.verifyAndConsume(first.token)).rejects.toBeInstanceOf(
      InvalidResetTokenError,
    );
    await expect(store.verifyAndConsume(second.token)).resolves.toMatchObject({
      userId: 'user-1',
    });
  });

  it('rejects an expired token', async () => {
    // Negative TTL => already expired the instant it's issued.
    const issued = await store.issue('user-1', -1);

    await expect(store.verifyAndConsume(issued.token)).rejects.toBeInstanceOf(
      InvalidResetTokenError,
    );
  });

  it('tokens for different users do not collide', async () => {
    const a = await store.issue('user-1', SIXTY_MINUTES);
    const b = await store.issue('user-2', SIXTY_MINUTES);

    await expect(store.verifyAndConsume(a.token)).resolves.toMatchObject({ userId: 'user-1' });
    await expect(store.verifyAndConsume(b.token)).resolves.toMatchObject({ userId: 'user-2' });
  });
});
