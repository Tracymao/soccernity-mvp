import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Headers,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  USER_SESSION_COOKIE,
  applyCookieSession,
  assertAllowedCookieOrigin,
  clearRefreshCookie,
  isCookieMode,
  readRefreshCookie,
} from '../../session-cookie/session-cookie';
import { AuthService } from './auth.service';
import { CurrentUser } from './guards/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AccessTokenPayload } from './token/token.types';
import { AuthRateLimit } from './rate-limit/auth-rate-limit.decorator';
import { AuthLimit } from './rate-limit/auth-limits/auth-limits.interceptor';
import { AuthResponse, TokenPairResponse } from './auth-response.mapper';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeactivateAccountDto } from './dto/deactivate-account.dto';
import { DeleteInactiveAccountDto } from './dto/delete-inactive-account.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { ReactivateAccountDto } from './dto/reactivate-account.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RefreshRateLimit, SkipGlobalWriteLimit } from '../../rate-limit/global-rate-limit.decorators';
import { TwoFactorLoginDto } from '../two-factor/dto/two-factor-login.dto';
import { TwoFactorLockInterceptor } from '../two-factor/two-factor-lock.interceptor';
import { USER_CODE_IP_LIMIT } from '../two-factor/two-factor.constants';
import { TwoFactorChallenge } from '../two-factor/two-factor.service';

// Same messages class-validator produced for the old required `refreshToken`, so a body missing
// the token outside cookie mode is the same 400 as before.
const MISSING_REFRESH_TOKEN_MESSAGES = ['refreshToken should not be empty', 'refreshToken must be a string'];

function extractBearerToken(authorizationHeader: string | undefined): string | undefined {
  if (!authorizationHeader) return undefined;
  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return undefined;
  return token;
}

