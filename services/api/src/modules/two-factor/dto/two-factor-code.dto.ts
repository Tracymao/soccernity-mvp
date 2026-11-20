import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// A 6-digit authenticator code. 32 characters is more than any valid input (a backup code is 10, a spaced or
// hyphenated one up to ~12); the cap only stops a megabyte string reaching the code check.
export class TwoFactorCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string;
}
