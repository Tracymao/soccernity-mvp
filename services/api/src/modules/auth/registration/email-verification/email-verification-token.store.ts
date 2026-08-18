import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from '../../../../redis/redis.service';

// Decision Log candidate (flagged in this PR's report, not resolved here):
// prisma/schema.prisma's User entity (Build Plan Section 3) has
// `verificationStatus` but no token column to back a "confirm your own
// email" flow, and Guardian.consentToken belongs to a different entity
// entirely (guardian consent, not self email-verification — see
// registration.service.ts). Rather than add a User column unilaterally in
// a feature PR, this follows the precedent B1 already established for
// exactly this situation — RefreshTokenStore (../../token/refresh-token.store.ts)
// — and stores this ephemeral, single-use token in Redis instead. If
// email-verification events need durable/audit-queryable storage later
// (e.g. "when did this user verify," for support/appeals tooling), adding
// a schema field is the real fix; this store is the one place that swap
// would need to happen.
export interface EmailVerificationRedisClient {
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
}

const tokenKey = (token: string) => `auth:email-verify:${token}`;

// No explicit TTL is specified anywhere in Build Plan Section 4/5/8 for
// this token; 48 hours is a conventional email-link expiry chosen to
// outlast a typical "I'll get to it later" delay without leaving the
// token valid indefinitely.
export const DEFAULT_EMAIL_VERIFICATION_TTL_MS = 48 * 60 * 60 * 1000;

@Injectable()
export class EmailVerificationTokenStore {
  constructor(@Inject(RedisService) private readonly redis: EmailVerificationRedisClient) {}

  async issue(userId: string, ttlMs: number = DEFAULT_EMAIL_VERIFICATION_TTL_MS): Promise<string> {
    const token = randomUUID();
    await this.redis.set(tokenKey(token), userId, 'PX', ttlMs);
    return token;
  }

  // Single-use: consuming a valid token deletes it, so replaying the same
  // link twice fails the second time. Returns null (rather than throwing)
  // for "invalid, expired, or already used" — the controller maps that to
  // a 400, matching how RefreshTokenStore's analogous cases surface as
  // typed errors for its own caller.
  async verifyAndConsume(token: string): Promise<string | null> {
    const userId = await this.redis.get(tokenKey(token));
    if (!userId) return null;
    await this.redis.del(tokenKey(token));
    return userId;
  }
}
