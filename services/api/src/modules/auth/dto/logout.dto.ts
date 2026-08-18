import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Build Plan Section 4.1 (POST /auth/logout). Validated by main.ts's
// global ValidationPipe (added in PR B6) like every other auth DTO —
// see registration/dto/register.dto.ts for the same pattern.
export class LogoutDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;

  /**
   * Logout-everywhere (Build Plan Section 8.4's admin/appeals context, and
   * the README's "single-session and admin-triggered logout-everywhere").
   * Requires a still-valid access token in the Authorization header — see
   * auth.service.ts for why.
   */
  @IsOptional()
  @IsBoolean()
  allSessions?: boolean;
}
