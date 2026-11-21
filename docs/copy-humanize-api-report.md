# CH-C: humanize API copy (services/api)

Branch `copy/humanize-api`. Copy-only change: no behaviour, status code, error code, DTO shape, email routing or link changed.

## What changed (6 strings, 3 source files, 1 spec)

| Where | Before | After |
|---|---|---|
| `registration-email.service.ts`, `guardian-consent-withdrawal-request` (text and HTML) | "you can safely ignore this email — nothing changes unless the code above is used." | "you can ignore this email. Nothing changes unless the code above is used." |
| `guardian-minor-turned-18` (text and HTML) | "no longer apply — {name} now manages ..." | "no longer apply. {name} now manages ..." |
| `guardian-minor-turned-18` sign-off (text and HTML) | "— The Soccernity team" | "The Soccernity team" |
| `sensitive-content.util.ts` (API message shown on a screen) | "...about someone — are you sure you want to share this publicly?" | "...about someone. Are you sure you want to share this publicly?" |

Subjects: no email subject changed (no subject contained a dash or needed rewording).

Spec updated (text only): `registration-email.service.spec.ts`, two expected strings for the turned-18 email.

## Counts per module

Email service (about 36 templates, text and HTML): 3 templates changed, the rest already plain. Message literals across `services/api/src` (about 400): 1 changed, the rest already plain (short, neutral, say what to do). Left because matched by a client: see below.

## Already plain, left alone

All other templates and messages. This includes "safely ignore" phrasing (no dash, plain words), password-reset email, two-factor recovery emails, guardian security and safety notices, suspension and reinstatement emails, and the Contact Us notification.

## Do-not-change list (web or admin match on these)

- `Invalid or expired consent token`: compared with `!==` in `apps/web/src/api/auth.ts` (`GENERIC_CONSENT_REJECTION`). Thrown in `guardian-consent.service.ts` and `guardian-card-verification.service.ts`.
- Any API message containing "guardian consent" (including "This account is awaiting guardian consent and cannot access this feature yet."): tested with `/guardian consent/i` in `ChatWindow.tsx`, `ConversationPage.tsx`, `community-groups/errors.ts`, `grassroots/errors.ts`.

## Counsel-pending strings

The guardian-consent emails keep their meaning. Only the turned-18 and withdrawal-request emails were touched, and only punctuation changed (no change to what the guardian is told, when, or what happens if they do nothing). Neither is tagged pending in the manifest.

## Not changed on purpose

- `Entry withdrawn — guardian consent revoked` (`contest-read-model.service.ts`): admin-facing placeholder that admin tests and UI depend on.
- Storage "not configured" messages and `POST /auth/reactivate-account` hint in the deactivated-login message: developer/operational text, left as is to avoid touching behaviour clients rely on.

## Verification

`tsc --noEmit` clean. Jest (`src/modules/auth/registration`, `sensitive-content`, `auth/password-reset`): 16 suites, 296 tests, 0 failures. Not run: the full API suite, `render-static-sites` and `env-completeness` specs, the e2e suite, Playwright, CI. No e2e or Playwright assertion referenced the changed strings (grepped `services/api/test`).

## Could not reword without changing meaning

Nothing found.
