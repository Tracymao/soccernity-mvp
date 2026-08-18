import { IsNotEmpty, IsString } from 'class-validator';

// Build Plan Section 4.1 (POST /auth/guardian-consent). Validated by
// main.ts's global ValidationPipe (added in PR B6), matching every
// other auth DTO post sprint-1/auth-dto-validation — see
// ../../registration/dto/register.dto.ts for the same pattern.
export class GuardianConsentDto {
  @IsString()
  @IsNotEmpty()
  consentToken!: string;
}
