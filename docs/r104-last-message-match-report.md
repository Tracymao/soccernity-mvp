# R104: last message-text match in the web app

Branch `r104-last-message-match`, cut from `origin/main` `4a65387` (R103 / PR #831 merged). **Docs only: no code changed.** Item 1 stops (the fallback must stay), item 2 asked for behaviour to stay as it is, item 3 found no web-only code-based case to fix. Nothing was run (no code change); everything is read from the files named below. No secrets printed.

## 1. EditProfileModal username fallback: KEPT, stopped

`apps/web/src/pages/profile/EditProfileModal.tsx` line 170 classifies a save error as a username error when `error.code` starts with `username_` OR the status is 409 and the message matches `/username/i`. The modal calls `PATCH /users/:id` (`UsersService.updateUser`), which uses `UsernamePolicyService.assertAssignable`.

Username errors the API returns on that route:

| Where | Status | Code | Message |
|---|---|---|---|
| Rule failure, club-name match, the user's own revoked handle (`username-policy.service.ts`) | 400 | `username_not_allowed` | not-allowed or personal-data message |
| 30-day change cooldown (`username-policy.service.ts`) | 429 | `username_change_cooldown` | "You changed your username recently..." |
| Clearing a username (`users.service.ts` line 590) | 400 | `username_required` | |
| **Handle under another person's revocation hold** (`username-policy.service.ts` line 67) | **409** | **none** | `That username is already taken` |
| **Unique-constraint race** (`users.service.ts` line 665) | **409** | **none** | `That username is already taken` |

Two 409 username refusals, including the ordinary "already taken" case, carry **no code**. Removing the message match would send "That username is already taken" to the general save error instead of under the username field. So the fallback stays and no change was made, as instructed.

Not username-related and correctly not matched: 409 `Your profile changed while this was being saved. Please try again.` (`users.service.ts` line 651, no "username" in the text). Class-validator 400s on `username` (global pipe, no code) also go to the general error; the modal pre-checks the pattern client-side.

**Needed to remove the fallback (backend, not done):** give the two `ConflictException`s a code (for example `username_taken`); then the web match can go and the planned test (a 409 mentioning "username" with no `username_*` code goes to the general error) can be added.

## 2. guardianConsentRejection (`apps/web/src/api/auth.ts` line 269): behaviour unchanged

Used by confirm, decline, the card-verification routes and the request-summary read. The withdrawal routes use a separate function (`postWithdrawalJson`).

Messages the API returns with a **400** (`guardian-consent.service.ts`; none carries a code):

- Confirm: `Invalid or expired consent token` (unknown or aged-out token); `Consent for this account was declined or withdrawn and cannot be confirmed with this link.`; "You reported incorrect details for this account, so it cannot be approved until support has reviewed them. You can still decline."; `Card verification must be completed before consent can be confirmed for this account.`
- Decline: `Invalid or expired consent token`; `This consent request is no longer awaiting a response.`
- Withdraw: `Invalid or expired withdrawal token`; and on the request side `Consent for this account has already been confirmed. Request a withdrawal link instead.` These are shown by the withdrawal page's own path, not this function.

The function shows the server message verbatim for any 400 except the generic `Invalid or expired consent token`, which becomes "This link is invalid or has expired. Ask the account holder to resend the request."

**Could any be misleading to a guardian when shown verbatim?** None is false. Two are worth a copy look (not a behaviour change): "declined or withdrawn and cannot be confirmed with this link" does not say what to do next, and "no longer awaiting a response" is what a guardian sees if they press decline on a request that is already decided. Both are accurate.

**429 wording ("Please wait a minute"):** confirm, decline, the card routes and request-summary use the shared `@AuthRateLimit()`, window `DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS = 60_000` (`rate-limit.constants.ts`, 5 attempts, overridable by `AUTH_RATE_LIMIT_WINDOW_MS`). "A minute" matches the default. The two withdrawal routes have their own limit of 5 per **15 minutes** (`guardian-withdrawal-throttle.ts`) and the withdrawal page has its own 429 state, so the "a minute" line is not shown there and no mismatch reaches a guardian today. If production overrides `AUTH_RATE_LIMIT_WINDOW_MS` the "a minute" would drift: copy for the maintenance session (wording with no duration).

## 3. Other classification by message text (web and admin)

Searched `apps/web/src` and `apps/admin/src` (non-test files) for equality, `includes`, `startsWith`, and regex `.test` or `.match` on a message:

| Where | What | Verdict |
|---|---|---|
| `EditProfileModal.tsx:170` | `/username/i` on a 409 message | kept, item 1 |
| `api/auth.ts:276` | `body.message !== "Invalid or expired consent token"` | kept, item 2 (no code from the server) |
| `apps/admin/.../CorrectDobPage.tsx:170` | `err.status === 400 && /provide guardian/i.test(message)` | **not fixed**: the API throws that 400 with no code (`admin-user-dob-correction.service.ts` line 348). Admin, and needs a backend code first, so not a web-only case. Suggest `guardian_details_required`, then match the code |
| `apps/web/src/api/*` (`contest`, `feed`, `grassroots`, `moderation`, `postMedia`, `search`, `usernameReview`, `users`, `under16`) and `apps/admin/src/api/adminTwoFactor.ts` | read `body.message` to display it, no branching on content | acceptable |
| `lib/session.ts`, `adminSession.ts` | `message` is a BroadcastChannel payload | not relevant |
| `ContactPage`, `AddRolePage`, `HeldInvestigationsPage` regexes | validate the user's own input | not relevant |

No web-only, code-based case remained to fix.

## Found, not fixed

1. Add a code to the two 409 "That username is already taken" exceptions; then drop the web regex and add the planned test.
2. Add a code to the admin DOB-correction "Provide guardian name, email and relationship." 400; then drop `/provide guardian/i` in `CorrectDobPage`.
3. Consider codes for the guardian-consent 400s so `guardianConsentRejection` need not compare a string.
4. Copy for the maintenance session: the two guardian 400 messages above, and "a minute" on the confirm/decline 429.
