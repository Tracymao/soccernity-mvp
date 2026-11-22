# R109b: stale pending-copy tag comments

Branch `dev/r109b-stale-tag-comments`, from `origin/main` `fb111d6`. Comments and READMEs only.

## What changed
PR #849 (R108) cleared the tag from all 144 reviewed strings. 16 code files and 5 READMEs still said strings were "tagged" or "carry the literal tag". Each was reworded to say the wording was cleared by the founder's review of 2026-11-22 (R108), no counsel review needed. Comments that only explained why a string is NOT tagged now say "untagged" and keep the reason. Decision Log numbers and Figma references are kept. No comment was deleted outright.

## Proof it is comments only
Each changed .ts/.tsx file was compared with its `origin/main` version after removing comments with the TypeScript printer (`removeComments: true`, line endings normalised). Result: 16 files, 0 differ.

- OK   apps/admin/src/pages/media-review/SetAsideDialog.tsx
- OK   apps/admin/src/pages/moderation/ContextMessagesCard.tsx
- OK   apps/admin/src/pages/moderation/RecordAppealDialog.tsx
- OK   apps/admin/src/pages/moderation/SuspendAccountDialog.tsx
- OK   apps/web/src/pages/ContactPage.tsx
- OK   apps/web/src/pages/VerifyEmailPromptPage.tsx
- OK   apps/web/src/pages/community/MediaUploadTray.tsx
- OK   apps/web/src/pages/community/PostMedia.tsx
- OK   apps/web/src/pages/guardian-consent/GuardianWithdrawalPage.tsx
- OK   services/api/src/modules/admin-users/admin-user-username-revoke.service.ts
- OK   services/api/src/modules/auth/registration/email/registration-email.service.ts
- OK   services/api/src/modules/contact/contact.constants.ts
- OK   services/api/src/modules/contest/contest-read-model.service.ts
- OK   services/api/src/modules/contest/contest-removal.rules.ts
- OK   services/api/src/modules/guardian-security-notice/guardian-security-notice.constants.ts
- OK   services/api/src/modules/username-review/username-review.service.ts

READMEs (not code): auth, contact, guardian-security-notice, moderation, two-factor under `services/api/src/modules/`.

## Checks
- `tsc --noEmit`: web, admin, api clean. `eslint`: web, admin, api clean (one pre-existing ESLintEnvWarning).
- Vitest web 160 files / 2,077 tests passed on the final run (one earlier full run had 1 failure, not reproduced on rerun, load flake). Admin 65 files / 1,033 tests passed.
- API Jest: 338 suites passed (1 skipped), 6,667 tests passed (8 skipped).
- `npm run check:pending-copy`: still fails by design on **53 places, unchanged**, all from the rendered legal draft.
- Not run: e2e and Playwright suites, CI.

## Found, not changed (outside the brief's grep)
These comments still describe tags but do not contain the literal text on one line, so the grep did not find them: `apps/web` `removedContent.ts` (line 4), `usernameReviewCopy.ts` (both copies), `OtherProfilePage.tsx` (68), `PrivateProfileNote.tsx` (11), `DataExportPage.tsx` (20), `DirectMessagesSettingsPage.tsx` (25), `recoveryParts.tsx` (8), `TwoFactorRecoveryRequest.tsx` (23); `apps/admin` `holdActions.tsx` (109), `guardianNoticesCopy.ts` (5). Worth a follow-up pass.
