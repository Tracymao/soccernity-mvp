import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Second step of sign-in: the opaque challenge from the password step, plus a 6-digit code OR a backup code.
export class TwoFactorLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  challengeToken!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string;
}
