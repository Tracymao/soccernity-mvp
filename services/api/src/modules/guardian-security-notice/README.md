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
