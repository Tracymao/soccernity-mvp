import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';

// safeguarding/guardian-email-change-endpoint (Decision Log #365).
//
// A PER-MINOR cap on how many guardian-email changes may SUCCEED in a window,
// layered on top of the route's shared per-IP @AuthRateLimit(). That throttle
// is keyed by client IP, so one minor on a changing IP (or a shared school/
// household IP shared by many minors) gets either too much or too little. The
// harm this limits is specific: every successful change makes the platform
// send two emails to addresses the caller chose, so the cap is on the account.
//
// Fixed window starting at the first counted change (not rolling), counted on
// SUCCESS only: INCR up front so concurrent requests can't both slip under,
// DECR if the change is then refused, so validation/state refusals (which send
// nothing) never burn a minor's budget.
export const GUARDIAN_EMAIL_CHANGE_MAX_PER_WINDOW = 5;
export const GUARDIAN_EMAIL_CHANGE_WINDOW_SECONDS = 24 * 60 * 60;

// Narrow Redis subset (same convention as BudgetRedisClient) so a unit test
// can substitute an in-memory fake with no real Redis instance.
export interface ChangeLimiterRedisClient {
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

const key = (minorUserId: string) => `guardian-email-change:${minorUserId}`;

@Injectable()
export class GuardianEmailChangeLimiter {
  constructor(private readonly redis: RedisService) {}

  // Runs `change`, enforcing the cap. Throws 429 (without running `change`)
  // when the minor is already at the limit.
  async run<T>(minorUserId: string, change: () => Promise<T>): Promise<T> {
    const client = this.redis as unknown as ChangeLimiterRedisClient;
    const k = key(minorUserId);

    const count = await client.incr(k);
    if (count === 1) {
      await client.expire(k, GUARDIAN_EMAIL_CHANGE_WINDOW_SECONDS);
    }
    if (count > GUARDIAN_EMAIL_CHANGE_MAX_PER_WINDOW) {
      // The over-limit attempt itself must not extend the lockout or inflate
      // the counter: put it back.
      await client.decr(k);
      throw new HttpException(
        'Too many guardian email changes. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      return await change();
    } catch (err) {
      await client.decr(k);
      throw err;
    }
  }
}
