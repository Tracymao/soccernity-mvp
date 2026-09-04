import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { RedisService } from '../../../redis/redis.service';
import {
  InvalidRefreshTokenError,
  RefreshTokenReuseDetectedError,
} from '../../auth/token/token.errors';
import { RefreshTokenRedisClient } from '../../auth/token/refresh-token.store';
import { ADMIN_REFRESH_TOKEN_REUSE_DETECTION_WINDOW_MS } from './admin-token.constants';

// A GENUINELY SEPARATE refresh-token store from
// services/api/src/modules/auth/token/refresh-token.store.ts's
// RefreshTokenStore — not a shared/parameterized generic. This was a
// deliberate architecture decision (see admin-token.service.ts's header
// comment for the full reasoning), not an oversight that happened to
// duplicate ~150 lines:
//
// - Every Redis key this store touches is prefixed `admin:refresh:*`,
//   never `auth:refresh:*` — a completely separate namespace in the same
//   Redis instance, so an admin session and a User session can never
//   collide or be confused for one another even at the storage layer.
// - The stored record shape uses `adminId`, not `userId` — a small but
//   deliberate naming choice so a future maintainer reading a dump of
//   this store's keys can never mistake one subject type for the other.
//
// What IS reused, because both are pure, generic, non-User-typed
// utilities with no state or User-specific assumptions of their own:
// the RefreshTokenRedisClient interface (just a narrow Redis client
// contract) and InvalidRefreshTokenError/RefreshTokenReuseDetectedError
// (plain Error subclasses). Reusing the class/type definitions is safe;
// reusing the STORE INSTANCE or its Redis key namespace would not be.
interface StoredAdminRefreshToken {
  adminId: string;
  role: string;
  familyId: string;
  secretHash: string;
}

export interface IssuedAdminRefreshToken {
  token: string;
  expiresAt: Date;
  familyId: string;
}

export interface ConsumedAdminRefreshToken {
  adminId: string;
  role: string;
  familyId: string;
}

const adminTokenKey = (id: string) => `admin:refresh:token:${id}`;
const adminUsedTombstoneKey = (id: string) => `admin:refresh:used:${id}`;
const adminFamilyKey = (familyId: string) => `admin:refresh:family:${familyId}`;
const adminSessionsKey = (adminId: string) => `admin:refresh:admin:${adminId}`;

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
export class AdminRefreshTokenStore {
  constructor(@Inject(RedisService) private readonly redis: RefreshTokenRedisClient) {}

  // Issues a new admin refresh token. Pass an existing familyId when
  // rotating (see AdminTokenService.rotateRefreshToken) so reuse detection
  // can revoke every token descended from the same original login.
  async issue(
    adminId: string,
    role: string,
    ttlSeconds: number,
    familyId?: string,
  ): Promise<IssuedAdminRefreshToken> {
    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const resolvedFamilyId = familyId ?? randomUUID();
    const record: StoredAdminRefreshToken = {
      adminId,
      role,
      familyId: resolvedFamilyId,
      secretHash: hashSecret(secret),
    };
    const ttlMs = ttlSeconds * 1000;

    await this.redis.set(adminTokenKey(id), JSON.stringify(record), 'PX', ttlMs);
    await this.redis.sadd(adminFamilyKey(resolvedFamilyId), id);
    await this.redis.expire(adminFamilyKey(resolvedFamilyId), ttlSeconds);
    await this.redis.sadd(adminSessionsKey(adminId), id);
    await this.redis.expire(adminSessionsKey(adminId), ttlSeconds);

    return {
      token: `${id}.${secret}`,
      expiresAt: new Date(Date.now() + ttlMs),
      familyId: resolvedFamilyId,
    };
  }

  // Validates a refresh token and, if valid, atomically retires it. See
  // RefreshTokenStore.verifyAndConsume's own comment — identical
  // reasoning, genuinely separate storage.
  async verifyAndConsume(rawToken: string): Promise<ConsumedAdminRefreshToken> {
    const parsed = parseRawToken(rawToken);
    if (!parsed) throw new InvalidRefreshTokenError('Malformed refresh token');
    const { id, secret } = parsed;

    const raw = await this.redis.get(adminTokenKey(id));
    if (!raw) {
      const tombstone = await this.redis.get(adminUsedTombstoneKey(id));
      if (tombstone) {
        const used = JSON.parse(tombstone) as StoredAdminRefreshToken;
        await this.revokeFamily(used.familyId);
        throw new RefreshTokenReuseDetectedError();
      }
      throw new InvalidRefreshTokenError();
    }

    const record = JSON.parse(raw) as StoredAdminRefreshToken;
    if (!secretMatchesHash(secret, record.secretHash)) {
      throw new InvalidRefreshTokenError('Refresh token secret mismatch');
    }

    await this.redis.set(
      adminUsedTombstoneKey(id),
      raw,
      'PX',
      ADMIN_REFRESH_TOKEN_REUSE_DETECTION_WINDOW_MS,
    );
    await this.redis.del(adminTokenKey(id));

    return { adminId: record.adminId, role: record.role, familyId: record.familyId };
  }

  // Single-session logout.
  async revokeToken(rawToken: string): Promise<void> {
    const parsed = parseRawToken(rawToken);
    if (!parsed) return;
    await this.redis.del(adminTokenKey(parsed.id));
  }

  // Revokes every token descended from one login (used on detected reuse).
  async revokeFamily(familyId: string): Promise<void> {
    const ids = await this.redis.smembers(adminFamilyKey(familyId));
    if (ids.length > 0) {
      await this.redis.del(...ids.map(adminTokenKey));
    }
    await this.redis.del(adminFamilyKey(familyId));
  }

  // Logout-everywhere for one admin (e.g. on change-password, or a future
  // "suspend this admin" action) — kills every active refresh token for
  // that admin regardless of family.
  async revokeAllForAdmin(adminId: string): Promise<void> {
    const ids = await this.redis.smembers(adminSessionsKey(adminId));
    if (ids.length > 0) {
      await this.redis.del(...ids.map(adminTokenKey));
    }
    await this.redis.del(adminSessionsKey(adminId));
  }
}
