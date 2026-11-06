import { IsOptional, IsString, MaxLength } from 'class-validator';

// POST /users/me/email-change. newEmail is deliberately NOT @IsEmail(): a malformed address must come back as the
// ONE email_change_not_accepted answer every other unusable address gets, not as the global ValidationPipe's
// message (which would say "not valid" and so tell the reasons apart). The service checks the format.
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
