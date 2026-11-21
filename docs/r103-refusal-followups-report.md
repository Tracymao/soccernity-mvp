# R103 refusal follow-ups (apps/web only)

Decision Log #544, register Section 108. No API or guard change. No new string is tagged.

## Per-screen table

| Screen | Code read | Before | After |
|---|---|---|---|
| Forgot password, Reset password | HTTP 429 | generic error | "Too many requests. Please wait a little while and try again." |
| Bants join button, Create topic dialog, Bants room post | guardian_consent_pending, email_verification_required, profile_incomplete, under_16_restricted | specific server text only (code dropped) | matching WriteRefusalNotice and link; other 403s keep the server text |
| Messages: ConversationPage send, NewConversationPage, Community ChatWindow | same four codes | consent detected by regex on the message | classified by code; regex removed |
| Community Groups: join, create | same four codes | guardian consent by regex | classified by code; other 403s keep server text |
| Community Groups and Grassroots `isAwaitingConsent` | guardian_consent_pending | regex on message | code check only |

Root cause: `apiFailure` (lib/under16.ts) and the Grassroots write helpers dropped the server `code`; both now carry it.

## Found, not fixed
- `api/auth.ts` (guardian consent rejection) compares a 400 message to a fixed string; the server sends no code there.
- `pages/profile/EditProfileModal.tsx` falls back to `/username/i` on a message after the code check.
- Admin sign-in and guardian-consent 429 copy says "a minute"; copy for the maintenance session.
- Anything needing an API change: none identified.

## Verification
`apps/web` tsc, eslint, full vitest: 159 files / 2,070 tests, 0 failures. Admin and API untouched, not run.
