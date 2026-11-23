# R111: show the reason when "Report incorrect details" fails

Founder decision, 2026-11-23. Web only, no new wording. Built from `origin/main` `526bd30`. The task brief called this R110, but `docs/r110-report.md` already exists (staging test user cleanup), so this is R111.

## What changed

On the guardian consent page (`apps/web/src/pages/GuardianConsentConfirmPage.tsx`), `handleReport` used to ignore the failure and always show "Couldn't send that just now. Please try again shortly." It now stores the error text and shows it in the same alert paragraph: the `AuthApiError` message when there is one (these are already approved, guardian-safe sentences from `api/auth.ts`), otherwise the existing line. The report button stays visible so the guardian can retry. A new attempt clears the earlier text.

## Before and after

| Failure | Before | After |
| --- | --- | --- |
| No connection | "Couldn't send that just now..." | "Couldn't reach the Soccernity server. Please try again shortly." |
| Rate limited (429) | same fixed line | "Too many attempts. Please wait a minute and try again." |
| Dead or expired link (400) | same fixed line | "This link is invalid or has expired. Ask the account holder to resend the request." |
| Unknown (not an `AuthApiError`) | same fixed line | same fixed line (unchanged) |

## Tests and checks

- `GuardianConsentConfirmPage.test.tsx`: 31 tests before, 35 after (the old 429 test now uses a plain `Error` to prove the fallback; three new cases for the three messages; one retry-succeeds case).
- `apps/web` full Vitest: 2,081 passed. `tsc --noEmit` and eslint on the two files: clean. `npm run build:release`: exit 0, `check:pending-copy` prints OK.
- Searched `e2e/tests` for the old line: no match, nothing to update. Other pages (`GuardianConsentPage`, `VerifyEmailPromptPage`) use the same sentence for their own failures and were not touched.
- Not run: Playwright, `services/api`, `apps/admin`, CI.

Decision Log row to follow in a separate docs PR.
