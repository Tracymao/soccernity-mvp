import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { InMemoryCounters } from './auth-limits.fallback';
import { AuthLimitsRedisClient, AuthLimitsStore } from './auth-limits.store';

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

// A Redis client that always throws: every store method must then be served by the per-process fallback.
function downRedis(): AuthLimitsRedisClient {
  const boom = async () => {
    throw new Error('redis down');
  };
  return { incr: boom, decr: boom, expire: boom, ttl: boom, del: boom, set: boom };
}

describe('InMemoryCounters (the Redis-outage fallback)', () => {
  let clock: number;
  const now = () => clock;
  beforeEach(() => {
    clock = 1_000_000;
  });

  it('counts hits, starts the window on the first hit and expires it', () => {
    const c = new InMemoryCounters(100, now);
    expect(c.hit('k', 60)).toEqual({ count: 1, windowSeconds: 60 });
    expect(c.hit('k', 60).count).toBe(2);
    expect(c.ttlSeconds('k')).toBe(60);
    clock += 30_000;
    expect(c.ttlSeconds('k')).toBe(30);
    clock += 30_000;
    expect(c.ttlSeconds('k')).toBe(-1);
    expect(c.hit('k', 60).count).toBe(1);
  });

  it('release gives a slot back, never goes negative and ignores unknown keys', () => {
    const c = new InMemoryCounters(100, now);
    c.hit('k', 60);
    c.hit('k', 60);
    c.release('k');
    expect(c.hit('k', 60).count).toBe(2);
    c.release('missing');
    expect(c.size).toBe(1);
    c.release('k');
    c.release('k');
    c.release('k');
    expect(c.size).toBe(0);
  });

  it('claim is set-if-absent with an expiry', () => {
    const c = new InMemoryCounters(100, now);
    expect(c.claim('n', 10)).toBe(true);
    expect(c.claim('n', 10)).toBe(false);
    clock += 10_000;
    expect(c.claim('n', 10)).toBe(true);
    c.clear('n');
    expect(c.claim('n', 10)).toBe(true);
  });

  it('stays bounded: expired entries go first, then the oldest, and the size never exceeds the cap', () => {
    const c = new InMemoryCounters(5, now);
    for (let i = 0; i < 5; i++) c.hit(`old${i}`, 1);
    clock += 2_000; // all five have expired
    c.hit('fresh', 60);
    expect(c.size).toBe(1);

    for (let i = 0; i < 1000; i++) {
      c.hit(`flood${i}`, 3600);
      expect(c.size).toBeLessThanOrEqual(5);
    }
    // Oldest evicted first: the first flood keys are gone, the newest are kept.
    expect(c.ttlSeconds('flood0')).toBe(-1);
    expect(c.ttlSeconds('flood999')).toBeGreaterThan(0);
  });
});

describe('AuthLimitsStore with Redis down', () => {
  let logSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => logSpy.mockRestore());

  it('serves hit, release, retry-after, claim and clear from the fallback with the same semantics', async () => {
    const store = new AuthLimitsStore(downRedis());
    expect((await store.hit('k', 900))?.count).toBe(1);
    expect((await store.hit('k', 900))?.count).toBe(2);
    await store.release('k');
    expect((await store.hit('k', 900))?.count).toBe(2);
    expect(await store.retryAfterSeconds('k', 5)).toBeGreaterThan(5);
    expect(await store.retryAfterSeconds('unknown', 7)).toBe(7);

    expect(await store.claim('n', 86_400)).toBe(true);
    expect(await store.claim('n', 86_400)).toBe(false);
    await store.clear('n');
    expect(await store.claim('n', 86_400)).toBe(true);
  });

  it('logs and reports to Sentry at most once a minute, tagged rate_limiter=auth', async () => {
    const store = new AuthLimitsStore(downRedis());
    for (let i = 0; i < 25; i++) await store.hit(`k${i}`, 60);
    await store.claim('n', 60);
    await store.clear('n');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { rate_limiter: 'auth' } });
  });

  it('keeps the fallback map bounded under a flood of distinct keys', async () => {
    const store = new AuthLimitsStore(downRedis());
    for (let i = 0; i < 12_000; i++) await store.hit(`flood${i}`, 3600);
    expect(store.fallbackSize).toBeLessThanOrEqual(10_000);
    expect(store.fallbackSize).toBeGreaterThan(0);
  });

  it('FAILS OPEN only if the fallback itself throws: null / false-less results, never an exception', async () => {
    const store = new AuthLimitsStore(downRedis());
    const broken = () => {
      throw new Error('memory broke');
    };
    (store as unknown as { memory: object }).memory = {
      hit: broken,
      release: broken,
      ttlSeconds: broken,
      claim: broken,
      clear: broken,
      size: 0,
    };
    expect(await store.hit('k', 60)).toBeNull();
    await expect(store.release('k')).resolves.toBeUndefined();
    expect(await store.retryAfterSeconds('k', 9)).toBe(9);
    expect(await store.claim('n', 60)).toBeNull();
    await expect(store.clear('n')).resolves.toBeUndefined();
  });

  it('uses Redis when it works and does not touch the fallback', async () => {
    const calls: string[] = [];
    const redis: AuthLimitsRedisClient = {
      incr: async () => (calls.push('incr'), 1),
      decr: async () => (calls.push('decr'), 0),
      expire: async () => (calls.push('expire'), 1),
      ttl: async () => (calls.push('ttl'), 42),
      del: async () => (calls.push('del'), 1),
      set: async () => (calls.push('set'), 'OK'),
    };
    const store = new AuthLimitsStore(redis);
    expect((await store.hit('k', 60))?.count).toBe(1);
    expect(await store.retryAfterSeconds('k', 5)).toBe(42);
    expect(await store.claim('n', 60)).toBe(true);
    expect(store.fallbackSize).toBe(0);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('claim reports false (not true) when Redis says the key already exists', async () => {
    const redis = { ...downRedis(), set: async () => null } as AuthLimitsRedisClient;
    expect(await new AuthLimitsStore(redis).claim('n', 60)).toBe(false);
  });
});
