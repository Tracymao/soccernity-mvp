import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { RedisService } from '../../redis/redis.service';
import {
  SOCIAL_EMAIL_CODE_LENGTH,
  SOCIAL_EMAIL_CODE_MAX_ATTEMPTS,
  SOCIAL_EMAIL_CODE_MAX_SENDS,
  SOCIAL_EMAIL_CODE_TTL_SECONDS,
  SOCIAL_REGISTRATION_TTL_SECONDS,
  SOCIAL_STATE_TTL_SECONDS,
  SocialProvider,
} from './social-auth.constants';

// The slice of ioredis these stores use, so a unit test can hand in an in-memory stand-in.
export interface SocialRedisClient {
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

// Every key is derived from a SHA-256 of the secret, never the secret itself, so a Redis dump or a key listing
// holds no live token, state or code.
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const base64url = (buf: Buffer) => buf.toString('base64url');

// ---------------------------------------------------------------------------------------------------------------------
// OAuth state + PKCE verifier (between "start" and "callback")
// ---------------------------------------------------------------------------------------------------------------------

export interface SocialStatePayload {
  provider: SocialProvider;
  codeVerifier: string;
  // The "Stay signed in" choice made on the page that started the flow; applied if the callback signs the person in.
  persistent: boolean;
}

export const codeChallengeFor = (codeVerifier: string): string => base64url(createHash('sha256').update(codeVerifier).digest());

@Injectable()
export class SocialAuthStateStore {
  constructor(@Inject(RedisService) private readonly redis: SocialRedisClient) {}

  // `state` is 32 random bytes; the PKCE verifier is 48 random bytes (64 base64url characters, inside RFC 7636's
  // 43-128). Returns the secrets the caller needs to build the authorisation URL.
  async issue(provider: SocialProvider, persistent: boolean): Promise<{ state: string; codeVerifier: string; codeChallenge: string }> {
    const state = base64url(randomBytes(32));
    const codeVerifier = base64url(randomBytes(48));
    const payload: SocialStatePayload = { provider, codeVerifier, persistent };
    await this.redis.set(`social:state:${sha256(state)}`, JSON.stringify(payload), 'EX', SOCIAL_STATE_TTL_SECONDS);
    return { state, codeVerifier, codeChallenge: codeChallengeFor(codeVerifier) };
  }

