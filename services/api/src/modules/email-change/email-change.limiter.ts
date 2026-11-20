import { Injectable } from '@nestjs/common';
import { AuthLimitExceeded } from '../auth/rate-limit/auth-limits/auth-limits.service';
import { AuthLimitsStore, limitKey, normaliseEmail } from '../auth/rate-limit/auth-limits/auth-limits.store';
import {
  EMAIL_CHANGE_FAILED_ATTEMPTS_MAX,
  EMAIL_CHANGE_FAILED_ATTEMPTS_WINDOW_SECONDS,
  EMAIL_CHANGE_RECIPIENT_EMAILS_MAX,
  EMAIL_CHANGE_RECIPIENT_EMAILS_WINDOW_SECONDS,
  EMAIL_CHANGE_REQUESTS_MAX,
  EMAIL_CHANGE_REQUESTS_WINDOW_SECONDS,
} from './email-change.constants';

// Three budgets on POST /users/me/email-change, all on the shared AuthLimitsStore, so they inherit that store's
// behaviour when Redis is down: a per-process in-memory fallback, reported to Sentry, never fail-closed.
//
//   1. reserve / release: per-account budget of WRONG PASSWORDS. Same shape as the sign-in limits: the slot is
//      RESERVED before the password is checked (so parallel guesses cannot all slip under the limit), and given
//      back unless the attempt really failed.
//   2. reserveRequest: per-account cap on REQUESTS, every outcome counted (Decision Log #476).
//   3. claimRecipientSlot: per-RECIPIENT-ADDRESS cap on emails sent by this feature (Decision Log #476).
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

  // Decision Log #476. Counts one request against the account's hourly cap. Throws AuthLimitExceeded (a 429 with a
  // retry-after) once the cap is spent; the refused request gives back its slot, so refusals do not extend the lock.
  // Nothing is ever released on success: a request is a request whatever the address turns out to be.
  async reserveRequest(userId: string): Promise<void> {
    const key = limitKey('email-change-requests', userId);
    const hit = await this.store.hit(key, EMAIL_CHANGE_REQUESTS_WINDOW_SECONDS);
    if (hit !== null && hit.count > EMAIL_CHANGE_REQUESTS_MAX) {
      const retryAfter = await this.store.retryAfterSeconds(key, EMAIL_CHANGE_REQUESTS_WINDOW_SECONDS);
      await this.store.release(key);
      throw new AuthLimitExceeded(retryAfter);
    }
  }

  // Decision Log #476. Takes one of the recipient's slots for this feature. true: send. false: the address already
  // received its share in the last 24 hours, so the caller skips the email silently. The address is trimmed and
  // lower-cased and goes into the key as a SHA-256 digest only. If the store has nothing to say (Redis AND the
  // in-memory fallback failed) this answers true: it fails open like every limiter on this store, because a broken
  // limiter must not stop the verification email a real user is waiting for.
  async claimRecipientSlot(recipientEmail: string): Promise<boolean> {
    const key = limitKey('email-change-recipient', normaliseEmail(recipientEmail));
    const hit = await this.store.hit(key, EMAIL_CHANGE_RECIPIENT_EMAILS_WINDOW_SECONDS);
    return hit === null || hit.count <= EMAIL_CHANGE_RECIPIENT_EMAILS_MAX;
  }
}
