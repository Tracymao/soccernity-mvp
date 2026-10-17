import { IsString, MaxLength, MinLength } from 'class-validator';

// POST /admin/users/:id/username-revoke (B-033, Decision Log #398 D3). The
// REASON is required and is stored in the audit record -- never in the email to
// the user and never in RevokedUsername. Bounded so it stays a reason, not a log.
export class RevokeUsernameDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}
