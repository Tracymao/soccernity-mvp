import { IsEmail, IsString } from 'class-validator';

// sprint-2/account-deactivation-backend (POST /auth/delete-inactive-account).
// Unauthenticated — a deactivated account has no valid JWT to reach the
// JwtAuthGuard-protected POST /auth/delete-account, so this route takes
// { email, password } and re-verifies credentials itself, exactly like
// ReactivateAccountDto / LoginDto. Kept a distinct class from
// ReactivateAccountDto purely for intent clarity at the call site; the
// body shape is identical.
export class DeleteInactiveAccountDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
