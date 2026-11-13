import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RefreshTokenStore } from './refresh-token.store';
import {
  DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
  DEFAULT_REFRESH_TOKEN_TTL_DAYS,
} from './token.constants';
import { AccessTokenPayload, AccessTokenResult, TokenPair } from './token.types';
import {
  isIssuedBeforeRevocation,
  parseRevocationMarker,
  reportRevocationCheckFailure,
  revocationMarkerTtlMs,
  wholeSecondsNow,
} from '../../../session-revocation/session-revocation';

// Build Plan Section 5.7's concrete auth spec, owned by this service:
// short-lived access token (JWT) + rotating, revocable refresh token
// (opaque, Redis-backed — see RefreshTokenStore). Callers (B2-B4's
// register/login/refresh/logout endpoints) should depend on this service,
// not JwtService or RefreshTokenStore directly.
@Injectable()
export class TokenService {
  private readonly accessTokenTtlSeconds: number;
  private readonly refreshTokenTtlSeconds: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly refreshTokenStore: RefreshTokenStore,
    @Inject(ConfigService) configService: ConfigService,
  ) {
    this.accessTokenTtlSeconds =
      Number(configService.get('JWT_ACCESS_TTL_SECONDS')) || DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
    const refreshTtlDays =
      Number(configService.get('JWT_REFRESH_TTL_DAYS')) || DEFAULT_REFRESH_TOKEN_TTL_DAYS;
    this.refreshTokenTtlSeconds = refreshTtlDays * 24 * 60 * 60;
  }

  // Issues a brand-new session (e.g. on login/register) — starts a new
  // refresh-token family.
  async issueTokenPair(userId: string, role: string, persistent = false): Promise<TokenPair> {
    const accessToken = this.signAccessToken(userId, role);
    const refreshToken = await this.refreshTokenStore.issue(
      userId,
      role,
      this.refreshTokenTtlSeconds,
      undefined,
      persistent,
    );
    return { accessToken, refreshToken, persistent };
  }

  // Consumes a refresh token and issues a replacement pair in the same
  // family — the "rotated on every use" half of Section 5.7. Propagates
  // InvalidRefreshTokenError / RefreshTokenReuseDetectedError from the
  // store as-is so callers can distinguish "log in again" from "possible
  // token theft."
  async rotateRefreshToken(rawRefreshToken: string): Promise<TokenPair> {
    const consumed = await this.refreshTokenStore.verifyAndConsume(rawRefreshToken);
    const accessToken = this.signAccessToken(consumed.userId, consumed.role);
    const refreshToken = await this.refreshTokenStore.issue(
      consumed.userId,
      consumed.role,
      this.refreshTokenTtlSeconds,
      consumed.familyId,
      consumed.persistent,
    );
    return { accessToken, refreshToken, persistent: consumed.persistent };
  }

  // Verifies an access token's signature and expiry. Deliberately returns
  // only { sub, role } — see AccessTokenPayload for why isMinor /
  // consentStatus must never be added here.
  verifyAccessToken(token: string): AccessTokenPayload {
    return this.verifyWithIssuedAt(token).payload;
  }

  // B-305 (Decision Log #500): what the guards call. Verifies the token exactly as verifyAccessToken does, THEN
  // refuses it when the user's sessions were revoked after it was issued (the Redis marker written by
  // revokeAllSessionsForUser; compared with the token's standard `iat`). The refusal is the same 401 as an invalid
  // token. If Redis cannot be read the token is accepted (fail open): the failure is logged and sent to Sentry
  // (tag session_revocation=user) and never thrown. Still returns only { sub, role }.
  async verifyActiveAccessToken(token: string): Promise<AccessTokenPayload> {
    const { payload, issuedAt } = this.verifyWithIssuedAt(token);
    let marker: number | null = null;
    try {
      marker = parseRevocationMarker(await this.refreshTokenStore.getSessionsRevokedAt(payload.sub));
    } catch (err) {
      reportRevocationCheckFailure('user', err);
      return payload;
    }
    if (isIssuedBeforeRevocation(issuedAt, marker)) {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    return payload;
  }

  private verifyWithIssuedAt(token: string): { payload: AccessTokenPayload; issuedAt: number | undefined } {
    try {
      const decoded = this.jwtService.verify<AccessTokenPayload & { iat?: number }>(token);
      return { payload: { sub: decoded.sub, role: decoded.role }, issuedAt: decoded.iat };
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  // B-310: whether the caller's CURRENT refresh token is a "Stay signed in" one, read without consuming it. See
  // RefreshTokenStore.peekPersistent. Must be called BEFORE revokeAllSessionsForUser, which deletes the record.
  async isRefreshTokenPersistent(rawRefreshToken: string | undefined, userId: string): Promise<boolean> {
    if (!rawRefreshToken) return false;
    return this.refreshTokenStore.peekPersistent(rawRefreshToken, userId);
  }

  async revokeRefreshToken(rawRefreshToken: string): Promise<void> {
    await this.refreshTokenStore.revokeToken(rawRefreshToken);
  }

  // Logout-everywhere / admin-triggered revocation (Build Plan Section
  // 8.4 moderation & appeals workflow).
  // B-305: also stops access tokens already issued -- see verifyActiveAccessToken. The marker is written AFTER the
  // refresh tokens are gone; a Redis failure there propagates like the revocation's own would (a half-done
  // revocation is not reported as done).
  async revokeAllSessionsForUser(userId: string): Promise<void> {
    await this.refreshTokenStore.revokeAllForUser(userId);
    await this.refreshTokenStore.markSessionsRevoked(
      userId,
      wholeSecondsNow(),
      revocationMarkerTtlMs(this.accessTokenTtlSeconds),
    );
  }

  private signAccessToken(userId: string, role: string): AccessTokenResult {
    const payload: AccessTokenPayload = { sub: userId, role };
    const token = this.jwtService.sign(payload, { expiresIn: this.accessTokenTtlSeconds });
    return { token, expiresIn: this.accessTokenTtlSeconds };
  }
}
