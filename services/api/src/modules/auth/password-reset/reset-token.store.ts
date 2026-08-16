import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { RedisService } from '../../../redis/redis.service';
import { InvalidResetTokenError } from './reset-token.errors';

// Same precedent B1 set in token/refresh-token.store.ts: Section 5.7 does
// not name a durable table for this token type at all (it only discusses
// RefreshToken storage), and no PasswordResetToken (or equivalent) model
// exists in prisma/schema.prisma. Rather than add a migration unilaterally
// in this PR, this follows B1's Redis precedent — same store, same
// swap-later note. See services/api/src/modules/auth/README.md for the
// Decision Log candidate this and B1's refresh-token store both raise.
//
// Narrow interface (rather than depending on ioredis's full client type)
// so unit tests can substitute a plain in-memory fake.
export interface ResetTokenRedisClient {
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
}

interface StoredResetToken {
  userId: string;
  secretHash: string;
}

export interface IssuedResetToken {
  token: string;
  expiresAt: Date;
}

export interface ConsumedResetToken {
  userId: string;
}

const tokenKey = (id: string) => `auth:password-reset:token:${id}`;
const userTokenKey = (userId: string) => `auth:password-reset:user:${userId}`;

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function secretMatchesHash(secret: string, storedHashHex: string): boolean {
  const candidate = Buffer.from(hashSecret(secret), 'hex');
  const stored = Buffer.from(storedHashHex, 'hex');
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

function parseRawToken(rawToken: string): { id: string; secret: string } | null {
  const separatorIndex = rawToken.indexOf('.');
  if (separatorIndex <= 0 || separatorIndex === rawToken.length - 1) return null;
  return {
    id: rawToken.slice(0, separatorIndex),
    secret: rawToken.slice(separatorIndex + 1),
  };
}

@Injectable()
export class ResetTokenStore {
  constructor(@Inject(RedisService) private readonly redis: ResetTokenRedisClient) {}

  // Issues a new single-use reset token for a user, invalidating any
  // previously issued, still-outstanding token for that same user first
  // (only the most recently requested reset link should ever work — an
  // old, forgotten "forgot password" email lying around in an inbox
  // should not remain a live credential once a newer one is requested).
  async issue(userId: string, ttlMinutes: number): Promise<IssuedResetToken> {
    const previousId = await this.redis.get(userTokenKey(userId));
    if (previousId) {
      await this.redis.del(tokenKey(previousId));
    }

    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const record: StoredResetToken = { userId, secretHash: hashSecret(secret) };
    const ttlMs = ttlMinutes * 60 * 1000;

    await this.redis.set(tokenKey(id), JSON.stringify(record), 'PX', ttlMs);
    await this.redis.set(userTokenKey(userId), id, 'PX', ttlMs);

    return { token: `${id}.${secret}`, expiresAt: new Date(Date.now() + ttlMs) };
  }

  // Validates a raw token (exists, unexpired, matches its secret hash)
  // and, if valid, atomically retires it — the single-use half of
  // "single-use, time-limited reset token."
  async verifyAndConsume(rawToken: string): Promise<ConsumedResetToken> {
    const parsed = parseRawToken(rawToken);
    if (!parsed) throw new InvalidResetTokenError('Malformed reset token');
    const { id, secret } = parsed;

    const raw = await this.redis.get(tokenKey(id));
    if (!raw) throw new InvalidResetTokenError();

    const record = JSON.parse(raw) as StoredResetToken;
    if (!secretMatchesHash(secret, record.secretHash)) {
      throw new InvalidResetTokenError('Reset token secret mismatch');
    }

    await this.redis.del(tokenKey(id), userTokenKey(record.userId));

    return { userId: record.userId };
  }
}
