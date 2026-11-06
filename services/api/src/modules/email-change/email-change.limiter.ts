import { Injectable } from '@nestjs/common';
import { AuthLimitExceeded } from '../auth/rate-limit/auth-limits/auth-limits.service';
import { AuthLimitsStore, limitKey } from '../auth/rate-limit/auth-limits/auth-limits.store';
import {
  EMAIL_CHANGE_FAILED_ATTEMPTS_MAX,
  EMAIL_CHANGE_FAILED_ATTEMPTS_WINDOW_SECONDS,
} from './email-change.constants';

// Per-account budget of FAILED attempts on POST /users/me/email-change. Same shape as the sign-in limits: the slot is
// RESERVED before the password is checked (so parallel guesses cannot all slip under the limit), and given back
// unless the attempt really failed. Uses the shared AuthLimitsStore, so it inherits that store's behaviour when
// Redis is down: a per-process in-memory fallback, reported to Sentry, never fail-closed.
@Injectable()
export class EmailChangeLimiter {
  constructor(private readonly store: AuthLimitsStore) {}

  // Takes a slot. Throws AuthLimitExceeded (a 429 with a retry-after) when the budget is already spent; the
  // refused attempt gives back the slot it took, so refusals do not extend the lock.
  async reserve(userId: string): Promise<void> {
    const key = limitKey('email-change-failed', userId);
    const hit = await this.store.hit(key, EMAIL_CHANGE_FAILED_ATTEMPTS_WINDOW_SECONDS);
    if (hit !== null && hit.count > EMAIL_CHANGE_FAILED_ATTEMPTS_MAX) {
      const retryAfter = await this.store.retryAfterSeconds(key, EMAIL_CHANGE_FAILED_ATTEMPTS_WINDOW_SECONDS);
      await this.store.release(key);
      throw new AuthLimitExceeded(retryAfter);
    }
  }

  // Gives the slot back (the attempt did not fail: wrong second factor is limited by its own lock, an accepted
  // request is not a failure).
  async release(userId: string): Promise<void> {
    await this.store.release(limitKey('email-change-failed', userId));
  }
}
