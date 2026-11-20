import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Regenerating backup codes and turning two-factor off both re-ask for the password.
export class TwoFactorPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  password!: string;
}
