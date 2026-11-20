import { Inject, Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { createHash } from 'crypto';
import { RedisService } from '../../../../redis/redis.service';
import { AUTH_LIMIT_KEY_PREFIX } from './auth-limits.constants';
import { InMemoryCounters } from './auth-limits.fallback';

// Narrow Redis subset (same convention as guardian-email-change.limiter.ts) so a unit test can substitute
// an in-memory fake with no real Redis instance.
export interface AuthLimitsRedisClient {
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  del(key: string): Promise<number>;
  // SET key value EX seconds NX: 'OK' for the caller that created the key, null if it already existed.
  set(key: string, value: string, mode: 'EX', seconds: number, flag: 'NX'): Promise<'OK' | null>;
}

// A key never contains a raw email or a raw IP: both go in as a SHA-256 digest. The counters live at most
// 15 minutes to 24 hours, so this is defence in depth (a Redis dump or a log line is not a list of addresses),
// not a cryptographic guarantee -- a SHA-256 of a known address can still be recomputed by anyone holding the
// list.
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

// FAILURE MODE: if Redis is unreachable each method FALLS BACK to a per-process in-memory counter with the
// same semantics (see auth-limits.fallback.ts), so the brute-force limits still hold per API instance during an
// outage; the counters restart empty when Redis returns. This is NOT fail-closed and NOT shared: with N
// instances each enforces its own budget, so the effective limit is up to N times looser until Redis is back.
// The outage is never silent: it is logged and reported to Sentry (tagged rate_limiter=auth; a no-op until
// SENTRY_DSN is real), each at most once a minute. If the fallback itself throws, the method FAILS OPEN as
// before (the request proceeds), because a broken limiter must not take authentication down for a platform of
// children. Open question for the founder: fail closed would lock every user out of sign-in and sign-up
// whenever Redis blips; revisit if Redis is not highly available.
@Injectable()
export class AuthLimitsStore {
  private readonly logger = new Logger(AuthLimitsStore.name);
  private lastReportAt = 0;
  private readonly memory = new InMemoryCounters();

  constructor(@Inject(RedisService) private readonly redis: AuthLimitsRedisClient) {}

  // Entries currently held by the in-memory fallback (for tests and diagnostics).
  get fallbackSize(): number {
    return this.memory.size;
  }

  // INCR the counter; the first hit of a window starts it. Returns null only if Redis AND the fallback failed.
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
      this.redisUnavailable(err);
    }
    return this.fromMemory(() => this.memory.hit(key, windowSeconds), null);
  }

  // Give a reserved slot back (a success, or a request that was not a failed attempt). Never throws.
  async release(key: string): Promise<void> {
    try {
      const count = await this.redis.decr(key);
      // The window expired between hit and release, so DECR re-created the key at -1 with no TTL: remove it.
      if (count < 0) await this.redis.del(key);
      return;
    } catch (err) {
      this.redisUnavailable(err);
    }
    this.fromMemory(() => this.memory.release(key), undefined);
  }

  // Whole seconds until the counter resets, never below 1; falls back to `fallback` if unknown.
  async retryAfterSeconds(key: string, fallback: number): Promise<number> {
    try {
      const ttl = await this.redis.ttl(key);
      if (ttl > 0) return ttl;
    } catch (err) {
      this.redisUnavailable(err);
    }
    const inMemory = this.fromMemory(() => this.memory.ttlSeconds(key), -1);
    return inMemory > 0 ? inMemory : fallback;
  }

  // SET key NX EX: true for the one caller that created the key, false if it already existed, null only if
  // Redis AND the fallback failed (callers treat that as "do not act").
  async claim(key: string, ttlSeconds: number): Promise<boolean | null> {
    try {
      return (await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX')) === 'OK';
    } catch (err) {
      this.redisUnavailable(err);
    }
    return this.fromMemory(() => this.memory.claim(key, ttlSeconds), null);
  }

  // Delete a key outright (a password reset clears the account-wide ceiling; a failed notice send gives its
  // claim back). Never throws. Clears both layers: the key may sit in Redis, in the fallback, or both if
  // Redis blipped.
  async clear(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (err) {
      this.redisUnavailable(err);
    }
    this.fromMemory(() => this.memory.clear(key), undefined);
  }

  private fromMemory<T, D>(fn: () => T, dflt: D): T | D {
    try {
      return fn();
    } catch (err) {
      this.report('Auth rate-limit in-memory fallback failed; failing open', err);
      return dflt;
    }
  }

  private redisUnavailable(err: unknown): void {
    this.report('Auth rate-limit store unavailable; using per-process in-memory counters', err);
  }

  // Log and report to Sentry, each at most once a minute, so an outage is visible but cannot flood either.
  private report(message: string, err: unknown): void {
    const now = Date.now();
    if (now - this.lastReportAt <= 60_000) return;
    this.lastReportAt = now;
    this.logger.error(`${message}: ${(err as Error)?.message ?? err}`);
    try {
      Sentry.captureException(err, { tags: { rate_limiter: 'auth' } });
    } catch {
      // Reporting must never break a request.
    }
  }
}
