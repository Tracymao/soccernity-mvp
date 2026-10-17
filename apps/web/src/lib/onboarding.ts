// B-125 (Decision Log #367, #394 A6, #404 item 12): where the web app sends an
// account after register, login, reactivation and email verification.
//
// The server decides (`nextStep`, services/api onboarding-state.util.ts); this
// file only maps that answer to a route. It is a routing HINT, not an
// enforcement point -- every protected write is guarded server-side by
// GuardianConsentGuard / EmailVerifiedGuard / ProfileCompleteGuard, each
// reading fresh from Postgres.
import type { OnboardingNextStep } from "../api/auth";

export const ONBOARDING_ROUTES = {
  /** The minor's own Restricted Pending / declined view. */
  restrictedPending: "/guardian-consent",
  /** "Check your email" prompt -- there is no resend-verification endpoint yet (Decision Log #37). */
  verifyEmail: "/verify-email/prompt",
  /** Create Profile. Interim page, see pages/CreateProfilePage.tsx. */
  createProfile: "/create-profile",
  /** One-time Club Picker, shown once after Create Profile. */
  clubPicker: "/signup/clubs",
  /** Resolver for places that do not already hold a fresh `nextStep`. */
  resolve: "/continue",
  /** Where a fully onboarded account lands. */
  home: "/community",
} as const;

export function routeForNextStep(nextStep: OnboardingNextStep): string {
  switch (nextStep) {
    case "restricted_pending":
      return ONBOARDING_ROUTES.restrictedPending;
    case "verify_email":
      return ONBOARDING_ROUTES.verifyEmail;
    case "create_profile":
      return ONBOARDING_ROUTES.createProfile;
    case "none":
      return ONBOARDING_ROUTES.home;
    default:
      // An unknown future value fails toward the safest page: the account
      // status view tells the person what is going on and never grants
      // anything. (Writes are still blocked server-side.)
      return ONBOARDING_ROUTES.restrictedPending;
  }
}
