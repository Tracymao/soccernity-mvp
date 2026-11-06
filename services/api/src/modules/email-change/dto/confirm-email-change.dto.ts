import { IsString, MaxLength, MinLength } from 'class-validator';

// POST /auth/email-change/confirm. The emailed secret (base64url of 32 random bytes = 43 characters).
export class ConfirmEmailChangeDto {
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  token!: string;
}
