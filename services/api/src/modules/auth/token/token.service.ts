import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RefreshTokenStore } from './refresh-token.store';
import {
  DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
  DEFAULT_REFRESH_TOKEN_TTL_DAYS,
} from './token.constants';
import { AccessTokenPayload, AccessTokenResult, TokenPair } from './token.types';

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
  async issueTokenPair(userId: string, role: string): Promise<TokenPair> {
    const accessToken = this.signAccessToken(userId, role);
    const refreshToken = await this.refreshTokenStore.issue(
      userId,
      role,
      this.refreshTokenTtlSeconds,
    );
    return { accessToken, refreshToken };
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
    );
    return { accessToken, refreshToken };
  }

  // Verifies an access token's signature and expiry. Deliberately returns
  // only { sub, role } — see AccessTokenPayload for why isMinor /
  // consentStatus must never be added here.
  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const decoded = this.jwtService.verify<AccessTokenPayload>(token);
      return { sub: decoded.sub, role: decoded.role };
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  async revokeRefreshToken(rawRefreshToken: string): Promise<void> {
    await this.refreshTokenStore.revokeToken(rawRefreshToken);
  }

  // Logout-everywhere / admin-triggered revocation (Build Plan Section
  // 8.4 moderation & appeals workflow).
  async revokeAllSessionsForUser(userId: string): Promise<void> {
    await this.refreshTokenStore.revokeAllForUser(userId);
  }

  private signAccessToken(userId: string, role: string): AccessTokenResult {
    const payload: AccessTokenPayload = { sub: userId, role };
    const token = this.jwtService.sign(payload, { expiresIn: this.accessTokenTtlSeconds });
    return { token, expiresIn: this.accessTokenTtlSeconds };
  }
}
