import { InMemoryRedisFake } from '../../token/test-support/in-memory-redis.fake';
import { EmailVerificationTokenStore } from './email-verification-token.store';

describe('EmailVerificationTokenStore', () => {
  let redis: InMemoryRedisFake;
  let store: EmailVerificationTokenStore;

  beforeEach(() => {
    // InMemoryRedisFake implements a superset (RefreshTokenRedisClient) of
    // the narrower EmailVerificationRedisClient interface this store
    // depends on — safe to reuse as-is.
    redis = new InMemoryRedisFake();
    store = new EmailVerificationTokenStore(redis);
  });

  it('issues a token that resolves back to the owning user id', async () => {
    const token = await store.issue('user-1');

    const userId = await store.verifyAndConsume(token);

    expect(userId).toBe('user-1');
  });

  it('is single-use — verifying the same token twice fails the second time', async () => {
    const token = await store.issue('user-1');

    await store.verifyAndConsume(token);
    const second = await store.verifyAndConsume(token);

    expect(second).toBeNull();
  });

  it('returns null for a token that was never issued', async () => {
    const result = await store.verifyAndConsume('never-issued');
    expect(result).toBeNull();
  });

  it('issues distinct tokens for distinct users', async () => {
    const tokenA = await store.issue('user-a');
    const tokenB = await store.issue('user-b');

    expect(tokenA).not.toBe(tokenB);
    await expect(store.verifyAndConsume(tokenA)).resolves.toBe('user-a');
    await expect(store.verifyAndConsume(tokenB)).resolves.toBe('user-b');
  });
});
