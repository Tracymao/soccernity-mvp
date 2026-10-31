# two-factor

Authenticator-app (TOTP, RFC 6238) two-factor for **users (optional)** and **admins (mandatory before launch)**, on one shared backend.
Build-register rows **B-086** (the TOTP backend) and **B-270** (admin enforcement and reset); Decision Log **#446** (decisions of
2026-10-29/30), **#405 item 8**, **#404 item 7**, **#397**, **#378**, **#425**. The platform is not live. Counsel's Part C row 44 stays open.

Not built here: any frontend or QR image (the web draws the QR from `otpauthUri`), email notices, SMS, WebAuthn, the admin screens (B-271).

## What a user or admin experiences

| Step | Endpoint | Notes |
|---|---|---|
| Sign in, password step | `POST /auth/login` / `POST /admin/auth/login` | Two-factor ON: **200 `{ twoFactorRequired, challengeToken, challengeExpiresInSeconds }`**, no tokens, no cookie. |
| Sign in, code step | `POST /auth/login/two-factor` / `POST /admin/auth/login/two-factor` `{ challengeToken, code }` | `code` is a 6-digit authenticator code **or** a backup code. Issues the session exactly like login (cookie mode, "stay signed in" kept). |
| Reactivate a deactivated account | `POST /auth/reactivate-account` | Two-factor ON: a **challenge** too (see "Found while building"). Finished by `POST /auth/login/two-factor`, which reactivates then. |
| Settings: status | `GET /auth/two-factor/status`, `GET /admin/auth/two-factor/status` | `{ enabled, backupCodesRemaining }` |
| Settings: turn on | `POST …/two-factor/enrol/start` then `…/enrol/confirm { code }` | start returns `{ secret, otpauthUri }`; confirm returns **`{ backupCodes }` once**. 409 if already on. |
| Settings: new backup codes | `POST …/two-factor/backup-codes/regenerate { password }` | Replaces all ten. |
| Settings: turn off | `POST …/two-factor/disable { password }` → 204 | Admins: **403 while `ADMIN_2FA_ENFORCED` is `"true"`**. |
| Admin, enrolment at sign-in | login returns `{ twoFactorEnrolmentRequired, enrolmentToken, expiresInSeconds }` (no session), then `POST /admin/auth/login/two-factor/enrol/start { enrolmentToken }` and `…/enrol/confirm { enrolmentToken, code }` | confirm returns the **session and the 10 backup codes**. Only when `ADMIN_2FA_ENFORCED` is `"true"` and the admin has no two-factor. |
| Admin, peer reset | `POST /admin/staff/:id/two-factor/reset` (superadmin only, in `admin-staff-roles`) | Refused for yourself (403). Clears the secret + codes, ends all the target's sessions, audit row `admin_user.two_factor_reset`, same transaction. 409 if there was nothing to reset. |

The user settings routes are `JwtAuthGuard` only (not `GuardianConsentGuard`): a restricted-pending minor may protect their own account. The directory is
listed in `write-route-guards.spec.ts`'s skipped set, with the reason.

## Design

