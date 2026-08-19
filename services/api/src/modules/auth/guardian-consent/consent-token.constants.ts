import { ConfigService } from '@nestjs/config';

// DPIA finding R5 (docs/sprint-1-dpia-outline-draft.md): Guardian.consentToken
// had no expiry at all -- a permanent credential granting the power to
// activate a child's account, sitting in an email inbox indefinitely. R5's
// own proposal is explicit that it's "not a decision" and has "no security
// analysis behind it" -- 72 hours is offered purely as a starting number
// for counsel and engineering to accept or replace. Implemented as
// proposed rather than re-litigated here.
//
// Overridable via env without a code change, same pattern as
// password-reset/reset-token.constants.ts's RESET_TOKEN_TTL_MINUTES --
// both RegistrationService (issues the initial token) and
// GuardianConsentService (issues a fresh one on resend, and checks
// expiry on confirm) read this via the same helper so the two can never
// drift out of sync with each other.
export const DEFAULT_CONSENT_TOKEN_TTL_HOURS = 72;

export function getConsentTokenTtlHours(config: ConfigService): number {
  const configured = Number(config.get('GUARDIAN_CONSENT_TOKEN_TTL_HOURS'));
  return configured > 0 ? configured : DEFAULT_CONSENT_TOKEN_TTL_HOURS;
}

export function computeConsentTokenExpiresAt(config: ConfigService): Date {
  return new Date(Date.now() + getConsentTokenTtlHours(config) * 60 * 60 * 1000);
}
