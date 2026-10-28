import { Inject, Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { createHash } from 'crypto';
import { RedisService } from '../../../../redis/redis.service';
import { AUTH_LIMIT_KEY_PREFIX } from './auth-limits.constants';

// Narrow Redis subset (same convention as guardian-email-change.limiter.ts) so a unit test can substitute
// an in-memory fake with no real Redis instance.
export interface AuthLimitsRedisClient {
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  del(key: string): Promise<number>;
}

// A key never contains a raw email or a raw IP: both go in as a SHA-256 digest. The counters live at most
// 15-60 minutes, so this is defence in depth (a Redis dump or a log line is not a list of addresses), not a
// cryptographic guarantee -- a SHA-256 of a known address can still be recomputed by anyone holding the list.
export function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// Lower-case and trim, so "A@x.com " and "a@x.com" share one budget. (login and forgot-password both match
// the account on the lower-cased address.)
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const limitKey = (scope: string, subject: string) => `${AUTH_LIMIT_KEY_PREFIX}${scope}:${digest(subject)}`;

export interface HitResult {
  count: number;
  windowSeconds: number;
}

// FAILURE MODE: if Redis is unreachable every method FAILS OPEN (the request proceeds unlimited), logs, and
// reports to Sentry (a no-op until SENTRY_DSN is real). Open question for the founder: fail open means an
// attacker who can take Redis down also removes the brute-force limit; fail closed would lock every user
// out of sign-in and sign-up whenever Redis blips. Chosen open because a broken limiter must not take
// authentication down for a platform of children; revisit if Redis is not highly available.
@Injectable()
export class AuthLimitsStore {
  private readonly logger = new Logger(AuthLimitsStore.name);
  private lastFailOpenLogAt = 0;

  constructor(@Inject(RedisService) private readonly redis: AuthLimitsRedisClient) {}

  // INCR the counter; the first hit of a window starts it. Returns null when the store is unavailable.
  async hit(key: string, windowSeconds: number): Promise<HitResult | null> {
    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, windowSeconds);
      } else if (count > 1 && (await this.redis.ttl(key)) === -1) {
        // INCR created the key but the process died before EXPIRE ran: a counter with no expiry would lock
        // the subject out forever. Heal it.
        await this.redis.expire(key, windowSeconds);
      }
      return { count, windowSeconds };
    } catch (err) {
      this.failOpen(err);
      return null;
    }
  }

  // Give a reserved slot back (a success, or a request that was not a failed attempt). Never throws.
  async release(key: string): Promise<void> {
    try {
      const count = await this.redis.decr(key);
      // The window expired between hit and release, so DECR re-created the key at -1 with no TTL: remove it.
      if (count < 0) await this.redis.del(key);
    } catch (err) {
      this.failOpen(err);
    }
  }

  // Whole seconds until the counter resets, never below 1; falls back to `fallback` if unknown.
  async retryAfterSeconds(key: string, fallback: number): Promise<number> {
    try {
      const ttl = await this.redis.ttl(key);
      return ttl > 0 ? ttl : fallback;
    } catch {
      return fallback;
    }
  }

  private failOpen(err: unknown): void {
    const now = Date.now();
    if (now - this.lastFailOpenLogAt > 60_000) {
      this.lastFailOpenLogAt = now;
      this.logger.error(`Auth rate-limit store unavailable; failing open: ${(err as Error)?.message ?? err}`);
    }
    try {
      Sentry.captureException(err);
    } catch {
      // Reporting must never break a request.
    }
  }
}
