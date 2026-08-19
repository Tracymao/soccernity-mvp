import { IsEmail } from 'class-validator';

// Build Plan Section 4.1 / DPIA finding R5's "re-send path"
// (POST /auth/guardian-consent/resend). Takes the MINOR's registered
// email, not the guardian's -- see guardian-consent.service.ts's
// resendConsent() for why. Validated by main.ts's global ValidationPipe
// (added in PR B6), matching every other auth DTO post
// sprint-1/auth-dto-validation.
export class ResendGuardianConsentDto {
  @IsEmail()
  email!: string;
}
