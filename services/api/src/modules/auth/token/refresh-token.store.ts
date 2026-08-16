import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { RedisService } from '../../../redis/redis.service';
import { REFRESH_TOKEN_REUSE_DETECTION_WINDOW_MS } from './token.constants';
import { InvalidRefreshTokenError, RefreshTokenReuseDetectedError } from './token.errors';

// Build Plan Section 5.7 flags that refresh-token revocability needs "a
// RefreshToken table or Redis set, not a stateless-only design." No
// RefreshToken (or equivalent) model exists in prisma/schema.prisma today
// — adding one is a Section 3 schema change, which is explicitly not this
// infra PR's call to make unilaterally (see the report accompanying this
// PR). Redis is already an approved, provisioned part of the stack
// (Section 5, docker-compose.yml), so this store uses it for now. If a
// durable RefreshToken table is added later, this is the one place that
// swap needs to happen.
//
// Narrow interface (rather than depending on ioredis's full client type)
// so unit tests can substitute an in-memory fake without needing a real
// Redis instance.
export interface RefreshTokenRedisClient {
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  sadd(key: string, member: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
  expire(key: string, seconds: number): Promise<number>;
}

interface StoredRefreshToken {
  userId: string;
  role: string;
  familyId: string;
  secretHash: string;
}

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
  familyId: string;
}

export interface ConsumedRefreshToken {
  userId: string;
  role: string;
  familyId: string;
}

const tokenKey = (id: string) => `auth:refresh:token:${id}`;
const usedTombstoneKey = (id: string) => `auth:refresh:used:${id}`;
const familyKey = (familyId: string) => `auth:refresh:family:${familyId}`;
const userSessionsKey = (userId: string) => `auth:refresh:user:${userId}`;

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
export class RefreshTokenStore {
  constructor(@Inject(RedisService) private readonly redis: RefreshTokenRedisClient) {}

  // Issues a new refresh token. Pass an existing familyId when rotating
  // (see TokenService.rotateRefreshToken) so reuse detection can revoke
  // every token descended from the same original login.
  async issue(
    userId: string,
    role: string,
    ttlSeconds: number,
    familyId?: string,
  ): Promise<IssuedRefreshToken> {
    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const resolvedFamilyId = familyId ?? randomUUID();
    const record: StoredRefreshToken = {
      userId,
      role,
      familyId: resolvedFamilyId,
      secretHash: hashSecret(secret),
    };
    const ttlMs = ttlSeconds * 1000;

    await this.redis.set(tokenKey(id), JSON.stringify(record), 'PX', ttlMs);
    await this.redis.sadd(familyKey(resolvedFamilyId), id);
    await this.redis.expire(familyKey(resolvedFamilyId), ttlSeconds);
    await this.redis.sadd(userSessionsKey(userId), id);
    await this.redis.expire(userSessionsKey(userId), ttlSeconds);

    return {
      token: `${id}.${secret}`,
      expiresAt: new Date(Date.now() + ttlMs),
      familyId: resolvedFamilyId,
    };
  }

  // Validates a refresh token and, if valid, atomically retires it (the
  // "rotating" half of "rotating refresh token"). The caller is
  // responsible for issuing the replacement in the same family. Reusing an
  // already-consumed token — a signal the token was stolen and both the
  // legitimate client and an attacker are now racing to use it — revokes
  // the whole family rather than just failing this one call.
  async verifyAndConsume(rawToken: string): Promise<ConsumedRefreshToken> {
    const parsed = parseRawToken(rawToken);
    if (!parsed) throw new InvalidRefreshTokenError('Malformed refresh token');
    const { id, secret } = parsed;

    const raw = await this.redis.get(tokenKey(id));
    if (!raw) {
      const tombstone = await this.redis.get(usedTombstoneKey(id));
      if (tombstone) {
        const used = JSON.parse(tombstone) as StoredRefreshToken;
        await this.revokeFamily(used.familyId);
        throw new RefreshTokenReuseDetectedError();
      }
      throw new InvalidRefreshTokenError();
    }

    const record = JSON.parse(raw) as StoredRefreshToken;
    if (!secretMatchesHash(secret, record.secretHash)) {
      throw new InvalidRefreshTokenError('Refresh token secret mismatch');
    }

    await this.redis.set(usedTombstoneKey(id), raw, 'PX', REFRESH_TOKEN_REUSE_DETECTION_WINDOW_MS);
    await this.redis.del(tokenKey(id));

    return { userId: record.userId, role: record.role, familyId: record.familyId };
  }

  // Single-session logout.
  async revokeToken(rawToken: string): Promise<void> {
    const parsed = parseRawToken(rawToken);
    if (!parsed) return;
    await this.redis.del(tokenKey(parsed.id));
  }

  // Revokes every token descended from one login (used on detected reuse,
  // and available for "log out this device chain" style flows later).
  async revokeFamily(familyId: string): Promise<void> {
    const ids = await this.redis.smembers(familyKey(familyId));
    if (ids.length > 0) {
      await this.redis.del(...ids.map(tokenKey));
    }
    await this.redis.del(familyKey(familyId));
  }

  // Logout-everywhere / admin-triggered revocation (e.g. a moderator
  // suspending an account per Build Plan Section 8.4) — kills every active
  // refresh token for a user regardless of family.
  async revokeAllForUser(userId: string): Promise<void> {
    const ids = await this.redis.smembers(userSessionsKey(userId));
    if (ids.length > 0) {
      await this.redis.del(...ids.map(tokenKey));
    }
    await this.redis.del(userSessionsKey(userId));
  }
}
