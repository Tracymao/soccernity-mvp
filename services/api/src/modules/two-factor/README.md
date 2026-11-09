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
| Settings: status | `GET /auth/two-factor/status`, `GET /admin/auth/two-factor/status` | User: `{ enabled, backupCodesRemaining }`. Admin: the same **plus `enforced`** (true only when `ADMIN_2FA_ENFORCED` is exactly `"true"`), so the console knows whether Turn off will be refused. |
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
- **Secret:** 20 random bytes, base32. Stored **only as ciphertext**: `DobEncryptionService.encryptString` (AES-256-GCM, `v<N>:<iv>:<tag>:<ct>` where N is the key version, `DOB_ENCRYPTION_KEY`, the same key and code as dates of birth). An unconfirmed secret lives only in Redis (encrypted, 10 min) until the first valid code.
- **Backup codes:** 10 × 10 characters, upper-case letters and digits without `0 O 1 I` (a 32-character alphabet, uniform byte mask). Stored as **argon2id hashes** (`PasswordService`). A code is compared against **every** unused hash (no early exit) and the work is padded with dummy verifications up to exactly 10 (`BACKUP_CODE_COUNT`) against a dummy hash created once at start-up (`TwoFactorService.onModuleInit`, the way `AdminAuthService` creates `dummyPasswordHash`), so an account with no unused codes is refused in the same time as one with ten; the dummy results are dropped unread, so a dummy can never be what accepts a code. Spent with an `updateMany … usedAt IS NULL` guard (so two simultaneous requests cannot both spend it). Typed lower-case, with spaces or a hyphen, is accepted. Regenerate and turn-off delete all codes.
- **One message for wrong and used:** a wrong TOTP, a replayed TOTP, a wrong backup code and a spent one all answer the same 401 body.
- **Stable `code` on the three two-factor 401s** (status and message unchanged; exported from `two-factor.constants.ts`). Clients read the code, not the message text:
  - `two_factor_invalid_code` — a wrong, replayed or already-spent authenticator or backup code, at sign-in and at enrolment confirm. One code for all of them, exactly as they share one message, so they stay indistinguishable.
  - `two_factor_invalid_challenge` — a sign-in challenge or admin enrolment token that is malformed, expired, spent, for another audience, or for an account that changed in between.
  - `two_factor_incorrect_password` — a wrong password on `backup-codes/regenerate` and `disable`, user and admin (message `Incorrect password`). The login password step keeps its generic `Invalid credentials` with no code, as does `POST /auth/change-password` (not a two-factor route).
