// B-030 / B-027 (Decision Log #367, #369, #394 A6): where a signed-in account
// stands in the sign-up flow, computed ONCE on the server so the web app does
// not re-derive safeguarding rules client-side.
//
//   MINOR: Register -> Restricted Pending (on EVERY login) -> guardian approves
//          -> Create Profile -> Club Picker -> home
//   ADULT: Register -> Create Profile -> Club Picker -> home
//   Email verification is required of every user before Create Profile.
//
// `nextStep` is a routing HINT for the login / own-profile responses. It is NOT
// an enforcement point: every protected write is still guarded server-side by
// GuardianConsentGuard / EmailVerifiedGuard / ProfileCompleteGuard, each reading
// fresh from Postgres. The Club Picker is a one-time step with no persisted
// "done" flag, so it is not part of this derivation; the web flow owns it.

export type GuardianConsentState = 'not_applicable' | 'pending' | 'confirmed' | 'declined';

export type OnboardingNextStep =
  | 'restricted_pending' // minor whose guardian has not (or no longer) approved
  | 'verify_email'
  | 'create_profile'
  | 'none';

// What a "complete" profile means (B-027, #369): a username has been chosen.
// Create Profile makes username required, and legacy accounts that never chose
// one fall under the same gate (#392 item 9). Derived rather than stored, so an
// admin revoking a username (B-033) puts the account straight back into the
// gate with no extra bookkeeping.
export function isProfileComplete(user: { username?: string | null }): boolean {
  return typeof user.username === 'string' && user.username.length > 0;
}

// FAIL-CLOSED: a minor with no Guardian row is data corruption (registration
// always creates one) and is reported as 'pending', the restricted state,
// matching GuardianConsentGuard (which also refuses it). An unrecognised stored
// value is likewise 'pending'. (POST /auth/verify-email reports the missing-row
// case as 'not_applicable'; that endpoint predates this and is left as it was.)
export function guardianConsentStateFor(
  isMinor: boolean,
  guardianConsentStatus: string | null | undefined,
): GuardianConsentState {
  if (!isMinor) return 'not_applicable';
  if (guardianConsentStatus === 'confirmed') return 'confirmed';
  if (guardianConsentStatus === 'declined') return 'declined';
  return 'pending';
}

export interface OnboardingInput {
  isMinor: boolean;
  guardianConsentStatus: string | null | undefined;
  verificationStatus: string;
  username?: string | null;
}

export interface OnboardingState {
  profileComplete: boolean;
  guardianConsentStatus: GuardianConsentState;
  nextStep: OnboardingNextStep;
}

export function deriveOnboardingState(input: OnboardingInput): OnboardingState {
  const consent = guardianConsentStateFor(input.isMinor, input.guardianConsentStatus);
  const profileComplete = isProfileComplete(input);

  let nextStep: OnboardingNextStep;
  if (consent === 'pending' || consent === 'declined') nextStep = 'restricted_pending';
  else if (input.verificationStatus !== 'verified') nextStep = 'verify_email';
  else if (!profileComplete) nextStep = 'create_profile';
  else nextStep = 'none';

  return { profileComplete, guardianConsentStatus: consent, nextStep };
}