- **Library:** `otpauth` 9.5.2 (RFC 6238; its only dependency is `@noble/hashes`). `npm audit --omit=dev --workspace=services/api --audit-level=high` (the CI gate) passes.
- **TOTP:** SHA-1, 6 digits, 30 s, one step either side. **Replay:** after a valid code `totpLastUsedStep` is advanced with an atomic compare (`updateMany` where it is null or lower), so a step already used is refused. The enrolling code's step is recorded too.
- **Secret:** 20 random bytes, base32. Stored **only as ciphertext**: `DobEncryptionService.encryptString` (AES-256-GCM, `v1:<iv>:<tag>:<ct>`, `DOB_ENCRYPTION_KEY`, the same key and code as dates of birth). An unconfirmed secret lives only in Redis (encrypted, 10 min) until the first valid code.
- **Backup codes:** 10 × 10 characters, upper-case letters and digits without `0 O 1 I` (a 32-character alphabet, uniform byte mask). Stored as **argon2id hashes** (`PasswordService`). A code is compared against **every** unused hash (no early exit), spent with an `updateMany … usedAt IS NULL` guard (so two simultaneous requests cannot both spend it). Typed lower-case, with spaces or a hyphen, is accepted. Regenerate and turn-off delete all codes.
- **One message for wrong and used:** a wrong TOTP, a replayed TOTP, a wrong backup code and a spent one all answer the same 401 body.
- **Per-account lock:** 5 wrong codes in 15 minutes lock code entry for that account for 15 minutes (`429` with `Retry-After`, no count in the body). The slot is reserved *before* the check (INCR), so 20 parallel guesses see five attempts; the 5th wrong one restarts the 15-minute clock.
- **Tokens:** opaque `<uuid>.<secret>` (hash stored, Redis TTL) in three disjoint namespaces: `user-login`, `admin-login`, `admin-enrol`. A token of one kind is never found by another kind's endpoint. A challenge is consumed on **success** only; a typo does not force a new sign-in. The account is re-read at the code step: deactivated, suspended, pending deletion, or reset in between gives the generic 401.
- **Two audiences, one core:** `TwoFactorService` is written once against a repository; `UserTwoFactorRepository` (`User` + `UserBackupCode`) and `AdminTwoFactorRepository` (`AdminUser` + `AdminBackupCode`) are the only code that touches either domain's tables. Redis keys carry the audience. `TokenService`, `AdminTokenService`, the cookie code and the rate-limit modules are untouched (B-248 cookie behaviour unchanged).
- **Clock:** TOTP steps are read through `APP_CLOCK` (like the Contest services), so the e2e suite steps through codes deterministically.
- **Rate limits (on top of the per-account lock):** code-checking endpoints carry `@AuthRateLimit` with `@SkipGlobalWriteLimit`: users **30 / 15 min**, admins **10 / 15 min** per IP, per handler. The login limiter already treats the challenge answer as a normal outcome: `AuthLimitsInterceptor` releases the failed-attempt slot on any resolved value, and `auth-limits.http.spec.ts` now pins it (20 challenges consume nothing).
- **Redis outage:** challenges, pending secrets and the lock live in Redis only, with no in-memory fallback, so **second-factor sign-in is unavailable while Redis is down**. Accepted (Decision Log #439). Password-only accounts are unaffected by this module.

## ADMIN_2FA_ENFORCED

Only the literal string **`"true"`** turns enforcement on (`TRUE`, `1`, empty and unset leave it off). **Default off**: the admin screens for enrolment do not exist yet and turning it on would lock every admin out. While it is not `"true"` the API logs a warning at start. It must be `"true"` in production at launch (launch-gate check B-267). In `render.yaml` it is `sync: false` in both services so a Blueprint re-sync cannot switch it back off; `.env.example` and `docs/deployment.md` document it, and `env-completeness.spec.ts` pins all of that.

Enforcement applies **at sign-in**: sessions that exist when the switch is turned on continue until they end ("at the next sign-in"). A peer reset ends the target's sessions, so a reset admin does face the gate. Refresh is not gated (adopted: no extra read per refresh; flagged below).

## Defaults I chose (founder can veto — each is flagged in the PR)

SHA-1 / 6 digits / 30 s / ±1 step · replay of a used step refused · challenge valid **5 min**, admin enrolment token and pending secret **10 min** · per-IP limits **30 (users) / 10 (admins) per 15 min** · an admin **cannot turn off their own** two-factor while enforced · turn-off and regenerate **do not end other sessions** · **no email** on reset (or on anything) · the reset of a non-enrolled admin is a **409**, not a silent success · a wrong-format code (neither 6 digits nor a backup code) still counts as an attempt.

## Found while building (differences from the brief)

1. **`POST /auth/reactivate-account` issued a session on a password alone**, which would have been a way round the second factor. It now ends in the same challenge as login for an account with two-factor on; the *reactivation itself* (deactivated → active) is deferred until `POST /auth/login/two-factor` proves the code (a `reactivate` purpose on the challenge). `suspended` and `pending_deletion` are still refused outright. Beyond the brief's list, closed because it is a bypass inside this feature. The web `InactiveAccountPage` must handle the challenge answer (frontend not built).
2. `login` and `reactivate-account` (and the admin login) now return a **union** (`session | challenge | enrolment-required`). Existing service specs read tokens off the result, so `auth.service.spec.ts` and `admin-auth.service.spec.ts` use a tiny test-only subclass that narrows the type back; no assertion changed.
3. The brief said the audit row is written "in the same transaction"; `AdminActionLogService.record()` is not transactional, so the reset writes `tx.adminActionLog.create` inside the reset transaction directly (the pattern `HoldService` and the username revoke already use).

## Decision Log candidates (additions beyond Build Plan Section 3 — NOT transcribed into the docx)

1. `User` and `AdminUser`: `totpSecretEncrypted String?`, `totpEnabledAt DateTime?`, `totpLastUsedStep Int?`.
2. New models `UserBackupCode` and `AdminBackupCode` (`id`, owner FK with cascade delete, `codeHash`, `usedAt`, `createdAt`).
3. New environment variable `ADMIN_2FA_ENFORCED`.
4. New dependency `otpauth` 9.5.2.
5. `reactivate-account` answering a challenge (above), and the three-way login response shapes.

## Not built / open

- No frontend, QR image, email notice, SMS, WebAuthn; no admin screens (B-271); no guardian involvement for a minor's two-factor.
- **Refresh is not gated by enforcement**: an admin with a session from before the switch keeps it until it expires (up to the 7-day refresh TTL). Add a check in `AdminAuthService.refreshSession` if "no grace period" should also cover live sessions.
- No in-memory fallback for the code lock; no per-IP limit on `POST /auth/two-factor/regenerate|disable` (they need an access token *and* the password; the global write limit still applies).
- Anyone who has a user's password can lock that user's *code entry* for 15 minutes by failing five codes (the same shared-lockout trade-off Decision Log #432 records for the password lock). The password is already needed to obtain a challenge.
- A key rotation has no procedure (`docs/dob-encryption-rollback.md`).
- Backup-code timing: an account with **no unused codes left** skips the hashing work, so that one state is slightly faster to refuse.
- Counsel: wording of any user-facing text (none is added here; messages are functional and untagged), the DPIA mention of authenticator data, and Part C row 44 are open.

## Tests

`totp.util`, `backup-code.util`, the limiter, the token store, `TwoFactorService` (35 cases), the user and admin settings controllers, the two auth controllers' new branches, `AuthService` / `AdminAuthService` two-factor branches and the staff reset: all unit/HTTP (no database). `test/two-factor.e2e-spec.ts` runs against real Postgres and Redis (ciphertext and hashes in raw SQL, the backup-code race, the real lock TTL, the peer reset and the recovery SQL from `docs/admin-two-factor-recovery.md`).
