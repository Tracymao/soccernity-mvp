import { AuthLimitExceeded } from '../auth/rate-limit/auth-limits/auth-limits.service';
import {
  EMAIL_CHANGE_FAILED_ATTEMPTS_MAX,
  EMAIL_CHANGE_FAILED_ATTEMPTS_WINDOW_SECONDS,
  EMAIL_CHANGE_RECIPIENT_EMAILS_MAX,
  EMAIL_CHANGE_RECIPIENT_EMAILS_WINDOW_SECONDS,
  EMAIL_CHANGE_REQUESTS_MAX,
  EMAIL_CHANGE_REQUESTS_WINDOW_SECONDS,
} from './email-change.constants';
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

// Decision Log #476: the per-account request cap (every outcome) and the per-recipient email share.
describe('EmailChangeLimiter.reserveRequest', () => {
  it('the defaults are 5 requests per hour', () => {
    expect(EMAIL_CHANGE_REQUESTS_MAX).toBe(5);
    expect(EMAIL_CHANGE_REQUESTS_WINDOW_SECONDS).toBe(3600);
  });

  it('allows exactly the maximum, then refuses with a retry-after and the hourly window', async () => {
    const { limiter, store } = build();
    for (let i = 0; i < EMAIL_CHANGE_REQUESTS_MAX; i++) await limiter.reserveRequest('u1');
    const err = await limiter.reserveRequest('u1').catch((e) => e);
    expect(err).toBeInstanceOf(AuthLimitExceeded);
    expect(err.retryAfterSeconds).toBe(777);
    expect(store.hit.mock.calls[0][1]).toBe(EMAIL_CHANGE_REQUESTS_WINDOW_SECONDS);
  });

  it('a refused request gives its slot back, so refusals do not lengthen the lock', async () => {
    const { limiter, counts } = build();
    for (let i = 0; i < EMAIL_CHANGE_REQUESTS_MAX + 4; i++) await limiter.reserveRequest('u1').catch(() => undefined);
    expect([...counts.values()][0]).toBe(EMAIL_CHANGE_REQUESTS_MAX);
  });

  it('is its own counter: the wrong-password budget and the request cap do not share slots', async () => {
    const { limiter } = build();
    for (let i = 0; i < EMAIL_CHANGE_FAILED_ATTEMPTS_MAX; i++) await limiter.reserve('u1');
    await expect(limiter.reserveRequest('u1')).resolves.toBeUndefined();
  });

  it('counts per account and never puts the raw user id in the key', async () => {
    const { limiter, store } = build();
    for (let i = 0; i < EMAIL_CHANGE_REQUESTS_MAX; i++) await limiter.reserveRequest('user-id-abc');
    await expect(limiter.reserveRequest('u2')).resolves.toBeUndefined();
    expect(store.hit.mock.calls[0][0]).not.toContain('user-id-abc');
  });

  it('lets the request through when the store has nothing to say (it fails open by design)', async () => {
    const store = { hit: jest.fn(async () => null), release: jest.fn(), retryAfterSeconds: jest.fn() };
    await expect(new EmailChangeLimiter(store as never).reserveRequest('u1')).resolves.toBeUndefined();
  });
});

describe('EmailChangeLimiter.claimRecipientSlot', () => {
  it('the defaults are 3 emails per 24 hours per recipient', () => {
    expect(EMAIL_CHANGE_RECIPIENT_EMAILS_MAX).toBe(3);
    expect(EMAIL_CHANGE_RECIPIENT_EMAILS_WINDOW_SECONDS).toBe(24 * 60 * 60);
  });

  it('gives exactly the maximum slots, then false (a silent skip, never an error)', async () => {
    const { limiter, store } = build();
    const results = [];
    for (let i = 0; i < EMAIL_CHANGE_RECIPIENT_EMAILS_MAX + 2; i++) results.push(await limiter.claimRecipientSlot('x@example.com'));
    expect(results).toEqual([true, true, true, false, false]);
    expect(store.hit.mock.calls[0][1]).toBe(EMAIL_CHANGE_RECIPIENT_EMAILS_WINDOW_SECONDS);
  });

  it('is counted per recipient address, case- and whitespace-insensitively', async () => {
    const { limiter } = build();
    for (let i = 0; i < EMAIL_CHANGE_RECIPIENT_EMAILS_MAX; i++) await limiter.claimRecipientSlot('  X@Example.com ');
    expect(await limiter.claimRecipientSlot('x@example.com')).toBe(false);
    expect(await limiter.claimRecipientSlot('y@example.com')).toBe(true);
  });

  it('never puts the raw address in the key', async () => {
    const { limiter, store } = build();
    await limiter.claimRecipientSlot('someone.private@example.com');
    expect(store.hit.mock.calls[0][0]).not.toContain('someone');
    expect(store.hit.mock.calls[0][0]).not.toContain('example.com');
  });

  it('shares nothing with the per-account counters', async () => {
    const { limiter } = build();
    for (let i = 0; i < EMAIL_CHANGE_RECIPIENT_EMAILS_MAX; i++) await limiter.claimRecipientSlot('u1');
    await expect(limiter.reserveRequest('u1')).resolves.toBeUndefined();
    await expect(limiter.reserve('u1')).resolves.toBeUndefined();
  });

  it('fails open when the store has nothing to say', async () => {
    const store = { hit: jest.fn(async () => null), release: jest.fn(), retryAfterSeconds: jest.fn() };
    expect(await new EmailChangeLimiter(store as never).claimRecipientSlot('x@example.com')).toBe(true);
  });
});
