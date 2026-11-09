import { IsOptional, IsString, MaxLength } from 'class-validator';

// POST /users/me/email-change. newEmail is deliberately NOT @IsEmail(): since Decision Log #476 a malformed address is
// the SAME 202 every other address gets (nothing is sent to it), not the global ValidationPipe's 400, which would tell
// the caller the address was bad. The service checks the format in the background.
export class RequestEmailChangeDto {
  @IsString()
  password!: string;

  @IsString()
  @MaxLength(512)
  newEmail!: string;

  // Required (by a coded 403 two_factor_required) only when the account has two-factor on.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  twoFactorCode?: string;
}
