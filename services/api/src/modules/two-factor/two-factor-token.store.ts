import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { RedisService } from '../../redis/redis.service';
import { TwoFactorAudience } from './two-factor.constants';

// Short-lived opaque tokens that stand between "the password was right" and "a session exists". Same id.secret
// pattern as password-reset/reset-token.store.ts: the token is `<uuid>.<random secret>`, only a SHA-256 of the
// secret is stored, and it lives in Redis with a TTL (so, as accepted in Decision Log #439, an outage of Redis
// makes second-factor sign-in unavailable).
//
// THREE KINDS, three disjoint key namespaces, so a token of one kind can never work on another kind's endpoint:
//   user-login    issued by POST /auth/login (or /auth/reactivate-account) for an account with two-factor on
//   admin-login   issued by POST /admin/auth/login for an admin with two-factor on
//   admin-enrol   issued by POST /admin/auth/login for an admin WITHOUT two-factor while ADMIN_2FA_ENFORCED is "true"
// The kind is also stored inside the record and checked on read (defence in depth).
//
// A token is consumed (deleted) only on SUCCESS, never on a wrong code: a typo must not force a new sign-in. Wrong
// codes are bounded by the per-account attempt limiter instead. The consume is a DEL whose return value is the
// atomic gate: of two concurrent successes, exactly one sees 1.
export type TwoFactorTokenKind = 'user-login' | 'admin-login' | 'admin-enrol';

// What the token is for: an ordinary sign-in, or a reactivation of a deactivated account (which also needs the
// second factor, otherwise reactivate-account would be a way round it).
export type TwoFactorTokenPurpose = 'login' | 'reactivate';

export interface TwoFactorTokenRedisClient {
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
}

interface StoredToken {
  kind: TwoFactorTokenKind;
  subjectId: string;
  secretHash: string;
  persistent: boolean;
  purpose: TwoFactorTokenPurpose;
}

export interface PeekedToken {
  id: string;
  subjectId: string;
  persistent: boolean;
  purpose: TwoFactorTokenPurpose;
}

export interface IssuedTwoFactorToken {
  token: string;
  expiresInSeconds: number;
}

const tokenKey = (kind: TwoFactorTokenKind, id: string) => `2fa:token:${kind}:${id}`;

const hashSecret = (secret: string) => createHash('sha256').update(secret).digest('hex');

function secretMatches(secret: string, storedHashHex: string): boolean {
  const candidate = Buffer.from(hashSecret(secret), 'hex');
  const stored = Buffer.from(storedHashHex, 'hex');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

function parseRawToken(raw: string): { id: string; secret: string } | null {
  const i = raw.indexOf('.');
  if (i <= 0 || i === raw.length - 1) return null;
  return { id: raw.slice(0, i), secret: raw.slice(i + 1) };
}

export function audienceOfKind(kind: TwoFactorTokenKind): TwoFactorAudience {
  return kind === 'user-login' ? 'user' : 'admin';
}

@Injectable()
export class TwoFactorTokenStore {
  constructor(@Inject(RedisService) private readonly redis: TwoFactorTokenRedisClient) {}

  async issue(
    kind: TwoFactorTokenKind,
    subjectId: string,
    ttlSeconds: number,
    options: { persistent?: boolean; purpose?: TwoFactorTokenPurpose } = {},
  ): Promise<IssuedTwoFactorToken> {
    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const record: StoredToken = {
      kind,
      subjectId,
      secretHash: hashSecret(secret),
      persistent: options.persistent === true,
      purpose: options.purpose ?? 'login',
    };
    await this.redis.set(tokenKey(kind, id), JSON.stringify(record), 'EX', ttlSeconds);
    return { token: `${id}.${secret}`, expiresInSeconds: ttlSeconds };
  }

  // Reads a token WITHOUT consuming it. null for anything wrong (malformed, unknown, expired, wrong secret, wrong
  // kind): the caller turns every null into the same generic 401.
  async peek(kind: TwoFactorTokenKind, rawToken: unknown): Promise<PeekedToken | null> {
    if (typeof rawToken !== 'string') return null;
    const parsed = parseRawToken(rawToken);
    if (!parsed) return null;
    const raw = await this.redis.get(tokenKey(kind, parsed.id));
    if (!raw) return null;
    let record: StoredToken;
    try {
      record = JSON.parse(raw) as StoredToken;
    } catch {
      return null;
    }
    if (record.kind !== kind || !secretMatches(parsed.secret, record.secretHash)) return null;
    return { id: parsed.id, subjectId: record.subjectId, persistent: record.persistent, purpose: record.purpose ?? 'login' };
  }

  // true for the one caller that actually removed it.
  async consume(kind: TwoFactorTokenKind, id: string): Promise<boolean> {
    return (await this.redis.del(tokenKey(kind, id))) === 1;
  }
}
