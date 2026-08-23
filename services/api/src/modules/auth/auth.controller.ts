import { Body, Controller, HttpCode, HttpStatus, Headers, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser } from './guards/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AccessTokenPayload } from './token/token.types';
import { AuthRateLimit } from './rate-limit/auth-rate-limit.decorator';
import { AuthResponse, TokenPairResponse } from './auth-response.mapper';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeactivateAccountDto } from './dto/deactivate-account.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { ReactivateAccountDto } from './dto/reactivate-account.dto';
import { RefreshDto } from './dto/refresh.dto';

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

  @AuthRateLimit()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto): Promise<TokenPairResponse> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body() dto: LogoutDto,
    @Headers('authorization') authorizationHeader?: string,
  ): Promise<void> {
    const accessToken = extractBearerToken(authorizationHeader);
    await this.authService.logout(dto.refreshToken, dto.allSessions ?? false, accessToken);
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
  @AuthRateLimit()
  @Post('reactivate-account')
  @HttpCode(HttpStatus.OK)
  async reactivateAccount(@Body() dto: ReactivateAccountDto): Promise<AuthResponse> {
    return this.authService.reactivateAccount(dto.email, dto.password);
  }
}