// Build Plan Section 4.1 lists /auth/login; /auth/refresh and /auth/logout
// are this PR's build-out of Section 5.7's rotating/revocable refresh
// token spec (see auth.service.ts's header comment — flagged as a
// Section 4 addition candidate, not a silent deviation).
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // security/auth-limits-shared-networks: per-account failed-attempt budget + per-IP ceiling (not the shared
  // 5-per-60s-per-IP auth throttler, which locked out a classroom behind one address).
  @SkipGlobalWriteLimit()
  @AuthLimit('login')
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req?: Request,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<AuthResponse | Omit<AuthResponse, 'refreshToken'> | TwoFactorChallenge> {
    const staySignedIn = dto.staySignedIn === true;
    const result = await this.authService.login(dto.email, dto.password, staySignedIn);
    // B-086: an account with two-factor on gets a challenge, never a session and never a cookie.
    if ('twoFactorRequired' in result) return result;
    return applyCookieSession(USER_SESSION_COOKIE, req, res, result, staySignedIn);
  }

  // B-086 (Decision Log #446): the second step of sign-in for an account with two-factor on. The body is the opaque
  // challenge from the password step plus a 6-digit authenticator code OR a backup code. On success it issues the
  // session exactly as login() does (cookie mode included), keeping the "Stay signed in" choice made at the
  // password step. A wrong code and an already-used code give the same 401; a locked account a 429 with Retry-After.
  // Not an @AuthLimit('login') route: wrong codes are bounded by the per-account lock in TwoFactorService, plus this
  // per-IP limit (30 per 15 minutes; a school can share an address).
  @SkipGlobalWriteLimit()
  @AuthRateLimit(USER_CODE_IP_LIMIT)
  @UseInterceptors(TwoFactorLockInterceptor)
  @Post('login/two-factor')
  @HttpCode(HttpStatus.OK)
  async loginTwoFactor(
    @Body() dto: TwoFactorLoginDto,
    @Req() req?: Request,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<AuthResponse | Omit<AuthResponse, 'refreshToken'>> {
    const { response, persistent } = await this.authService.completeTwoFactorLogin(dto.challengeToken, dto.code);
    return applyCookieSession(USER_SESSION_COOKIE, req, res, response, persistent);
  }

  // Not in the global write class (the two refresh classes below replace it): a classroom whose access
  // tokens expire together would otherwise burn the same 30-per-minute per-IP budget as sign-in. Admin
  // refresh is unchanged. 240/min per IP and 10/min per token are founder-veto-able defaults.
  @SkipGlobalWriteLimit()
  @RefreshRateLimit()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req?: Request,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<TokenPairResponse | Omit<TokenPairResponse, 'refreshToken'>> {
    if (!req || !res || !isCookieMode(req)) {
      if (!dto.refreshToken) throw new BadRequestException(MISSING_REFRESH_TOKEN_MESSAGES);
      return this.authService.refresh(dto.refreshToken);
    }
    // Cookie mode: Origin check first (a forged cross-site POST carries the cookie on its own),
    // then the cookie -- never the body. No cookie -> 401.
    assertAllowedCookieOrigin(req);
    const cookieToken = readRefreshCookie(req, USER_SESSION_COOKIE);
    if (!cookieToken) throw new UnauthorizedException('No refresh cookie');
    try {
      const { response, persistent } = await this.authService.refreshSession(cookieToken);
      return applyCookieSession(USER_SESSION_COOKIE, req, res, response, persistent);
    } catch (error) {
      // An invalid / reused / expired token: drop the dead cookie so the browser stops sending it.
      if (error instanceof UnauthorizedException) clearRefreshCookie(req, res, USER_SESSION_COOKIE);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body() dto: LogoutDto,
    @Headers('authorization') authorizationHeader?: string,
    @Req() req?: Request,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<void> {
    const accessToken = extractBearerToken(authorizationHeader);
    if (!req || !res || !isCookieMode(req)) {
      if (!dto.refreshToken) throw new BadRequestException(MISSING_REFRESH_TOKEN_MESSAGES);
      await this.authService.logout(dto.refreshToken, dto.allSessions ?? false, accessToken);
      return;
    }
    assertAllowedCookieOrigin(req);
    // Always clear the cookie, even if the revoke below throws (e.g. allSessions without a token).
    clearRefreshCookie(req, res, USER_SESSION_COOKIE);
    await this.authService.logout(
      readRefreshCookie(req, USER_SESSION_COOKIE),
      dto.allSessions ?? false,
      accessToken,
    );
  }

  // Sprint 1 / sprint-1/f5-f6-missing-endpoints — POST /auth/change-password,
  // POST /auth/deactivate-account, POST /auth/delete-account,
  // POST /auth/reactivate-account. Genuine additions beyond Section 4.1's
  // literal endpoint list (flagged, not silently added — see
  // auth/README.md for the full writeup): no change-password/deactivate/
  // delete-account capability existed anywhere in this codebase before
  // this PR (confirmed by grep across services/api/src).
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.authService.changePassword(user.sub, dto.currentPassword, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Post('deactivate-account')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivateAccount(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: DeactivateAccountDto,
  ): Promise<void> {
    await this.authService.deactivateAccount(user.sub, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Post('delete-account')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: DeactivateAccountDto,
  ): Promise<void> {
    await this.authService.deleteAccount(user.sub, dto.password);
  }

  // Deliberately unauthenticated — see auth.service.ts's
  // reactivateAccount() comment for why a deactivated account has no JWT
  // to gate this behind. Same rate-limiting posture as login/register:
  // an unrated credential-verification endpoint is a brute-force
  // surface.
  @SkipGlobalWriteLimit()
  @AuthRateLimit()
  @Post('reactivate-account')
  @HttpCode(HttpStatus.OK)
  async reactivateAccount(
    @Body() dto: ReactivateAccountDto,
    @Req() req?: Request,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<AuthResponse | Omit<AuthResponse, 'refreshToken'> | TwoFactorChallenge> {
    const result = await this.authService.reactivateAccount(dto.email, dto.password);
    // B-086: with two-factor on this is a challenge, finished by POST /auth/login/two-factor.
    if ('twoFactorRequired' in result) return result;
    // No "stay signed in" choice here -> a session cookie in cookie mode.
    return applyCookieSession(USER_SESSION_COOKIE, req, res, result, false);
  }

  // POST /auth/delete-inactive-account (sprint-2/account-deactivation-backend).
  // The unauthenticated Delete path from the "Inactive Account" screen
  // (Decision Log #220). Unauthenticated for the same reason
  // reactivate-account is — a deactivated account has no session — and
  // rate-limited for the same reason: it verifies credentials.
  // 204 No Content, matching the authenticated POST /auth/delete-account.
  // Only a genuinely "deactivated" account is accepted; every other case
  // (active, pending_deletion, unknown email, wrong password) gets the
  // generic "Invalid credentials" — see auth.service.ts.
  @SkipGlobalWriteLimit()
  @AuthRateLimit()
  @Post('delete-inactive-account')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteInactiveAccount(@Body() dto: DeleteInactiveAccountDto): Promise<void> {
    await this.authService.deleteInactiveAccount(dto.email, dto.password);
  }
}