  // Single use. `del` returning 1 is the atomic claim: of two simultaneous callbacks with the same state only one
  // proceeds. Anything missing, expired, spent or malformed is null.
  async consume(state: string): Promise<SocialStatePayload | null> {
    const key = `social:state:${sha256(state)}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    if ((await this.redis.del(key)) !== 1) return null;
    try {
      const parsed = JSON.parse(raw) as SocialStatePayload;
      return parsed && typeof parsed.codeVerifier === 'string' ? parsed : null;
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The social registration token (after the provider proved identity, before the account exists)
// ---------------------------------------------------------------------------------------------------------------------

// What the registration completes the account FROM. Short-lived personal data in Redis (display name, email), gone
// when the account is created, when the token expires (30 minutes), or when it is replaced.
export interface SocialRegistrationPayload {
  provider: SocialProvider;
  providerAccountId: string;
  displayName: string;
  // null when the provider gave none (or when it is not usable): the person then enters and verifies one first.
  email: string | null;
  // True only if the address is PROVEN: Google said so, or the person verified it with a code before any account existed.
  emailVerified: boolean;
}

export type EmailCodeCheck = 'ok' | 'wrong' | 'expired';

@Injectable()
export class SocialRegistrationStore {
  constructor(@Inject(RedisService) private readonly redis: SocialRedisClient) {}

  private regKey = (token: string) => `social:reg:${sha256(token)}`;
  private codeKey = (token: string) => `social:reg-code:${sha256(token)}`;
  private attemptsKey = (token: string) => `social:reg-attempts:${sha256(token)}`;
  private sendsKey = (token: string) => `social:reg-sends:${sha256(token)}`;

  // An opaque, unguessable, server-held token (the repo's existing pattern for the two-factor challenge and the
  // email-verification link) rather than a self-contained signed one: it is single-purpose by construction, can be
  // revoked, and cannot be replayed once the account exists.
  async issue(payload: SocialRegistrationPayload): Promise<string> {
    const token = base64url(randomBytes(32));
    await this.redis.set(this.regKey(token), JSON.stringify(payload), 'EX', SOCIAL_REGISTRATION_TTL_SECONDS);
    return token;
  }

  async peek(token: string): Promise<SocialRegistrationPayload | null> {
    const raw = await this.redis.get(this.regKey(token));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as SocialRegistrationPayload;
      return parsed && typeof parsed.providerAccountId === 'string' ? parsed : null;
    } catch {
      return null;
    }
  }

  // Replaces the stored payload (used once the person has verified their email) and restarts the 30 minutes.
  async replace(token: string, payload: SocialRegistrationPayload): Promise<void> {
    await this.redis.set(this.regKey(token), JSON.stringify(payload), 'EX', SOCIAL_REGISTRATION_TTL_SECONDS);
  }

  // Deletes the token and everything hanging off it. Best effort after a successful sign-up; the database's unique
  // constraints (email, provider identity) are what actually stop a replay from creating a second account.
  async discard(token: string): Promise<void> {
    await this.redis.del(this.regKey(token), this.codeKey(token), this.attemptsKey(token), this.sendsKey(token));
  }

  // -- the email code (Facebook, or any provider, that returned no email) --

  // Reserves one of the token's allowed sends and stores a fresh code for `email` (replacing any earlier one). Returns
  // the plain code to email, or null if the token has used up its sends.
  async startEmailCode(token: string, email: string): Promise<string | null> {
    const sends = await this.redis.incr(this.sendsKey(token));
    if (sends === 1) await this.redis.expire(this.sendsKey(token), SOCIAL_REGISTRATION_TTL_SECONDS);
    if (sends > SOCIAL_EMAIL_CODE_MAX_SENDS) return null;

    const code = String(randomInt(0, 10 ** SOCIAL_EMAIL_CODE_LENGTH)).padStart(SOCIAL_EMAIL_CODE_LENGTH, '0');
    await this.redis.set(this.codeKey(token), JSON.stringify({ email, codeHash: this.hashCode(token, code) }), 'EX', SOCIAL_EMAIL_CODE_TTL_SECONDS);
    await this.redis.del(this.attemptsKey(token));
    return code;
  }

  // 'ok' returns the email the code was sent to. Wrong guesses are counted atomically per token; past the cap the code
  // is discarded ('expired') and a new one must be requested.
  async checkEmailCode(token: string, code: string): Promise<{ result: EmailCodeCheck; email?: string }> {
    const raw = await this.redis.get(this.codeKey(token));
    if (!raw) return { result: 'expired' };

    const attempts = await this.redis.incr(this.attemptsKey(token));
    if (attempts === 1) await this.redis.expire(this.attemptsKey(token), SOCIAL_EMAIL_CODE_TTL_SECONDS);
    if (attempts > SOCIAL_EMAIL_CODE_MAX_ATTEMPTS) {
      await this.redis.del(this.codeKey(token), this.attemptsKey(token));
      return { result: 'expired' };
    }

    let stored: { email: string; codeHash: string };
    try {
      stored = JSON.parse(raw) as { email: string; codeHash: string };
    } catch {
      return { result: 'expired' };
    }
    const given = Buffer.from(this.hashCode(token, code.trim()), 'hex');
    const want = Buffer.from(stored.codeHash, 'hex');
    if (given.length !== want.length || !timingSafeEqual(given, want)) return { result: 'wrong' };

    // The code is single use: claim it with del's count so two simultaneous correct submissions cannot both pass.
    // (The code key alone: the attempts counter is re-created by every concurrent check, so counting it would let a
    // second submission through.)
    if ((await this.redis.del(this.codeKey(token))) !== 1) return { result: 'expired' };
    await this.redis.del(this.attemptsKey(token));
    return { result: 'ok', email: stored.email };
  }

  // Bound to the token as well as the code, so a code is only ever valid for the registration it was sent for.
  private hashCode(token: string, code: string): string {
    return sha256(`${sha256(token)}:${code}`);
  }
}
