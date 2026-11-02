# guardian-security-notice

Backend half of build-register row **B-275** (Decision Log **#456**, founder, 2026-11-01). When the account holder is a
**minor** (`User.isMinor`), the guardian gets one plain email for each security-related action on the account. The email
says what happened and when, nothing more: no IP address, device, location, link or other account data.

## Events built (only code paths that exist today)

| Event key | Fired by | When |
|---|---|---|
| `two_factor_enabled` | `UserTwoFactorController.confirm` | after `POST /auth/two-factor/enrol/confirm` succeeds |
| `two_factor_disabled` | `UserTwoFactorController.disable` | after `POST /auth/two-factor/disable` succeeds |
| `backup_codes_regenerated` | `UserTwoFactorController.regenerate` | after `POST /auth/two-factor/backup-codes/regenerate` succeeds |
| `password_changed` | `AuthController.changePassword` | after `POST /auth/change-password` succeeds |
| `password_reset` | `PasswordResetService.resetPassword` | after the reset has committed |
| `login_locked` | `LoginLockoutNotifier.notify` | when a sign-in (account + IP) pair spends its failed-login budget |

**Not built: email-address change.** No code path changes `User.email` (`PATCH /users/:id` excludes it by design; the only
other writes are the anonymiser and the admin tools). There is nothing to hook, so nothing was built for it.

**Not here:** the guardian-email-replaced notice (unchanged, `GuardianConsentService`), and recovery steps (a later PR,
B-276, adds its own event keys to the registry).

## Rules (checked in this order, in `GuardianSecurityNoticeService.notify`)

1. Only `isMinor = true`. An adult never triggers a guardian notice, even if an old `Guardian` row still exists.
2. Only a **confirmed** guardian (`Guardian.consentStatus = 'confirmed'`) with an email on file. For pending, declined or
   expired consent (an expired request is a `pending` row whose token has passed its expiry) nothing is sent, and the
   skip is logged (reason only: no address, no name).
3. `login_locked` is throttled: **at most one guardian lock notice per account per 24 hours**, claimed atomically in Redis
   (`SET key 1 EX 86400 NX`, key `guardian-security-notice:login_locked:<userId>`). **If Redis is unavailable the notice is
   skipped and logged** (there is deliberately no in-memory fallback: a missed notice is better than a flood).

## Behaviour guarantees

- `notify()` never throws; every failure (lookup, Redis, send) becomes a logged outcome.
- The routes call `notifyInBackground()` **after** the action has committed. It returns immediately, so it never delays or
  fails the user's action, and no route response was changed.
- The email data is `{ summary, when }` plus the subject; the registry's `summary` functions receive only the minor's
  display name.

## Adding an event (e.g. B-276 recovery steps)

Add one entry to `GUARDIAN_SECURITY_EVENTS` in `guardian-security-notice.constants.ts` (subject, summary, optional
`throttleSeconds`) and call `notifyInBackground(userId, '<key>')` after the action commits. Nothing else changes.

## Wording

All wording is plain functional copy and is **[COPY PENDING LEGAL REVIEW]**. It is listed in
`docs/pending-copy-manifest.md` (the `services/api` section; that guard covers `apps/web` and `apps/admin` only).

---

# Safety notices (B-279)

Backend half of build-register row **B-279** (Decision Log **#456**, founder, 2026-11-01, groups A, B and C). The same
service, registry and rules now also tell the guardian of a **minor** when **Soccernity** took a safety action on the
minor's account or content. These are the registry entries with `kind: 'safety'`; they use the `guardian-safety-notice`
email, which is the security email plus a pointer to the **Contact Us** page.

## The three groups (what is in, what is out)

| | | Decision |
|---|---|---|
| **A** | The platform (a moderator, an admin, or an automatic process such as image screening) takes an action on a minor's account or content | **Notify** the guardian: the kind of action and when |
| **C** | A report made **about** a minor by someone else | Notify the **outcome only**, and that outcome is an (A) action. Never that a report exists, never who made it. A **dismissed** report is not an action: nothing is sent |
| **B** | Something the **minor** does (reporting someone, blocking someone, muting) | **Never** notify. A child may be reporting someone in their own household |

## Inventory of platform-actor paths (every place a platform actor changes a minor's account or content)

"Emailed today" is what the **user** already gets. "Decision" is what B-279 does about the guardian.

| Path | Can it touch a minor? | User emailed today? | Decision |
|---|---|---|---|
| `ModerationService.actionReport` `content_removed` | Yes (the reported user: a post/comment author, or a user) | Reporter gets an outcome email; reported user gets an in-app `moderation_decision` | **Notify** `content_removed` |
| `actionReport` `warning_issued` | Yes | same | **Notify** `warning_issued` |
| `actionReport` `user_suspended` (a recorded decision; nothing enforces it) | Yes | same | **Notify** `account_suspended` |
| `actionReport` `room_deactivated` (Banter Room creator) | Yes | same | **Notify** `room_deactivated` |
| `actionReport` `dismissed` | Yes | Reporter only | **No notice**: no action; (C) forbids saying a report exists |
| `ModerationService.decideAppeal` `upheld` / `overturned` | Yes (the appellant is the reported user) | Appellant gets an appeal-decision email | **Notify** `appeal_upheld` / `appeal_overturned`, outcome only |
| `ModerationService.createReport`, `createPublicReport`, `appealReport` (the **minor's** own report/appeal) | Yes (the actor is the minor) | n/a | **Never** (B). Pinned by tests |
| `escalateReport` (records an escalation to a child-safety lead or authority) | Yes (the report may concern a minor) | No | **No notice**: an internal record; telling a guardian an escalation exists would reveal a report/investigation (C) |
| `HoldService.placeLegalHold` / `placeBadFaith` / `liftHold` | Yes (both parties) | **No** (Decision Log #398 D1, #403 item 8) | **No notice**, see "Holds" below |
| Report-derived account hold, `minimiseHeldUser` (account-deletion sweep) | Yes | No | **No notice**: automatic data minimisation after a grace period, not a safety action, and it would reveal a report |
| `AdminUsersService.updateUserStatus` `suspended` | Yes | No (sessions revoked) | **Notify** `account_suspended` |
| `updateUserStatus` `active` after `suspended` | Yes | No | **Notify** `account_reinstated`. Other moves to `active` (undoing a self-requested deletion) are not safety actions: nothing |
| `updateUserStatus` `deleted` (immediate removal) | Yes | No | **Notify** `account_removed`. The Guardian row is deleted by the same request, so the recipient is read first with `prepare()` and passed to `notify()` |
| `AdminUserUsernameRevokeService.revokeUsername` | Yes | Yes (`username-revoked`) | **Notify** `username_removed` (never the reason) |
| `AdminUserDobCorrectionService` (date of birth correction) | Yes | No | **No notice**: a data correction, not a safety action; if it restarts consent the existing guardian consent flow already contacts the guardian. A notice would risk leaking the date of birth or the age tier |
| `PostMediaDecisionService.reject` (a moderator rejects a file) | Yes (the uploader) | In-app `post_media_rejected` | **Notify** `media_not_approved` |
| `MediaCheckService.apply` (the **automatic** image check rejects a file) | Yes | In-app `post_media_rejected` | **Notify** `media_not_approved` |
| `PostMediaDecisionService.approve`, the automatic approval, a "keep" on a reported file | Yes | In-app (approve) | **No notice**: not an adverse action |
| Media report reaching the hide threshold (`PostMediaReportService`) | Yes | No | **No notice**: it is triggered by user reports, so a notice would reveal that reports exist (C); the later moderator decision is covered by the row above |
| `UserImageReviewService.rejectProfileImage` (avatar / cover) | Yes | In-app `profile_image_rejected` | **Notify** `profile_image_not_approved`. No HTTP route calls it yet (B-037/B-012): the hook is on the method |
| `GrassrootsService` sensitive-content screen auto-report | Yes (a submission) | No | **No notice**: the user confirms the submission themselves, and the report is the platform's own log |
| `AccountDeletionSweepService.anonymizeUser` after the grace period (the self-requested deletion) | Yes | Yes (the user asked) | **No notice**: the user's own action (B) |
| `AgeReclassificationSweepService`, `GuardianConsentExpirySweepService` | Yes | Yes | **No notice**: they already contact the guardian through the consent flow |
| Contact Us escalation (`ContactEnquiryAdminService.escalate`) | No (an enquiry has no reported user) | n/a | **No notice** |

**Decided, no code path today:** nothing. Every action the brief named exists as code; the hold is the one named action
deliberately **not** built.

## Holds: why no notice, and what would change it

The brief listed "a hold placed or lifted" under (A). It is **not built**, for three reasons that are all already
recorded decisions:
1. A legal hold or a bad-faith hold is placed **on a report**. A notice would tell a guardian that a report or an
   investigation exists, which (C) forbids ("never that a report exists").
2. A bad-faith hold is placed on the **reporter**. If the reporter is a minor, the notice would reveal that the child
   made a report, which is exactly what (B) protects.
3. Decision Log #398 D1 and #403 item 8: the held user is **not** notified of a hold.

**Open question for the founder** (this PR does not decide it): which holds, if any, a guardian should hear about.
Adding it later is one entry in the registry plus one call in `HoldService` (and a rule in `decide()` if some holds
should be excluded). The e2e spec pins today's behaviour (a legal hold, a bad-faith hold and a lift send nothing).

## Where the decision lives

`GuardianSecurityNoticeService.decide()` is the **one place** that decides whether a guardian may be emailed: a minor
(`User.isMinor`), a **confirmed** guardian, an address on file. A later rule (for example a child-protection exception
for one kind of action) is added there and nowhere else. **None exists now.**

## What a safety notice says

The kind of action, the date and time (UTC), and a pointer to the Contact Us page. It does **not** say the reason, the
rule that was broken, a report, a reporter, the moderator, or any content of a post. For an appeal it says the outcome
only (the earlier decision was upheld / overturned). The Contact Us link is `{WEB_APP_BASE_URL}/contact`; if that base
URL is unusable the email is still sent, without the link.

## Throttle

Every safety event is throttled to **one notice per kind per account per hour** (atomic Redis `SET NX EX 3600`). A
burst of actions sends the first notice and **drops** the rest (they are not queued). If Redis is unavailable the notice
is skipped and logged (same rule as B-275: a missed notice is better than a flood).

## Hooks (minimal calls, after the action commits)

| Event | Hook |
|---|---|
| `content_removed`, `warning_issued`, `account_suspended`, `room_deactivated` | `ModerationService.actionReport`, for the **reported** user only |
| `appeal_upheld`, `appeal_overturned` | `ModerationService.decideAppeal` |
| `account_suspended`, `account_reinstated`, `account_removed` | `AdminUsersService.updateUserStatus` (`prepare()` first for removal) |
| `username_removed` | `AdminUserUsernameRevokeService.revokeUsername` |
| `media_not_approved` | `PostMediaDecisionService.reject` and `MediaCheckService.apply` |
| `profile_image_not_approved` | `UserImageReviewService.rejectProfileImage` |

Every hook is `notifyInBackground()`: it returns at once, never throws, and a failure never fails or delays the action.

## Tests

`guardian-safety-notice.service.spec.ts` (every event: minor with a confirmed guardian sent, adult not, pending/declined/
missing guardian not, no address not, throttle, failures, `prepare()`, nothing forbidden in the sentence);
`moderation-guardian-notice.spec.ts` and the guardian-notice blocks in the admin-users, post-media and user-image-review
specs (when each hook fires and when not, including (B): creating a report never notifies);
`test/guardian-safety-notices.e2e-spec.ts` (real routes, Postgres and Redis: each hook fires once, the throttle key's
TTL, (B) minor reports and blocks send nothing, holds send nothing).

## Wording

All wording is plain functional copy and is **[COPY PENDING LEGAL REVIEW]**; it is listed in
`docs/pending-copy-manifest.md` (the `services/api` section).

## What the withhold flag gates (B-280; Decision Log #458)

A child-safety-vetted admin can switch **"withhold guardian notices"** on for a MINOR's account, with a written reason
(`GuardianNoticeWithhold`, one row per account while it is on; routes in `../admin-users/README.md`, "Guardian notices").
While the row exists, `decide()` returns `skipped_withheld` **after** the `isMinor` check and **before** the Guardian
check, so:

- every B-275 security notice and every B-279 safety notice for that account is skipped silently. The only trace is an
  internal log line ("withheld") with no reason, no admin, no address and no name;
- `decide()` runs before the throttle claim, so a withheld account never takes a throttle slot (a test proves it);
- `prepare()` returns `null` for it, so the account-removal notice is covered too;
- notices skipped while it was on are **not** queued: clearing the flag does not send them;
- nothing is created in-app for the guardian (no guardian Notification row exists).

An adult is unaffected (`isMinor` is checked first, so when the account turns 18 the flag is inert; the row stays until
the account is anonymised, and an admin can still clear it). The user query selects the flag as `{ id: true }` only: the
reason is never read here.

### Every sender to a guardian address, and whether the flag gates it

Found by grepping every `send*` call whose recipient is `Guardian.email` (or `guardian.email`):

| Email | Sent by | Gated by the flag? | Why |
|---|---|---|---|
| `guardian-security-notice` (B-275: two-factor on/off, backup codes, password change/reset, sign-in lock) | `GuardianSecurityNoticeService` | **Yes** | The point of the flag. |
| `guardian-safety-notice` (B-279: content removed, warning, suspension, reinstated, removed, username removed, room deactivated, media/profile image not approved, appeal upheld/overturned) | `GuardianSecurityNoticeService` | **Yes** | The point of the flag. |
| `two-factor-recovery-guardian-link` (B-276) | `TwoFactorRecoveryService.request` | **Yes**, differently | Recovery is switched off: a withheld minor is answered `no_guardian`, the request is never created and nothing is sent. Existing guardian links read as expired. |
| `guardian-consent` (the consent request: registration, resend, change-guardian-email, DOB-correction restart) | `RegistrationService`, `GuardianConsentService`, `AdminUserDobCorrectionService` | No | Consent mechanics are untouched (#458). Without it a withheld minor could never be approved. |
| `guardian-withdrawal-request` (the withdrawal link/code) | `GuardianConsentService` | No | Consent mechanics: a guardian must always be able to withdraw. |
| `guardian-email-replaced` (to the OLD guardian address) | `GuardianConsentService.changeGuardianEmail` | No | A consent-flow notice (the old address is told the request was withdrawn). Decision Log #458 leaves it. |
| `guardian-minor-turned-18` | `AgeReclassificationSweepService` | No | Consent/age mechanics; the flag is inert once the account is an adult anyway. |

Emails that go to the **minor**, not the guardian (the consent reminder, decline/withdrawn/expired notices, the
stale-decline reminder, the recovery minor notice), are not guardian notices and are not affected.
