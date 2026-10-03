import { Body, Controller, HttpCode, HttpStatus, Headers, Post, UseGuards } from '@nestjs/common';
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
  async login(@Body() dto: AdminLoginDto): Promise<AdminAuthResponse> {
    return this.adminAuthService.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: AdminRefreshDto): Promise<AdminTokenPairResponse> {
    return this.adminAuthService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body() dto: AdminLogoutDto,
    @Headers('authorization') authorizationHeader?: string,
  ): Promise<void> {
    const accessToken = extractBearerToken(authorizationHeader);
    await this.adminAuthService.logout(dto.refreshToken, dto.allSessions ?? false, accessToken);
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
