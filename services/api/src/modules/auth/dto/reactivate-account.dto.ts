import { IsEmail, IsString } from 'class-validator';

// Sprint 1 / sprint-1/f5-f6-missing-endpoints (POST /auth/reactivate-account).
// Unauthenticated — same credential-verification trust level as LoginDto
// (email + password), since a deactivated account has no way to obtain a
// JWT to reach a JwtAuthGuard-protected route in the first place.
export class ReactivateAccountDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
