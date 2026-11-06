import { AuthLimitExceeded } from '../auth/rate-limit/auth-limits/auth-limits.service';
import { EMAIL_CHANGE_FAILED_ATTEMPTS_MAX, EMAIL_CHANGE_FAILED_ATTEMPTS_WINDOW_SECONDS } from './email-change.constants';
import { EmailChangeLimiter } from './email-change.limiter';

// The per-account failed-attempt budget, against an in-memory fake of AuthLimitsStore.
function build() {
  const counts = new Map<string, number>();
  const store = {
    hit: jest.fn(async (key: string, windowSeconds: number) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { count, windowSeconds };
    }),
    release: jest.fn(async (key: string) => {
      counts.set(key, Math.max(0, (counts.get(key) ?? 0) - 1));
    }),
    retryAfterSeconds: jest.fn(async () => 777),
  };
  return { limiter: new EmailChangeLimiter(store as never), store, counts };
}

describe('EmailChangeLimiter', () => {
  it('allows exactly the maximum number of failed attempts, then refuses with a retry-after', async () => {
    const { limiter, store } = build();
    for (let i = 0; i < EMAIL_CHANGE_FAILED_ATTEMPTS_MAX; i++) await limiter.reserve('u1');
    const err = await limiter.reserve('u1').catch((e) => e);
    expect(err).toBeInstanceOf(AuthLimitExceeded);
    expect(err.retryAfterSeconds).toBe(777);
    expect(store.hit.mock.calls[0][1]).toBe(EMAIL_CHANGE_FAILED_ATTEMPTS_WINDOW_SECONDS);
  });

  it('a refused attempt gives its slot back, so refusals do not lengthen the lock', async () => {
    const { limiter, counts } = build();
    for (let i = 0; i < EMAIL_CHANGE_FAILED_ATTEMPTS_MAX + 3; i++) await limiter.reserve('u1').catch(() => undefined);
    expect([...counts.values()][0]).toBe(EMAIL_CHANGE_FAILED_ATTEMPTS_MAX);
  });

  it('release frees a slot (a right password is not a failure)', async () => {
    const { limiter } = build();
    for (let i = 0; i < EMAIL_CHANGE_FAILED_ATTEMPTS_MAX; i++) {
      await limiter.reserve('u1');
      await limiter.release('u1');
    }
    await expect(limiter.reserve('u1')).resolves.toBeUndefined();
  });

  it('counts per account', async () => {
    const { limiter } = build();
    for (let i = 0; i < EMAIL_CHANGE_FAILED_ATTEMPTS_MAX; i++) await limiter.reserve('u1');
    await expect(limiter.reserve('u2')).resolves.toBeUndefined();
  });

  it('the key never contains the raw user id', async () => {
    const { limiter, store } = build();
    await limiter.reserve('user-id-abc');
    expect(store.hit.mock.calls[0][0]).not.toContain('user-id-abc');
  });

  it('lets the request through when the store has nothing to say (it fails open by design)', async () => {
    const store = { hit: jest.fn(async () => null), release: jest.fn(), retryAfterSeconds: jest.fn() };
    await expect(new EmailChangeLimiter(store as never).reserve('u1')).resolves.toBeUndefined();
  });
});
