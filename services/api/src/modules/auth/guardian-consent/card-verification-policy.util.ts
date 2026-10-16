import { calculateAge } from '../registration/age.util';

// sprint-1/coppa-card-verification -- decides which consent path applies.
// A technical control, not a legal determination (Decision Log #4 open).
//
// B-025 (Decision Log #368) RE-KEYED this decision. It no longer looks at the
// self-declared country at all: the DERIVED country (local GeoLite2 lookup at
// Register) is authoritative, because a self-declared value is trivially
// typed to dodge the control.
//
// In scope when the child is under 13 AND the derived country is the US OR the
// lookup did not resolve (`derivedCountry` null/blank). An unresolved lookup
// applies the stronger control: a missing GeoLite2 database, a private or
// unroutable IP, or a lookup error must never be a way around the step.
// Everything else (13-17 anywhere; under-13 with a derived non-US country)
// keeps the existing email-link-only flow. Known residual risk: VPN/Tor
// spoofing of the derived country (Decision Log #368, listed for the DPIA).
export const CARD_VERIFICATION_AGE_CEILING = 13;
export const CARD_VERIFICATION_COUNTRY = 'US';

export type ConsentVerificationMethod = 'email_link' | 'email_link_plus_card_charge';

// ISO-3166 alpha-2, upper-cased; blank or malformed input -> null.
export function normalizeCountryCode(raw?: string | null): string | null {
  const v = raw?.trim().toUpperCase();
  return v && /^[A-Z]{2}$/.test(v) ? v : null;
}

export function requiresCardVerification(
  dateOfBirth: Date,
  derivedCountry: string | null | undefined,
  asOf: Date = new Date(),
): boolean {
  if (calculateAge(dateOfBirth, asOf) >= CARD_VERIFICATION_AGE_CEILING) return false;
  const country = normalizeCountryCode(derivedCountry);
  return country === null || country === CARD_VERIFICATION_COUNTRY;
}

export function verificationMethodFor(cardVerificationRequired: boolean): ConsentVerificationMethod {
  return cardVerificationRequired ? 'email_link_plus_card_charge' : 'email_link';
}
