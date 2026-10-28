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
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ADMIN_SESSION_COOKIE,
  applyCookieSession,
  assertAllowedCookieOrigin,
  clearRefreshCookie,
  isCookieMode,
  readRefreshCookie,
} from '../../session-cookie/session-cookie';
import { AuthRateLimit } from '../auth/rate-limit/auth-rate-limit.decorator';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthResponse, AdminTokenPairResponse } from './admin-response.mapper';
import { AdminChangePasswordDto } from './dto/admin-change-password.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminLogoutDto } from './dto/admin-logout.dto';
import { AdminRefreshDto } from './dto/admin-refresh.dto';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';
import { CurrentAdmin } from './guards/current-admin.decorator';
import { AdminAccessTokenPayload } from './token/admin-token.types';

// Same messages class-validator produced for the old required `refreshToken`.
const MISSING_REFRESH_TOKEN_MESSAGES = ['refreshToken should not be empty', 'refreshToken must be a string'];

function extractBearerToken(authorizationHeader: string | undefined): string | undefined {
  if (!authorizationHeader) return undefined;
  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return undefined;
  return token;
}

// Sprint 2 / sprint-2/admin-console-account-entity (Decision Log #54).
// No self-service admin registration endpoint exists here, by design —
// admin/moderator accounts are provisioned out of band (direct database
// insert / a future one-off seed script), not self-service signup. A
// "create admin" endpoint raises its own access-control question (who is
// allowed to call it — a bootstrapping problem for the very first admin
// account) that is out of this PR's scope; flagged as a real Decision Log
// candidate in admin/README.md, not silently left unbuilt.
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  // Decision Log #190: a stricter, fixed limit than the shared User-facing
  // 'auth' config (admin accounts are a smaller, higher-value target set).
  // The override is applied per-handler, so this route's counter is
  // independent of AuthController.login's — admin traffic never exhausts
  // the User login bucket and vice versa.
  @AuthRateLimit({ limit: 5, windowMs: 15 * 60 * 1000 })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: AdminLoginDto,
    @Req() req?: Request,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<AdminAuthResponse | Omit<AdminAuthResponse, 'refreshToken'>> {
    const staySignedIn = dto.staySignedIn === true;
    const result = await this.adminAuthService.login(dto.email, dto.password, staySignedIn);
    return applyCookieSession(ADMIN_SESSION_COOKIE, req, res, result, staySignedIn);
  }

  // B-245 cookie mode: see AuthController.refresh. The admin cookie (sn_admin_rt, Path
  // /admin/auth) is a different name and path from the user cookie, and only this controller
  // reads it, so neither audience's cookie is ever accepted by the other's endpoints.
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: AdminRefreshDto,
    @Req() req?: Request,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<AdminTokenPairResponse | Omit<AdminTokenPairResponse, 'refreshToken'>> {
    if (!req || !res || !isCookieMode(req)) {
      if (!dto.refreshToken) throw new BadRequestException(MISSING_REFRESH_TOKEN_MESSAGES);
      return this.adminAuthService.refresh(dto.refreshToken);
    }
    assertAllowedCookieOrigin(req);
    const cookieToken = readRefreshCookie(req, ADMIN_SESSION_COOKIE);
    if (!cookieToken) throw new UnauthorizedException('No refresh cookie');
    try {
      const { response, persistent } = await this.adminAuthService.refreshSession(cookieToken);
      return applyCookieSession(ADMIN_SESSION_COOKIE, req, res, response, persistent);
    } catch (error) {
      if (error instanceof UnauthorizedException) clearRefreshCookie(req, res, ADMIN_SESSION_COOKIE);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body() dto: AdminLogoutDto,
    @Headers('authorization') authorizationHeader?: string,
    @Req() req?: Request,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<void> {
    const accessToken = extractBearerToken(authorizationHeader);
    if (!req || !res || !isCookieMode(req)) {
      if (!dto.refreshToken) throw new BadRequestException(MISSING_REFRESH_TOKEN_MESSAGES);
      await this.adminAuthService.logout(dto.refreshToken, dto.allSessions ?? false, accessToken);
      return;
    }
    assertAllowedCookieOrigin(req);
    clearRefreshCookie(req, res, ADMIN_SESSION_COOKIE);
    await this.adminAuthService.logout(
      readRefreshCookie(req, ADMIN_SESSION_COOKIE),
      dto.allSessions ?? false,
      accessToken,
    );
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Body() dto: AdminChangePasswordDto,
  ): Promise<void> {
    await this.adminAuthService.changePassword(admin.sub, dto.currentPassword, dto.newPassword);
  }
}
