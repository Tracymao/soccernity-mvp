import { IsNotEmpty, IsString, MinLength } from 'class-validator';

// Build Plan Section 4.1 (POST /auth/reset-password). Validated by
// main.ts's global ValidationPipe (added in PR B6) like every other auth
// DTO — see ../../registration/dto/register.dto.ts for the same pattern.
// The 8-character minimum matches ../../registration/dto/register.dto.ts's
// @MinLength(8) on RegisterDto.password.
export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
