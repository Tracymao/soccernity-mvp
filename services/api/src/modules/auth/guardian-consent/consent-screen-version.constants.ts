// Decision Log #348 -- UK GDPR Art. 7(1): the controller must be able to
// demonstrate WHAT the guardian was shown when they consented.
//
// THIS IS A MANUALLY BUMPED CONSTANT. Nothing derives it from the screen's
// content, a hash, or a git revision, and nothing detects drift. If you
// change the wording or substance of the guardian-consent confirmation
// screen (apps/web GuardianConsentConfirmPage.tsx, and the Figma frame it
// implements) in a way a guardian could reasonably read differently --
// what data is described, what they are agreeing to, the decline/withdraw
// options -- BUMP THIS in the same PR ("v1" -> "v2"). Cosmetic changes
// (spacing, colour, typo fixes that change no meaning) need no bump.
//
// Stamped onto Guardian.consentScreenVersion at confirmation time, then
// snapshotted into ConsentAuditRecord. Rows confirmed before this existed
// carry NULL, deliberately not backfilled with a guess.
export const CONSENT_SCREEN_VERSION = 'v1';


// TRIPWIRE (consent-screen-version.spec.ts): sha256 of the normalised
// guardian-visible wording in GuardianConsentConfirmPage.tsx (see
// consent-screen-text-hash.util.ts for exactly what is hashed). When the
// spec fails, bump CONSENT_SCREEN_VERSION if the change alters what the
// guardian is told/agrees to, and update this hash in the same PR. For a
// meaning-neutral fix (e.g. a typo) update only this hash. The spec prints
// the current hash. Deliberately not auto-bumped -- a human decides.
export const CONSENT_SCREEN_TEXT_HASH = 'af4659695a18ca8e5f4a0b9fc37019d4cf3c36d28f28ecd02bd6422e73754929';
