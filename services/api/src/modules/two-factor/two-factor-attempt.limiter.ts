import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { CODE_ATTEMPTS_MAX, CODE_LOCK_SECONDS, TWO_FACTOR_CODE_LOCKED_CODE, TwoFactorAudience } from './two-factor.constants';

// 429 for a locked account. `retryAfterSeconds` is turned into a Retry-After header by TwoFactorLockInterceptor.
// The body never says why a code failed and never gives a count.
export class CodeEntryLockedException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        code: TWO_FACTOR_CODE_LOCKED_CODE,
        message: 'Too many attempts. Try again later.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export interface TwoFactorAttemptRedisClient {
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  del(...keys: string[]): Promise<number>;
}

// Founder decision (#404 item 7, #405 item 8): 5 wrong tries in 15 minutes lock code entry for THAT ACCOUNT for
// 15 minutes. Per ACCOUNT, not per IP: the per-IP limits are separate (@AuthRateLimit on the endpoints).
//
// Shape: reserve the slot FIRST (INCR), then check the code, so 20 parallel guesses at one account see counts 1..20
// and only the first 5 are ever checked (a check-then-count design would let them all through). The 5th wrong
// attempt re-sets the key's expiry to the full 15 minutes, which is what makes it a 15-minute LOCK from that
// moment; attempts above 5 are refused without being checked and without extending anything. A success deletes
// the key.
//
// Redis only, no in-memory fallback: if Redis is down a challenge cannot even be read, so second-factor sign-in
// is unavailable anyway (accepted, Decision Log #439).
const attemptsKey = (aud: TwoFactorAudience, subjectId: string) => `2fa:attempts:${aud}:${subjectId}`;

@Injectable()
export class TwoFactorAttemptLimiter {
  constructor(@Inject(RedisService) private readonly redis: TwoFactorAttemptRedisClient) {}

  // Claims one attempt. Throws CodeEntryLockedException when the account is locked.
  async reserve(aud: TwoFactorAudience, subjectId: string): Promise<{ count: number }> {
    const key = attemptsKey(aud, subjectId);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, CODE_LOCK_SECONDS);
    } else if ((await this.redis.ttl(key)) === -1) {
      // The process died between INCR and EXPIRE: a counter with no expiry would lock the account forever. Heal it.
      await this.redis.expire(key, CODE_LOCK_SECONDS);
    }
    if (count > CODE_ATTEMPTS_MAX) {
      const ttl = await this.redis.ttl(key);
      throw new CodeEntryLockedException(ttl > 0 ? ttl : CODE_LOCK_SECONDS);
    }
    return { count };
  }

  // The reserved attempt was wrong. The 5th restarts the 15-minute clock, so the lock lasts a full 15 minutes.
  async recordFailure(aud: TwoFactorAudience, subjectId: string, reserved: { count: number }): Promise<void> {
    if (reserved.count === CODE_ATTEMPTS_MAX) await this.redis.expire(attemptsKey(aud, subjectId), CODE_LOCK_SECONDS);
  }

  // The reserved attempt was not a code attempt after all (e.g. no pending enrolment): hand the slot back.
  async refund(aud: TwoFactorAudience, subjectId: string): Promise<void> {
    const key = attemptsKey(aud, subjectId);
    const count = await this.redis.decr(key);
    if (count <= 0) await this.redis.del(key);
  }

  // A correct code ends the streak.
  async clear(aud: TwoFactorAudience, subjectId: string): Promise<void> {
    await this.redis.del(attemptsKey(aud, subjectId));
  }
}
