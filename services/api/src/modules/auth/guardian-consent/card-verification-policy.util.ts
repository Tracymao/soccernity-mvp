import { calculateAge } from '../registration/age.util';

// sprint-1/coppa-card-verification -- decides which consent path applies.
// A technical control, not a legal determination (Decision Log #4 open).
//
// In scope ONLY when the child is under 13 AND the self-declared country is
// the US. A missing/blank declared country is treated as in scope for an
// under-13: failing toward the stronger control is the safe direction, and
// it stops "just don't answer" being a way around the step. Everything else
// (13-17 anywhere; under-13 with a declared non-US country) keeps the
// existing email-link-only flow.
export const CARD_VERIFICATION_AGE_CEILING = 13;
export const CARD_VERIFICATION_COUNTRY = 'US';

export type ConsentVerificationMethod = 'email_link' | 'email_link_plus_card_charge';

export function normalizeDeclaredCountry(raw?: string | null): string | null {
  const v = raw?.trim().toUpperCase();
  return v ? v : null;
}

export function requiresCardVerification(
  dateOfBirth: Date,
  declaredCountry: string | null | undefined,
  asOf: Date = new Date(),
): boolean {
  if (calculateAge(dateOfBirth, asOf) >= CARD_VERIFICATION_AGE_CEILING) return false;
  const country = normalizeDeclaredCountry(declaredCountry);
  return country === null || country === CARD_VERIFICATION_COUNTRY;
}

export function verificationMethodFor(cardVerificationRequired: boolean): ConsentVerificationMethod {
  return cardVerificationRequired ? 'email_link_plus_card_charge' : 'email_link';
}
