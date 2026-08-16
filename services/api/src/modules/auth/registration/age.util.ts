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

// Basic data-integrity guards, not a policy decision — see this PR's
// report for why no additional numeric "hard floor" age is enforced here
// beyond these sanity bounds. Section 8.3 step 1's "blocks signup outright
// below the applicable regional minimum age" describes the separate,
// frontend Age Gate screen (reached before /auth/register is ever called
// — Section 6 Sprint 1 backlog), and no specific regional-minimum number
// is specified anywhere in Sections 3/4/5/8/9 beyond the under-18
// guardian-consent threshold this function already implements.
const MAX_PLAUSIBLE_AGE = 120;

export function isPlausibleDateOfBirth(dateOfBirth: Date, asOf: Date = new Date()): boolean {
  if (Number.isNaN(dateOfBirth.getTime())) return false;
  if (dateOfBirth.getTime() > asOf.getTime()) return false;
  return calculateAge(dateOfBirth, asOf) <= MAX_PLAUSIBLE_AGE;
}
