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
// v7 (Decision Log #415 item 1): "guardian withdrawal page" in the footnote is now a link to
// /guardian-consent/withdraw. The hashed wording is unchanged; the version moves because what the
// guardian is shown changed (a route to withdraw).
// v8 (W9, B-078 / B-176 / B-079 / B-169, build register): the guardian confirm page is now the single centred card
// Figma 5108:6629 draws -- the heading and intro name the account holder, a new "What we collect" list (four tagged
// rows), "What stays switched off" is personalised, and the approved screen is Figma 5488:7164 ("Thank you --
// {name} can continue", a "What happens next" card with a withdrawal-page link). What the guardian is told changed,
// so the version moves once for the whole change.
export const CONSENT_SCREEN_VERSION = 'v8';


// TRIPWIRE (consent-screen-version.spec.ts): sha256 of the normalised
// guardian-visible wording in GuardianConsentConfirmPage.tsx (see
// consent-screen-text-hash.util.ts for exactly what is hashed). When the
// spec fails, bump CONSENT_SCREEN_VERSION if the change alters what the
// guardian is told/agrees to, and update this hash in the same PR. For a
// meaning-neutral fix (e.g. a typo) update only this hash. The spec prints
// the current hash. Deliberately not auto-bumped -- a human decides.
export const CONSENT_SCREEN_TEXT_HASH = '39c309d61e66fcc8613577b5568fc0fa4c8228349b5b64d81094a5cb09117b0d';
