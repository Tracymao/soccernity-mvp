# R102: say why a write is refused, and fix the sign-in lockout message

Branch `r102-refusal-reasons`, cut from `origin/main` `c2c9d7f` (after the humanizing batches A and C). `apps/web` only. No API behaviour change, no guard change, no new code, no legal draft, Figma or counsel pack edit. Decision Log #543.

## What changed

1. `apps/web/src/pages/community/writeRefusal.tsx`
   - New classification `profile-incomplete` (code `profile_incomplete`): post box "Choose a username to post.", comment box "Choose a username to comment.", with the link text "Choose a username" going to `/create-profile`. Same pattern as the verify-email notice.
   - New classification `under-16` (code `under_16_restricted`): shows the shared plain line from `lib/under16.ts`, "This isn't available for your account yet." (no age threshold, no link). It is the wording every existing under-16 screen already uses, so nothing new was invented.
   - Everything else is unchanged. The generic "You can't do that right now." now appears only for a 403 with a missing or unknown code.
   - `FeedApiError` and `ContestApiError` already carried `code`; no type change was needed, only the constants in the classifier.
2. `apps/web/src/api/auth.ts` `login()`: a 429 now reads "Too many sign-in attempts. Please wait a little while and try again." (no duration, no email promise). 401 and the deactivated-account branch are untouched.
3. Tests: `writeRefusal.test.tsx` (classifier, post box and comment box for the new codes incl. link targets, under-16 line with no digit, unknown code never gives the guardian line even when the server text mentions guardian consent) and `auth.test.ts` (429 message, 500 stays generic).

## Table: 403 codes the web write surfaces can receive

"Before" is what the person saw before this PR; "After" is what they see now. A surface that shows the server's own `message` is marked "server text".

| Code | Guard / source | Where the web calls it | Before | After |
| --- | --- | --- | --- | --- |
| `guardian_consent_pending` | `GuardianConsentGuard` | Post box, comment box (and every write route behind it) | Guardian message and link to `/guardian-consent` | Unchanged |
| `email_verification_required` | `EmailVerifiedGuard` | Post box, comment box | "Verify your email to post/comment." linking `/verify-email/prompt` (R101) | Unchanged |
| `profile_incomplete` | `ProfileCompleteGuard` ("Complete your profile (choose a username) to continue.") | Post box, comment box | "You can't do that right now." | "Choose a username to post." / "...to comment." linking `/create-profile` |
| `under_16_restricted` | `Under16RestrictionGuard` (only on `/conversations`, `/banter-rooms`, `POST /community-groups`, not on `/posts`) | Messages, Bants, Community Groups already swap in the shared line through `apiFailure`; the post/comment classifier would only see it if a feed route ever got the guard | Post/comment classifier: generic line (not reachable today) | Post/comment classifier: "This isn't available for your account yet." Other surfaces unchanged |
| `media_uploads_disabled` | `MediaUploadsEnabledGuard` | Upload controls (`useMediaUploads`) | Own handling ("Uploads aren't available right now") | Unchanged |
| `contest_*` (`contest_voting_closed`, `contest_already_voted`, `contest_final_locked`, `contest_not_finalist`, `contest_entries_closed`, `contest_final_upload_closed`, `contest_not_accepting_entries`, `contest_entry_not_votable`, ...) | Contest services | Contest page, voting, final entry, composer contest step | Own handling: shown with the server's message, or inline refusal | Unchanged, left as is on purpose. In the post box's contest step they are not classified (only guardian and verify-email get a notice); they keep "Your post was published, but <server reason>". |
| `account_hold_active`, `child_safety_vetting_required`, `admin_*`, `appeal_*`, `hold_*`, `banter_room_*`, `guardian_notices_*`, `suspension_*`, `staff_appeal_*`, `reported_account_unavailable`, `user_suspension_not_applicable`, `content_removal_not_applicable`, `escalation_reason_invalid` | Admin or staff routes | `apps/admin`, not these web write surfaces | n/a to this PR | n/a |
| `username_*` (`username_change_cooldown`, `username_not_allowed`, `username_required`, ...), `profile_visibility_not_available`, `invalid_profile_country`, `sensitive_content_rephrase_required` | Profile and username routes | Create Profile, Edit Profile, Privacy settings | Own handling with server text or specific lines | Unchanged |
| `message_*` (`message_edit_window_closed`, `message_not_editable`, `message_edit_not_sender`, `message_delete_not_sender`, `message_removed`), `you_blocked_this_user` | Messaging and block routes | Chat and profile | Own handling | Unchanged |
| `wrong_password`, `two_factor_*`, `email_change_*`, `data_export_*`, `too_many_requests`, `account_deactivated` | Settings, sign-in and two-factor routes | Settings pages, sign-in | Own handling | Unchanged |
| missing or unknown code | any | Post box, comment box | "You can't do that right now." | Unchanged; now only these |

The Bants room composer, the message send box and the Community Groups create/join buttons do not use the classifier. They show the server's own `message` (guardian: link to `/guardian-consent`). For those, a `profile_incomplete` 403 therefore already shows the server text "Complete your profile (choose a username) to continue." and a `email_verification_required` one shows "Verify your email address to continue." Those are plain and correct, so they were left as they are (the brief limits this PR to the named strings). They have no link to the page that fixes it.

## Sign-in and related 429s

| Place | A 429 shows | Action |
| --- | --- | --- |
| Web `login()` | Was "Something went wrong signing you in." | Fixed: "Too many sign-in attempts. Please wait a little while and try again." |
| Web two-factor code step (`completeTwoFactorLogin`) | "Too many incorrect codes." with code `two_factor_code_locked` | Already handled, left |
| Web guardian-consent routes | "Too many attempts. Please wait a minute and try again." | Left (it names "a minute"; the real windows are longer; listed below) |
| Web resend verification email | Own "limited" state on the verify prompt | Already handled, left |
| Web forgot-password | Any failure, 429 included, shows "Something went wrong sending that. Please try again in a moment." | Not fixed, listed below |
| Admin sign-in (`apps/admin` `adminLogin`) | 429 gives "Too many attempts. Please wait a minute and try again." | Already handled, left (see "found, not fixed") |
| Admin two-factor code step | 429 maps to the "locked" state | Already handled, left |
| Web Inactive Account page (reactivate / delete) | Server message via `AuthApiError` | Left |

## Found, not fixed

- Forgot-password shows a bare "Something went wrong sending that." for a 429 (the per-IP and per-email limits work). A specific line would be a one-branch change in `ForgotPasswordPage.tsx`; not in the named strings.
- Admin sign-in and the guardian-consent routes say "wait a minute" on a 429. The admin login window is 15 minutes and the account lockout is 15 minutes, so "a minute" can be wrong. Wording is the maintenance session's.
- Bants, messages and Community Groups show the server text for `profile_incomplete` and `email_verification_required` but with no link to Create Profile or the verify page.
- The post box's contest step still gives the generic server reason for a `profile_incomplete` 403 on the entry call; not reachable in practice because the post call fails first.
- Strings that could be read as a legal claim: none. The new messages are plain statements of fact and are not tagged `[COPY PENDING LEGAL REVIEW]`. The counsel pack and the manifest are unchanged.

## Verification

See the PR description for the measured counts (web `tsc`, eslint and vitest; admin and API suites were not changed).
