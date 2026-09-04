import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminRefreshTokenStore } from './admin-refresh-token.store';
import {
  ADMIN_TOKEN_AUDIENCE,
  DEFAULT_ADMIN_ACCESS_TOKEN_TTL_SECONDS,
  DEFAULT_ADMIN_REFRESH_TOKEN_TTL_DAYS,
} from './admin-token.constants';
import { AdminAccessTokenPayload, AdminAccessTokenResult, AdminTokenPair } from './admin-token.types';

// ---------------------------------------------------------------------
// Decision Log #54 (Build Plan Section 9): the Admin Console needed its
// own, genuinely separate login/session path, NOT a reuse of
// services/api/src/modules/auth/token/token.service.ts's TokenService.
// This class mirrors TokenService's shape and behavior closely
// (short-lived JWT access token + rotating, revocable opaque refresh
// token, per Build Plan Section 5.7's spec — the same spec applies to
// both subject types, nothing about it is User-specific) but is a
// deliberately distinct implementation, injected with its OWN JwtService
// instance (see admin-auth-foundation.module.ts's own
// JwtModule.registerAsync, configured from ADMIN_JWT_SECRET, never
// JWT_SECRET) and its OWN AdminRefreshTokenStore (see that file's header
// comment for why the Redis-layer separation matters too).
//
// WHY GENUINELY SEPARATE, NOT A SHARED/PARAMETERIZED GENERIC:
// TokenService.verifyAccessToken() is one of this codebase's
// non-negotiables (Build Plan Section 5.7 / CLAUDE.md) — it must only
// ever accept a User-issued access token, decode it, and hand back
// { sub, role } that every JwtAuthGuard-protected route then trusts as
// "this is a real, currently-valid User." If AdminTokenService reused
// the SAME JwtService/signing secret as TokenService, then any bug that
// let a User's own `role` field ever be set to the literal string
// "admin" (schema.prisma's own comment on User.role already lists
// "admin" as a theoretically possible value, even though no endpoint in
// this codebase ever sets it — confirmed by grep) would let that User's
// perfectly ordinary access token forge a valid admin session purely by
// having a matching role string, with nothing structurally preventing
// it. Two independent, deliberate layers close that off completely:
//
// 1. ADMIN_JWT_SECRET is a wholly separate signing secret from
//    JWT_SECRET (see .env.example's own comment). A token signed by one
//    JwtService instance fails signature verification outright against
//    the other's secret — this is the actual cryptographic proof of
//    isolation, not a convention that relies on every future caller
//    remembering to check a claim correctly.
// 2. AdminAccessTokenPayload carries an `aud: "admin-console"`
//    discriminator claim (admin-token.constants.ts), checked explicitly
//    below, as a second, defense-in-depth layer on top of #1 — e.g. in
//    case ADMIN_JWT_SECRET and JWT_SECRET were ever accidentally set to
//    the same value in some future misconfigured environment.
//
// This is proven, not just argued, in
// admin-auth-isolation.e2e-spec.ts — see services/api/test/README.md's
// matching entry: a real User access token is confirmed to fail
// AdminJwtAuthGuard, and a real admin access token is confirmed to fail
// the User-facing JwtAuthGuard, against a genuinely bootstrapped app with
// both real JwtService instances wired in side by side.
// ---------------------------------------------------------------------
@Injectable()
export class AdminTokenService {
  private readonly accessTokenTtlSeconds: number;
  private readonly refreshTokenTtlSeconds: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly refreshTokenStore: AdminRefreshTokenStore,
    @Inject(ConfigService) configService: ConfigService,
  ) {
    this.accessTokenTtlSeconds =
      Number(configService.get('ADMIN_JWT_ACCESS_TTL_SECONDS')) ||
      DEFAULT_ADMIN_ACCESS_TOKEN_TTL_SECONDS;
    const refreshTtlDays =
      Number(configService.get('ADMIN_JWT_REFRESH_TTL_DAYS')) ||
      DEFAULT_ADMIN_REFRESH_TOKEN_TTL_DAYS;
    this.refreshTokenTtlSeconds = refreshTtlDays * 24 * 60 * 60;
  }

  // Issues a brand-new session (e.g. on admin login) — starts a new
  // refresh-token family.
  async issueTokenPair(adminId: string, role: string): Promise<AdminTokenPair> {
    const accessToken = this.signAccessToken(adminId, role);
    const refreshToken = await this.refreshTokenStore.issue(
      adminId,
      role,
      this.refreshTokenTtlSeconds,
    );
    return { accessToken, refreshToken };
  }

  // Consumes a refresh token and issues a replacement pair in the same
  // family — the "rotated on every use" half of Section 5.7.
  async rotateRefreshToken(rawRefreshToken: string): Promise<AdminTokenPair> {
    const consumed = await this.refreshTokenStore.verifyAndConsume(rawRefreshToken);
    const accessToken = this.signAccessToken(consumed.adminId, consumed.role);
    const refreshToken = await this.refreshTokenStore.issue(
      consumed.adminId,
      consumed.role,
      this.refreshTokenTtlSeconds,
      consumed.familyId,
    );
    return { accessToken, refreshToken };
  }

  // Verifies an admin access token's signature, expiry, AND audience
  // claim (see this class's header comment for why both checks matter).
  // Deliberately returns only { sub, role, aud } — nothing
  // safety/state-sensitive (e.g. accountStatus) is ever put in the token
  // itself; every safety-sensitive check must re-read Postgres.
  verifyAccessToken(token: string): AdminAccessTokenPayload {
    try {
      const decoded = this.jwtService.verify<AdminAccessTokenPayload>(token);
      if (decoded.aud !== ADMIN_TOKEN_AUDIENCE) {
        throw new Error('Token is not an admin-console token');
      }
      return { sub: decoded.sub, role: decoded.role, aud: ADMIN_TOKEN_AUDIENCE };
    } catch {
      throw new UnauthorizedException('Invalid or expired admin access token');
    }
  }

  async revokeRefreshToken(rawRefreshToken: string): Promise<void> {
    await this.refreshTokenStore.revokeToken(rawRefreshToken);
  }

  // Logout-everywhere for one admin (e.g. on change-password).
  async revokeAllSessionsForAdmin(adminId: string): Promise<void> {
    await this.refreshTokenStore.revokeAllForAdmin(adminId);
  }

  private signAccessToken(adminId: string, role: string): AdminAccessTokenResult {
    const payload: AdminAccessTokenPayload = { sub: adminId, role, aud: ADMIN_TOKEN_AUDIENCE };
    const token = this.jwtService.sign(payload, { expiresIn: this.accessTokenTtlSeconds });
    return { token, expiresIn: this.accessTokenTtlSeconds };
  }
}