- **Per-account lock:** 5 wrong codes in 15 minutes lock code entry for that account for 15 minutes (`429` with `Retry-After`, no count in the body). The slot is reserved *before* the check (INCR), so 20 parallel guesses see five attempts; the 5th wrong one restarts the 15-minute clock.
- **Tokens:** opaque `<uuid>.<secret>` (hash stored, Redis TTL) in three disjoint namespaces: `user-login`, `admin-login`, `admin-enrol`. A token of one kind is never found by another kind's endpoint. A challenge is consumed on **success** only; a typo does not force a new sign-in. The account is re-read at the code step: deactivated, suspended, pending deletion, or reset in between gives the generic 401.
- **Two audiences, one core:** `TwoFactorService` is written once against a repository; `UserTwoFactorRepository` (`User` + `UserBackupCode`) and `AdminTwoFactorRepository` (`AdminUser` + `AdminBackupCode`) are the only code that touches either domain's tables. Redis keys carry the audience. `TokenService`, `AdminTokenService`, the cookie code and the rate-limit modules are untouched (B-248 cookie behaviour unchanged).
- **Clock:** TOTP steps are read through `APP_CLOCK` (like the Contest services), so the e2e suite steps through codes deterministically.
- **Rate limits (on top of the per-account lock):** code-checking endpoints carry `@AuthRateLimit` with `@SkipGlobalWriteLimit`: users **30 / 15 min**, admins **10 / 15 min** per IP, per handler. The login limiter already treats the challenge answer as a normal outcome: `AuthLimitsInterceptor` releases the failed-attempt slot on any resolved value, and `auth-limits.http.spec.ts` now pins it (20 challenges consume nothing).
- **Redis outage:** challenges, pending secrets and the lock live in Redis only, with no in-memory fallback, so **second-factor sign-in is unavailable while Redis is down**. Accepted (Decision Log #439). Password-only accounts are unaffected by this module.

## ADMIN_2FA_ENFORCED

Only the literal string **`"true"`** turns enforcement on (`TRUE`, `1`, empty and unset leave it off). **Default off**: the admin screens for enrolment do not exist yet and turning it on would lock every admin out. While it is not `"true"` the API logs a warning at start. It must be `"true"` in production at launch (launch-gate check B-267). In `render.yaml` it is `sync: false` in both services so a Blueprint re-sync cannot switch it back off; `.env.example` and `docs/deployment.md` document it, and `env-completeness.spec.ts` pins all of that.

Enforcement applies **at sign-in and at the next refresh** (founder decision 2026-10-31: block at next refresh; `backend/b086-two-factor-followups`). A peer reset ends the target's sessions, so a reset admin faces the gate at the next sign-in.

**The refresh gate** (`AdminAuthService.refreshSession`, so both body and cookie mode). With enforcement `"true"` and no two-factor on the admin (`totpEnabledAt` null), `POST /admin/auth/refresh` answers **401** with `{ code: "admin_two_factor_enrolment_required", message: "Two-factor enrolment is required." }` and ends **all** of that admin's sessions (`revokeAllSessionsForAdmin`). No token pair is returned, and in cookie mode the existing catch clears the `sn_admin_rt` cookie. An enrolled admin, enforcement off (unset or anything but the literal `"true"`, which costs no query), and users (their two-factor is optional) are unaffected; an admin row that no longer exists is not gated (unchanged behaviour).

*Where the check sits: after rotation, not before.* The refresh token is validated and consumed first, so a bad or replayed token is the ordinary 401 and touches no account (reuse detection is unchanged), and the admin's identity comes from the token that was actually consumed (read from the access token just signed for it, so no lookup API on the token store was needed). Revoking the whole family then removes the replacement the rotation issued too: it was never returned to the caller, so no usable refresh token is left behind. If the revoke itself failed (Redis down) the request is a 500 and the replacement, never returned, is unreachable.

*Accepted:* **access tokens already issued stay valid until they expire (15 minutes by default, `ADMIN_JWT_ACCESS_TTL_SECONDS`).** There is deliberately no per-request database check, so an unenrolled admin's last access token runs out within that time, not at once. Proven by an e2e test.

## Recovery: a USER who lost the device AND the backup codes (B-276; Decision Log #455, #456)

Users only. Admins keep the peer-superadmin reset. Code: `recovery/` (`two-factor-recovery.service.ts` is the rules,
`.controller.ts` the routes, `-sweep.service.ts` the hourly job). Table `TwoFactorRecoveryRequest` (migration
`20261106090000_add_two_factor_recovery_request`): link and cancel tokens only as SHA-256 hashes, state in a CHECK, and a
partial unique index so an account has at most ONE active (pending or waiting) request. **No sign-in guard on any of
these routes**: the person cannot sign in and a guardian has no account; each route's credential is what it carries.

**Routes** (`/auth/two-factor/recovery/...`, for the web agent):

| Route | Body | Answer |
|---|---|---|
| `POST request` | `{ email, password }` | `202 { audience: "account" \| "guardian" \| "no_guardian" }` |
| `GET link/:token` | | `{ state: "valid"\|"expired"\|"used"\|"invalid", kind: "adult"\|"guardian"\|null, minor?: { publicName }, requestedAt? }` (no side effects; `Cache-Control: no-store`) |
| `POST confirm` | `{ token }` | `{ state: "waiting", executeAt, cancelToken }` (adult) |
| `POST cancel` | `{ cancelToken }` | `{ state: "cancelled" }` (adult; the notice email's link, or the confirm page's "This wasn't me") |
| `POST guardian/approve` | `{ token }` | `{ state: "done" }` |
| `POST guardian/decline` | `{ token }` | `{ state: "declined" }` |

A rejected link action is **400** `{ statusCode, error, code, state, message }` with `state` one of `invalid` / `expired`
/ `used` and `code` `two_factor_recovery_link_<state>`. A superseded link reads as `expired`; every other ended state as
`used`. `minor` and `requestedAt` appear only on a **valid guardian** link and carry the minor's PUBLIC name (username, or
"Soccernity member"; never the real name).

