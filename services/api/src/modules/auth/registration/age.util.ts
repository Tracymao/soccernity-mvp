// Decision Log #8 (resolved, MVP Build Plan Section 9 / Section 8.3):
// Soccernity deliberately applies the guardian-consent flow to the full
// under-18 band, not the UK GDPR bare-legal-minimum of 13, and NDPA 2023
// §31's "child" definition (also under 18) makes the same threshold
// Nigeria's actual legal floor rather than an extra safety margin
// (Decision Log #10). isMinor is computed from the declared date of birth
// at registration time — true whenever the registrant has not yet turned
// 18 as of "now" (the `asOf` parameter defaults to the real clock but is
// injectable for deterministic tests).
export function computeIsMinor(dateOfBirth: Date, asOf: Date = new Date()): boolean {
  return calculateAge(dateOfBirth, asOf) < 18;
}

// sprint-1/under-16-restrictions: the separate, narrower tier counsel
// asked for (messaging/Bants off, Community Groups read-only). Computed
// exactly where and how isMinor is -- once, from the declared date of
// birth at registration.
export const UNDER_16_AGE = 16;

export function computeIsUnder16(dateOfBirth: Date, asOf: Date = new Date()): boolean {
  return calculateAge(dateOfBirth, asOf) < UNDER_16_AGE;
}

export function calculateAge(dateOfBirth: Date, asOf: Date = new Date()): number {
  let age = asOf.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = asOf.getMonth() - dateOfBirth.getMonth();
  const hasNotHadBirthdayYetThisYear =
    monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < dateOfBirth.getDate());
  if (hasNotHadBirthdayYetThisYear) {
    age -= 1;
  }
  return age;
}

// Basic data-integrity guards. The policy floor is MINIMUM_SIGNUP_AGE below.
const MAX_PLAUSIBLE_AGE = 120;

// Decision Log #19 (resolved) and #407 item 2: signup is hard-blocked below age
// 5, regardless of guardian consent. The web Age Gate has always enforced this
// (apps/web AgeGateStep.tsx MINIMUM_SIGNUP_AGE); until QA defect D-02 the API
// did not, so a direct POST /auth/register with a 4-year-old DOB created the
// account and the guardian request. Exactly age 5 is accepted. Same
// calculateAge as the web gate's parseDateOfBirth, so the two cannot disagree
// on the boundary day.
export const MINIMUM_SIGNUP_AGE = 5;
export const BELOW_MINIMUM_AGE_CODE = 'below_minimum_age';
export const BELOW_MINIMUM_AGE_MESSAGE = `Soccernity accounts start at age ${MINIMUM_SIGNUP_AGE}.`;

export function meetsMinimumSignupAge(dateOfBirth: Date, asOf: Date = new Date()): boolean {
  return calculateAge(dateOfBirth, asOf) >= MINIMUM_SIGNUP_AGE;
}

export function isPlausibleDateOfBirth(dateOfBirth: Date, asOf: Date = new Date()): boolean {
  if (Number.isNaN(dateOfBirth.getTime())) return false;
  if (dateOfBirth.getTime() > asOf.getTime()) return false;
  return calculateAge(dateOfBirth, asOf) <= MAX_PLAUSIBLE_AGE;
}
