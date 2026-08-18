// Route stub only -- do not build the verify-email flow here.
//
// Gap found during a Sprint 1 cleanup review, not part of any prior F1-F6
// PR: POST /auth/verify-email (backend, PR B2) and
// RegistrationEmailService.sendVerificationEmail (Decision Log #17,
// Postmark) have both existed since Sprint 1, but no frontend route or
// page was ever created for a user to actually land on and enter the
// verification token/code the email contains. Unlike GuardianConsentPage
// and ProfilePage (F5/F6), this route did not exist in router.tsx at all
// until this fix -- it is not a placeholder that was already wired up,
// it is a genuinely missing piece of Sprint 1's own exit criterion
// ("a new user can register, verify email, declare age...").
//
// PR F7 replaces this file's contents with the real, Figma-derived
// screen(s) -- see CLAUDE.md's status section for tracking.
import PlaceholderPage from "./PlaceholderPage";

export default function VerifyEmailPage() {
  return <PlaceholderPage title="Verify your email" owner="PR F7" />;
}
