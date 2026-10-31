import { CodeEntryLockedException, TwoFactorAttemptLimiter } from './two-factor-attempt.limiter';
import { CODE_ATTEMPTS_MAX, CODE_LOCK_SECONDS } from './two-factor.constants';
import { FakeTwoFactorRedis } from './test-support/in-memory-two-factor.fakes';

// Founder decision: 5 wrong tries in 15 minutes lock code entry for that ACCOUNT for 15 minutes.
async function wrongAttempt(limiter: TwoFactorAttemptLimiter, id = 'u1') {
  const reserved = await limiter.reserve('user', id);
  await limiter.recordFailure('user', id, reserved);
}

describe('TwoFactorAttemptLimiter', () => {
  let redis: FakeTwoFactorRedis;
  let limiter: TwoFactorAttemptLimiter;

  beforeEach(() => {
    redis = new FakeTwoFactorRedis();
    limiter = new TwoFactorAttemptLimiter(redis);
  });

  it('allows five wrong attempts and locks the sixth with a 429 and a Retry-After of the full 15 minutes', async () => {
    for (let i = 0; i < CODE_ATTEMPTS_MAX; i++) await wrongAttempt(limiter);
    const error = await limiter.reserve('user', 'u1').catch((e) => e);
    expect(error).toBeInstanceOf(CodeEntryLockedException);
    expect(error.getStatus()).toBe(429);
    expect(error.retryAfterSeconds).toBe(CODE_LOCK_SECONDS);
    expect(error.getResponse()).toMatchObject({ statusCode: 429, code: 'two_factor_code_locked' });
  });

  it('never puts a count or a reason in the 429 body', async () => {
    for (let i = 0; i < CODE_ATTEMPTS_MAX; i++) await wrongAttempt(limiter);
    const error = (await limiter.reserve('user', 'u1').catch((e) => e)) as CodeEntryLockedException;
    expect(JSON.stringify(error.getResponse())).not.toMatch(/\d+ (attempt|try|tries)/i);
  });

  it('makes the 5th wrong attempt restart the 15-minute clock, so the lock lasts a full 15 minutes from then', async () => {
    await wrongAttempt(limiter); // t = 0, window starts
    redis.advance(14 * 60); // 14 minutes later, nearly expired
    for (let i = 0; i < CODE_ATTEMPTS_MAX - 1; i++) await wrongAttempt(limiter); // attempts 2..5
    const locked = (await limiter.reserve('user', 'u1').catch((e) => e)) as CodeEntryLockedException;
    expect(locked.retryAfterSeconds).toBe(CODE_LOCK_SECONDS);
    // Without the restart the key would expire 1 minute after the first attempt; it must still be locked at +14 min.
    redis.advance(14 * 60);
    await expect(limiter.reserve('user', 'u1')).rejects.toBeInstanceOf(CodeEntryLockedException);
  });

  it('lets the account try again once the 15 minutes have passed', async () => {
    for (let i = 0; i < CODE_ATTEMPTS_MAX; i++) await wrongAttempt(limiter);
    redis.advance(CODE_LOCK_SECONDS + 1);
    await expect(limiter.reserve('user', 'u1')).resolves.toEqual({ count: 1 });
  });

  it('refused attempts do not extend the lock', async () => {
    for (let i = 0; i < CODE_ATTEMPTS_MAX; i++) await wrongAttempt(limiter);
    redis.advance(5 * 60);
    const before = (await limiter.reserve('user', 'u1').catch((e) => e)) as CodeEntryLockedException;
    await limiter.reserve('user', 'u1').catch(() => undefined);
    const after = (await limiter.reserve('user', 'u1').catch((e) => e)) as CodeEntryLockedException;
    expect(before.retryAfterSeconds).toBe(CODE_LOCK_SECONDS - 5 * 60);
    expect(after.retryAfterSeconds).toBe(before.retryAfterSeconds);
  });

  it('a correct code clears the streak', async () => {
    for (let i = 0; i < CODE_ATTEMPTS_MAX - 1; i++) await wrongAttempt(limiter);
    await limiter.reserve('user', 'u1');
    await limiter.clear('user', 'u1');
    for (let i = 0; i < CODE_ATTEMPTS_MAX; i++) await wrongAttempt(limiter); // a fresh budget of five
    await expect(limiter.reserve('user', 'u1')).rejects.toBeInstanceOf(CodeEntryLockedException);
  });

  it('is per account: one account being locked says nothing about another, nor about the other audience', async () => {
    for (let i = 0; i < CODE_ATTEMPTS_MAX; i++) await wrongAttempt(limiter, 'u1');
    await expect(limiter.reserve('user', 'u1')).rejects.toBeInstanceOf(CodeEntryLockedException);
    await expect(limiter.reserve('user', 'u2')).resolves.toBeDefined();
    await expect(limiter.reserve('admin', 'u1')).resolves.toBeDefined();
  });

  it('reserves the slot BEFORE the check, so 20 parallel guesses see only five attempts', async () => {
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => limiter.reserve('user', 'u1')));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(CODE_ATTEMPTS_MAX);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(20 - CODE_ATTEMPTS_MAX);
  });

  it('hands a slot back when the reserved attempt was not a code attempt', async () => {
    await limiter.reserve('user', 'u1');
    await limiter.refund('user', 'u1');
    expect(redis.keys()).toEqual([]);
  });

  it('heals a counter that was created without an expiry, so nobody is locked out forever', async () => {
    await redis.incr('2fa:attempts:user:u1'); // INCR ran, EXPIRE never did
    await limiter.reserve('user', 'u1');
    expect(await redis.ttl('2fa:attempts:user:u1')).toBeGreaterThan(0);
  });
});
