# fc: email change no longer has a "not accepted" answer (Decision Log #476)

Branch `frontend/fc-email-change-probing`. `apps/web` plus one Playwright spec edit; `services/api` and `apps/admin` untouched. No wording changed, no new copy.

## What changed
- `api/emailChange.ts`: `EMAIL_CHANGE_NOT_ACCEPTED` removed; the header comment now says the request answers 202 for every request that passes the password and any second factor, and that 429 covers both the failed-password budget and the new request cap.
- `pages/settings/ChangeEmailPage.tsx`: the `email_change_not_accepted` branch is removed. Every 202 shows "Check your inbox". The existing `err.status === 429` branch already shows the plain too-many-attempts line, so the new request-cap 429 needs no new state; the typed details are kept.
- `ChangeEmailPage.test.tsx`: the "ONE message for a not-accepted address" test is replaced by "Check your inbox for every 202, whatever the address"; a new test covers the request-cap 429 (same line, details kept).
- `e2e/tests/38-b059-email-change.spec.ts`: the "address that cannot be used gets ONE message" test is replaced by one asserting a taken address shows "Check your inbox" and no not-accepted text. **Not run** (needs the QA stack and the merged backend).

## Kept on purpose
`MESSAGES.emailNotAccepted` and the client-side shape check (`looksLikeEmail`) stay: an obviously malformed address is caught in the browser before any request. It says nothing about registration, so it does not conflict with #476. Its existing test is unchanged.

## Leftover Figma
The "email not accepted" frames (desktop `6990:50805`, mobile `6990:51863`) are now unreachable from the server. Left as they are, as instructed. The browser-side typo check still uses the same wording.

## Verification
`apps/web`: `tsc --noEmit`, `npm run lint`, `npm run build` clean. Vitest for the touched files (`ChangeEmailPage`, `EmailChangeConfirmPage`, `AccountInformationPage`): 3 files / 37 tests, 0 failures. Full web suite, Playwright and the `services/api` / `apps/admin` suites were not run. Before-figures were not taken on a clean `main`.
