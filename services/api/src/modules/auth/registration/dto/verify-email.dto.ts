import { IsString, MinLength } from 'class-validator';

// Build Plan Section 4.1 (POST /auth/verify-email). This token is the
// user's own email-confirmation token — a separate mechanism from
// Guardian.consentToken, which a guardian (not the registrant) consumes
// via the distinct /auth/guardian-consent endpoint (out of this PR's
// scope; see registration.controller.ts).
export class VerifyEmailDto {
  @IsString()
  @MinLength(1)
  token!: string;
}
