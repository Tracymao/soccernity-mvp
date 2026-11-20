import { IsNotEmpty, IsString } from 'class-validator';

// sprint-1/guardian-consent-decline-withdraw-expiry
// (POST /auth/guardian-consent/decline). Deliberately the SAME field name
// and shape as GuardianConsentDto's confirm payload -- both are the
// guardian acting on the one consent token they were emailed, just in
// opposite directions, so the frontend sends the identical value to
// whichever endpoint the guardian chose. Validated by main.ts's global
// ValidationPipe, matching every other auth DTO.
export class DeclineGuardianConsentDto {
  @IsString()
  @IsNotEmpty()
  consentToken!: string;
}
