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
