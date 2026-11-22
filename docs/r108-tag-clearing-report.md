# R108: clearing the [COPY PENDING LEGAL REVIEW] tag from 144 reviewed strings

Branch `dev/r108-clear-pending-copy-tags`. Founder instruction: "Clear the tag" for S1 to S144 (web 93, admin 51).

## Read this first (what is NOT finished)

1. **`npm run check:pending-copy` and `npm run build:release` still FAIL: 53 places, web only, admin 0.** All 53 come from `docs/legal-copy-draft-tos-privacy-policy.md`, which the web app renders on `/terms` and `/privacy` (`legalDocument.ts`, `?raw`). That file holds 46 tags and this task may not edit legal drafts (a maintenance session owns them). The owner of that file must clear or resolve them; production web cannot build until then. The allow-list stays `[]`.
2. **`docs/counsel-review-pack.docx` was NOT rebuilt.** pandoc is not installed here and running a downloaded copy was refused. The `.md` is updated and `docs/counsel-pack-check.py` passes. Run `python docs/counsel-pack-build.py` on a machine with pandoc.
3. If the legal-draft maintenance session has open PRs touching the files I changed (`docs/launch-gate-runbook.md`, `docs/counsel-review-pack.md`, `docs/pending-copy-manifest.md`), rebase on main before merge.

## Step 1: claim-bearing strings checked against code

Every string that states a rule, number, retention period or who-sees-what was checked. All matched, so none stayed tagged.

| Claim in the string | Checked in |
|---|---|
| A guardian can decline up to 3 times; the third schedules deletion; changing the guardian email does not reset the count (S26, S50) | `auth/guardian-consent/guardian-decline-cap.constants.ts`, `guardian-consent.service.ts` |
| Account deleted details after 30 days (withdrawal page, S75/S77) | `GRACE_PERIOD_DAYS = 30`, `account-deletion/account-deletion-sweep.service.ts` |
| Bad-faith hold holds the reporter's account for 6 months (S10, S14) | `account-hold/account-hold.config.ts` `DEFAULT_BAD_FAITH_HOLD_MONTHS = 6` |
| Contact enquiries deleted 12 months after the last message; escalated ones follow the report (S18, S19, S92) | `contact/contact-enquiry-retention.service.ts`, `contact.config.ts` |
| A message can be edited for 15 minutes; original may be kept (S60) | `messaging/messaging.constants.ts` `MESSAGE_EDIT_WINDOW_MINUTES = 15` |
| Holds, escalation and audit-record lines (S12, S13, S16, S20, S95, S132) | `AdminActionLog` writes in the hold, escalate, guardian-notice and appeal services |
| Guardian-consent screens, withdrawal flow, request summary (S21 to S43, S56, S57, S70 to S78) | `auth/guardian-consent/*` services and `GuardianConsentConfirmPage` data from `request-summary` |
| Uploads checked before shown; only the uploader sees pending media (S64 to S67, S81 to S90) | `post-media`, `users/profile-image-*`, media visibility util |
| Suspension, appeal and context-hidden lines (S122 to S131, S139 to S142) | `account-suspension`, `moderation` services (B-291, B-292, B-293) |
| Removed content placeholders (S119 to S121) | `content-removal` (B-289) |

Rows found not to match: none. Nothing left tagged in the apps.

## Step 2: S6 reworded (the only copy change)

`apps/admin/src/pages/users/CorrectDobPage.tsx` now reads: "This correction makes the account a minor and no guardian is on file. We will email the consent request to the guardian at the address you enter below. Use the address from the support ticket." No tag.

## Counts

| | Before | After |
|---|---|---|
| Tagged places in built output | about 200 (web 149, admin 51) | 53 (web 53, admin 0), all from the legal draft |
| Manifest rows | 144 (web 93, admin 51) | 0 |
| Tagged strings in app source | 144 | 0 |

## Tests

- Playwright specs 21, 25, 32, 44, 51, 52, 53, 54, 65, 66: 56 passed.
- API: guardian-consent 18 suites / 278 tests passed; `consent-screen-version.spec.ts` 7/7 (hash updated, `CONSENT_SCREEN_VERSION` stays v8); `tsc` and eslint clean.
- Admin: 65 files / 1,033 tests passed; `tsc` and eslint clean.
- Web: `tsc` clean; Vitest 2,076 of 2,077 in one run, the failing `GuardianConsentPage` assertion was fixed and the file passes 23/23. Full web run was not repeated after that fix.
- Not run: CI, the rest of Playwright, the docx rebuild.

## Proposed Decision Log text (next number #550; register Section 112)

"#550 R108: all 144 pending-copy strings (web 93, admin 51) were read by the founder, who decided to clear the tag. The claim-bearing ones were checked against code and matched. S6 (admin DOB correction) was reworded to say the guardian address is entered by the admin from the support ticket; the system does not verify it. The manifest table is now empty. Remaining tags: the rendered legal draft (46 tags, 53 built places), owned by the legal-draft maintenance session."

## Left tagged or mentioning the tag

- `docs/legal-copy-draft-tos-privacy-policy.md` (not touched).
- Comment-only mentions of the tag remain in a few source files; they render nothing.