**Emailed links** (the web pages to build; the token is `?token=`): adult confirm `/two-factor-recovery/confirm`, guardian
`/two-factor-recovery/guardian`, adult cancel `/two-factor-recovery/cancel` (that page calls `POST cancel` with
`{ cancelToken: <token> }`; use a button, not an automatic call on load, so a scanner cannot cancel). Adult link lives
24 hours (DEFAULT), guardian link 72 hours.

**`request`**: an unknown email, a wrong password, two-factor off and a non-active account are the SAME `202 { audience:
"account" }`, send nothing, do one argon2 verification each (a dummy hash when there is no account) and spend the same
budget, so the audience is revealed only after a correct password. After one: an **adult** gets a link at their own
address; a **minor whose guardian notices are withheld** (B-280) gets the SAME adult path (below, Decision Log #480); any
other **minor with a confirmed guardian** (and an email on file) gets a link sent to the **guardian** and a notice at
their own address that it went there; any other **minor with no confirmed guardian** gets `no_guardian` and nothing is
created or sent. A new request supersedes an earlier unused one; a request that is already WAITING is left alone (same 202, no new
row, no email). Adult or minor is `User.isMinor` at the moment of the request.

**Limits.** The route first charges the EXISTING login limiter (`AuthLimitsService.beginLogin/endLogin`: the per-IP
ceiling, the per-(account, IP) failed-attempt budget and the account-wide ceiling), so a wrong password here spends the
same budget as a wrong password at sign-in, and a correct one gives the slot back. Then a recovery budget keyed on the
normalised email alone and charged for EVERY request, existing account or not: **3 an hour and a 60-second gap** (a
refused request spends neither). Plus `@AuthRateLimit` 20 per 15 minutes per IP (DEFAULT). A limit is the standard `429`
with `Retry-After`. **While Redis is down, `request` and `guardian/approve` answer `503 { code:
"two_factor_recovery_unavailable" }`** (Decision Log #439: the sign-in the flow ends in needs Redis, and the limiters
would otherwise silently fall back to per-process memory). The other routes use only Postgres and keep working.

**Adult wait.** `confirm` consumes the link atomically, sets `executeAt = now + 24 h` and emails the account a notice with
a separate single-use cancel link (the same token is returned in the response so the confirm page can offer "This wasn't
me"). `cancel` works until the sweep has actually removed two-factor (even a little past `executeAt`). A successful
two-factor sign-in (device code or backup code, `AuthService.completeTwoFactorLogin`) cancels a **waiting** request (a
pending one is left alone: the brief says "waiting"), and the sign-in **challenge** carries `recoveryPending: boolean`
(and `recoveryExecuteAt`, ISO, when true), added only after the password step succeeded, on both login and
reactivate-account.

**Removing two-factor** is one primitive (`complete()`), used by guardian approve and by the sweep: **sessions are ended
first** (they live in Redis and cannot join a database transaction; ending them first means "two-factor removed" never
exists alongside a session that was opened with it; the cost is that a request which then loses its race signs the person
out once), then the claim on the request row and the clearing of the secret and every backup code
(`TwoFactorService.resetUser`, the user twin of the admin `resetAdmin`) happen in ONE transaction, so a lost race clears
nothing. A guardian can only remove two-factor from a **minor's active** account; if the person turned 18, closed the
account or already turned two-factor off, the link reads as expired.

**Sweep** (`TwoFactorRecoverySweepService`, `@Cron(EVERY_HOUR)`, reads `APP_CLOCK`): completes every confirmed request whose
`executeAt` has passed (two-factor and backup codes removed, all sessions ended, completion email), cancels a wait whose
account closed or already turned two-factor off, and deletes ended rows 30 days after `doneAt` and never-used links 30
days after they expired. At most 200 completions per run; a failing row is logged and retried next hour.

**Emails** (seven templates on `RegistrationEmailService`, all `[COPY PENDING LEGAL REVIEW]`, listed in
`docs/pending-copy-manifest.md`): none logs a recipient, a token or a link, live or not; a link email is skipped, with an
error logged, if `WEB_APP_BASE_URL` is unusable. **No B-275 guardian security notice is sent for any recovery step**: the
guardian's own link email is the one guardian email of the request, and approve/decline are the guardian's own actions.

**Defaults I chose (founder can veto):** adult link 24 h · per-IP 20 per 15 min · a waiting request is not replaced by a
new one · a successful sign-in cancels only a waiting request · all four failure cases spend the login budget · the
cancel token is also returned by `confirm`.

## Recovery and the withhold flag (B-280; Decision Log #458, #480)

Guardian-assisted recovery is **off** while a child-safety-vetted admin has "withhold guardian notices" switched on for
the minor's account, and the minor recovers like an adult instead (Decision Log #480, founder, 2026-11-08):

- `request()`: after a CORRECT password, a minor with the flag set takes the **adult path**: `kind: "adult"`, the link goes
  to the account's **own email**, the answer is `{ audience: "account" }`, the same 24-hour wait, the same limits and the
  same limiter budget. It does not matter whether the minor has a guardian row, a pending guardian or a confirmed one: the
  flag decides. **Nothing goes to the guardian**, no minor notice is sent (it would only say the link went elsewhere), and
  the B-275 / B-279 notice gate stays silent as before. A wrong password, an unknown account, two-factor off and a closed
  account are still the one generic `{ audience: "account" }`, so the answer for a flagged minor is byte-identical to every
  other failure and nothing about the flag is revealed. Every OTHER minor behaves exactly as before: a guardian link, or
  `no_guardian` when there is no confirmed guardian.
- **Completion is re-checked against the flag, twice.** An adult-kind request belongs to a minor only while the flag is
  STILL set: `confirm` (the link click) reads the flag at that moment and, if it was cleared in between, the request is
  ended and the link reads as `expired` (the same answer as any other changed account); and the hourly sweep
  (`completeDue`) cancels a confirmed wait for a minor whose flag was cleared during the 24 hours and removes nothing
  (it is counted in `cancelled`). An adult account is never affected by the flag.
- The guardian routes (`GET link/:token` for a guardian link, `guardian/approve`, `guardian/decline`) treat a withheld
  account as an **expired** link and do nothing (no session ended, no email, the request row untouched).
- Setting the flag also **cancels, in the same transaction**, any active guardian-kind request for the account
  (`state: cancelled`, `doneAt` set), so an old link stays dead after the flag is cleared (it reads as used/expired).
  Adult-kind requests are not touched when the flag is set or cleared; the checks above handle them at confirm and in the
  sweep.
- Before #480 a flagged minor got `no_guardian` and was pointed to Contact Us. That is no longer the answer for a flagged
  minor (it remains the answer for an unflagged minor with no confirmed guardian).


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

- No frontend, QR image, SMS, WebAuthn; no admin screens (B-271). A minor's lost-device recovery goes through the guardian (see "Recovery"); the recovery web pages are not built.
- **Refresh is gated; access tokens already issued run out within 15 minutes** (see "The refresh gate"). No per-request check, by decision.
- No in-memory fallback for the code lock; no per-IP limit on `POST /auth/two-factor/regenerate|disable` (they need an access token *and* the password; the global write limit still applies).
- Anyone who has a user's password can lock that user's *code entry* for 15 minutes by failing five codes (the same shared-lockout trade-off Decision Log #432 records for the password lock). The password is already needed to obtain a challenge.
- A key rotation has no procedure (`docs/dob-encryption-rollback.md`).
- Counsel: wording of any user-facing text (none is added here; messages are functional and untagged), the DPIA mention of authenticator data, and Part C row 44 are open.

## Tests

`totp.util`, `backup-code.util`, the limiter, the token store, `TwoFactorService` (35 cases), the user and admin settings controllers, the two auth controllers' new branches, `AuthService` / `AdminAuthService` two-factor branches and the staff reset: all unit/HTTP (no database). `test/two-factor.e2e-spec.ts` runs against real Postgres and Redis (ciphertext and hashes in raw SQL, the backup-code race, the real lock TTL, the peer reset and the recovery SQL from `docs/admin-two-factor-recovery.md`).
