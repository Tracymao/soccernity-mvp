import { Body, Controller, HttpCode, HttpStatus, Headers, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthRateLimit } from './rate-limit/auth-rate-limit.decorator';
import { AuthResponse, TokenPairResponse } from './auth-response.mapper';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
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
}
