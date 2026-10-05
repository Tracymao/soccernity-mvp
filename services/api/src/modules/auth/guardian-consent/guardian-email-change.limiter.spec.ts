import { HttpException } from '@nestjs/common';
import {
  GUARDIAN_EMAIL_CHANGE_MAX_PER_WINDOW,
  GUARDIAN_EMAIL_CHANGE_WINDOW_SECONDS,
  GuardianEmailChangeLimiter,
} from './guardian-email-change.limiter';

// In-memory Redis subset: counters plus a record of EXPIRE calls.
function build() {
  const counters = new Map<string, number>();
  const expires: Array<[string, number]> = [];
  const redis = {
    incr: jest.fn(async (k: string) => {
      const n = (counters.get(k) ?? 0) + 1;
      counters.set(k, n);
      return n;
    }),
    decr: jest.fn(async (k: string) => {
      const n = (counters.get(k) ?? 0) - 1;
      counters.set(k, n);
      return n;
    }),
    expire: jest.fn(async (k: string, s: number) => {
      expires.push([k, s]);
      return 1;
    }),
  };
  return { limiter: new GuardianEmailChangeLimiter(redis as never), counters, expires };
}

describe('GuardianEmailChangeLimiter', () => {
  it('lets the first N successful changes through and 429s the next, without running it', async () => {
    const { limiter } = build();
    const change = jest.fn().mockResolvedValue('ok');

    for (let i = 0; i < GUARDIAN_EMAIL_CHANGE_MAX_PER_WINDOW; i++) {
      await expect(limiter.run('minor-1', change)).resolves.toBe('ok');
    }
    await expect(limiter.run('minor-1', change)).rejects.toBeInstanceOf(HttpException);
    await expect(limiter.run('minor-1', change)).rejects.toMatchObject({ status: 429 });

    expect(change).toHaveBeenCalledTimes(GUARDIAN_EMAIL_CHANGE_MAX_PER_WINDOW);
  });

  it('sets the 24h window once, on the first counted change only', async () => {
    const { limiter, expires } = build();
    await limiter.run('minor-1', async () => 1);
    await limiter.run('minor-1', async () => 1);

    expect(expires).toEqual([['guardian-email-change:minor-1', GUARDIAN_EMAIL_CHANGE_WINDOW_SECONDS]]);
  });

  it('does not charge the budget for a refused change (state/validation refusal sends nothing)', async () => {
    const { limiter, counters } = build();

    for (let i = 0; i < GUARDIAN_EMAIL_CHANGE_MAX_PER_WINDOW * 3; i++) {
      await expect(
        limiter.run('minor-1', async () => {
          throw new Error('refused');
        }),
      ).rejects.toThrow('refused');
    }
    expect(counters.get('guardian-email-change:minor-1')).toBe(0);
    await expect(limiter.run('minor-1', async () => 'ok')).resolves.toBe('ok');
  });

  it('an over-limit attempt does not inflate the counter or extend the lockout', async () => {
    const { limiter, counters } = build();
    for (let i = 0; i < GUARDIAN_EMAIL_CHANGE_MAX_PER_WINDOW; i++) await limiter.run('minor-1', async () => 1);
    for (let i = 0; i < 4; i++) await expect(limiter.run('minor-1', async () => 1)).rejects.toBeInstanceOf(HttpException);

    expect(counters.get('guardian-email-change:minor-1')).toBe(GUARDIAN_EMAIL_CHANGE_MAX_PER_WINDOW);
  });

  it('is per minor: one minor at the cap does not affect another', async () => {
    const { limiter } = build();
    for (let i = 0; i < GUARDIAN_EMAIL_CHANGE_MAX_PER_WINDOW; i++) await limiter.run('minor-1', async () => 1);

    await expect(limiter.run('minor-1', async () => 1)).rejects.toBeInstanceOf(HttpException);
    await expect(limiter.run('minor-2', async () => 'ok')).resolves.toBe('ok');
  });
});
