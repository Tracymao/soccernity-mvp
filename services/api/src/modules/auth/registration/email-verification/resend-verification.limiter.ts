import { Inject, Injectable } from '@nestjs/common';
import { RedisService } from '../../../../redis/redis.service';

// B-128 (Decision Log #406 item 3). A PER-ACCOUNT cap on how many verification
// emails the resend endpoint will send, on top of the route's shared per-IP
// @AuthRateLimit() (5 / 60 s). The IP throttle alone does not protect one
// person's inbox from an attacker who rotates IPs, and every send goes to an
// address the CALLER chose. Fixed window starting at the first counted send.
//
// Over the cap the endpoint stays SILENT (same generic response), not 429:
// a 429 that only an existing, unverified account could trigger would let a
// caller tell such accounts from everything else.
export const RESEND_VERIFICATION_MAX_PER_WINDOW = 3;
export const RESEND_VERIFICATION_WINDOW_SECONDS = 60 * 60;

export interface ResendLimiterRedisClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

const key = (userId: string) => `auth:resend-verification:${userId}`;

@Injectable()
export class ResendVerificationLimiter {
  constructor(@Inject(RedisService) private readonly redis: ResendLimiterRedisClient) {}

  // true = this send is within budget (and has been counted).
  async tryAcquire(userId: string): Promise<boolean> {
    const k = key(userId);
    const count = await this.redis.incr(k);
    if (count === 1) {
      await this.redis.expire(k, RESEND_VERIFICATION_WINDOW_SECONDS);
    }
    return count <= RESEND_VERIFICATION_MAX_PER_WINDOW;
  }
}
