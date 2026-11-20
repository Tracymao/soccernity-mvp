import { IsEmail } from 'class-validator';

// Build Plan Section 4.1 (POST /auth/forgot-password). Validated by
// main.ts's global ValidationPipe (added in PR B6) like every other auth
// DTO — see ../../registration/dto/register.dto.ts for the same pattern.
export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}
