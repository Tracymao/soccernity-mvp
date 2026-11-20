import { IsString } from 'class-validator';

// Sprint 1 / sprint-1/f5-f6-missing-endpoints (POST /auth/deactivate-account,
// POST /auth/delete-account). Both require password re-entry as a
// confirmation step — a hard requirement from this PR's brief, not
// optional scope. Shared by both endpoints since the body shape is
// identical; see auth.controller.ts for which handler uses it where.
export class DeactivateAccountDto {
  @IsString()
  password!: string;
}
