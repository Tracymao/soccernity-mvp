# B-305: session-revocation marker (backend report)

Branch `backend/b305-session-revocation-marker`, cut from `origin/main` `b7fbede` (docs PR #754 for Decision Log #500 to #503 and register B-305 to B-309 was merged before the branch was cut). `services/api` plus docs only. No schema change, no migration, no new environment variable, no `apps/*`, no Figma, no `docs/build-register.md`, no `docs/pending-copy-manifest.md`, no `.docx`. The platform is not live.

## What changed

Before: `TokenService.revokeAllSessionsForUser` and `AdminTokenService.revokeAllSessionsForAdmin` deleted refresh tokens only. An access token already issued kept working for its whole lifetime (`JWT_ACCESS_TTL_SECONDS` / `ADMIN_JWT_ACCESS_TTL_SECONDS`, 900 s by default).

Now:

- **Marker.** After the refresh-token revocation, each method writes a Redis marker: `auth:revoked-at:user:<userId>` (user) and `admin:revoked-at:admin:<adminId>` (admin, never in the `auth:*` namespace). Value = the revocation time in whole seconds. TTL = the configured access-token lifetime plus 60 seconds (`SESSION_REVOCATION_MARKER_MARGIN_SECONDS`); the lifetime is read from config in each service's constructor, nothing is hard-coded. The marker methods live on the two refresh-token stores (`markSessionsRevoked`, `getSessionsRevokedAt`), so no constructor of `TokenService`/`AdminTokenService` changed.
- **Guards.** `TokenService.verifyActiveAccessToken` and `AdminTokenService.verifyActiveAccessToken` (new) verify exactly as before, then read the marker and refuse (same 401 text as an invalid token) when the token's standard `iat` is strictly less than the marker. `JwtAuthGuard`, `OptionalJwtAuthGuard` and `AdminJwtAuthGuard` call them; `canActivate` is now async. `OptionalJwtAuthGuard` treats a revoked token as it treats an invalid one (anonymous, 200). `verifyAccessToken` is unchanged and is still what the logout paths and the global rate-limit identity resolver use (the resolver was not touched; it reads only `sub`).
- **No claim added.** A test pins the token's keys: `sub`, `role`, `iat`, `exp` (admin: plus `aud`).
- **Shared helper** `src/session-revocation/session-revocation.ts`: TTL, whole-second clock, the comparison, marker parsing, and the failure report.

## Redis-down behaviour (fail open)

If the marker cannot be read, the guard accepts the token, logs one warning and reports to Sentry with tag `session_revocation=user` or `=admin`; at most one log line and one Sentry event a minute per scope (the limiters' pattern); it never throws (a throw inside the reporter is swallowed). Trade-off: while Redis is down, a revoked-but-unexpired access token works again until Redis returns or the token expires. Failing closed would sign everyone out on every Redis blip. If WRITING the marker fails, the error propagates to the caller (the refresh-token deletion in the line above it would have thrown on the same condition; a half-done revocation is not reported as done).

## The one-second edge (accepted, Decision Log #500)

`iat` and the marker are whole seconds. A token issued in the same second as a revocation, but just before it, has `iat === marker` and is NOT refused. A token issued at or after the revocation second is accepted. Only a token from an earlier second is refused. Tests that expect a 401 after a revocation wait for the next whole second after issuing the token. Documented in `src/modules/auth/README.md` and `src/modules/admin/README.md`.

## Every caller of the two revoke methods

| Caller | Same response gives a new token pair? | Result |
|---|---|---|
| `AccountSuspensionService.completeSuspension` (report path and user page) | No | The suspended user's tokens die at once. Intended. Reinstatement issues nothing; the person logs in again. |
| `AdminUsersService.updateUserStatus` immediate delete (before anonymisation) | No | Intended. |
| `AuthService.changePassword` | **No: `POST /auth/change-password` answers 204 with no body** | The access token used for the change is refused straight afterwards. See "Surprising" below. |
| `AuthService.deactivateAccount`, `startPendingDeletion` (also used by `deleteAccount`, `deleteInactiveAccount` and the guardian refusal path) | No | Intended (account closed). |
| `AuthService.logout` with all sessions | No | Intended: the caller's own token dies too. |
| `PasswordResetService.resetPassword` | No (unauthenticated; the person logs in with the new password) | Intended. |
| `EmailChangeService.confirm` | No (unauthenticated link) | Intended; log in again with the new address. |
| `TwoFactorRecoveryService.complete` | No | Intended. Revocation happens first, then the transaction; the person signs in later. |
| `AdminAuthService.changePassword` | **No: 204** | Same as the user side: the admin's own token for that call is refused afterwards. |
| `AdminAuthService.logout` all sessions | No | Intended. |
| `AdminAuthService.assertEnrolledWhenEnforced` | The rotated access token is discarded and never returned | Safe: the 401 is thrown right after the revocation. |
| `AdminStaffRolesService` deactivation ("remove account") | No | Intended: the removed admin's token dies at once. |
| `AdminStaffRolesService` two-factor reset | No | Intended. |

Nothing in this list is a client that legitimately receives a new pair in the same response, so no caller is locked out by its own revocation in a way that a new login does not fix. Note the brief's wording ("the pair returned by the change works") does not match the code: the change endpoints return no pair.

## Surprising (reported, nothing fixed outside scope)

1. **Password change now ends the current device's access token immediately.** Before, only the refresh token died, so the device kept working for up to 15 minutes and then fell back to login. Now the next call returns 401, the silent refresh finds a dead refresh token, and the client is signed out. `apps/web` `ChangePasswordPage` says "You stay logged in on this device" and `e2e/tests/37-b059-change-password-page.spec.ts` asserts "this device stays signed in". **Both are now wrong; I did not touch the web and did not run Playwright (so I can say the spec is expected to fail, not that it does).** Decision needed: have `POST /auth/change-password` (and the admin one) issue a new pair for the current device, or change the copy and the spec.
2. A Redis failure while writing the marker propagates after the refresh tokens were already deleted (the refresh tokens are gone, the access token is not yet refused). Rare, same Redis condition as the line above it.

## Tests and commands (run from `services/api`, private database `soccernity_test_b305`)

- `npx tsc --noEmit`: clean.
- New unit spec `src/session-revocation/session-revocation.spec.ts`: 22 tests. Marker key and value, TTL from config (default 900 gives 960 s; 120 gives 180 s; admin 300 gives 360 s), refuse before / accept at and after the marker second, the same-second edge, other users untouched, no claim added, Redis read failure accepts and reports once a minute, marker write failure propagates, user and admin markers independent, and the three guards on real HTTP routes (valid, revoked, Redis down) with real token services.
- Updated guard specs (`jwt-auth.guard`, `optional-jwt-auth.guard`, `admin-jwt-auth.guard`) and `feed.controller.http.spec.ts` for the async guards and the new method name.
- Unit run over every module that calls the revoke methods or uses the guards (`auth`, `admin`, `admin-users`, `admin-staff-roles`, `account-suspension`, `email-change`, `two-factor`, `feed`, `rate-limit`, `session-revocation`, `moderation`, `account-emails`, `write-route-guards`): **144 suites / 2,805 tests, 0 failures**.
- New e2e `test/session-revocation.e2e-spec.ts` (real Postgres and Redis): **5 tests, 0 failures**. Suspend through `PATCH /admin/users/:id` then the user's earlier token gets 401, reinstate, old token still 401, a new login works; password change then the old token 401, old password refused, new password logs in; deactivating an admin through `PATCH /admin/staff/:id/status` then that admin's token 401 while other admins' tokens work; the marker's real key, value and TTL in Redis (>900 s and at most 960 s) and no cross-namespace effect; a token issued after the revocation in the same second works.
- Existing e2e suites that exercise revocation callers, `--runInBand`: `auth`, `account-deactivation`, `account-lifecycle`, `admin-auth-isolation`, `admin-users`, `admin-staff-vetting`, `b291-suspension-on-report`, `cookie-session`, `email-change`, `two-factor-recovery`, `two-factor`, `guardian-decline-cap`, `guardian-consent-refusal`, `guardian-stale-decline`, `admin-login-rate-limit`, `account-deletion-sweep`, `moderation`, `profile-block`, `key-isolation`, `transactional-emails`, `w3-gates`: **21 suites / 325 tests, 0 failures**. No existing test needed an assertion change for behaviour (only the unit guard specs changed mechanically).

## NOT run

- The full mocked suite and the full e2e suite (the QA reviewer runs them at the launch gate); every other e2e file.
- Playwright (`e2e/`), including spec 37, which I expect to be affected (see above).
- `apps/web`, `apps/admin` suites (untouched).
- Before-figures on a clean `origin/main` were not measured, so the counts above are after-figures only.
- I cannot read CI from here.

## Docs updated

`src/modules/auth/README.md` (full description, edge, Redis-down, behaviour change), `src/modules/admin/README.md`, `test/README.md` (new e2e). The Redis keys are named in those READMEs, where the existing `auth:refresh:*` / `admin:refresh:*` keys are described. `docs/build-register.md`, the manifest and the `.docx` were not edited, as briefed; the B-305 status line and a Decision Log #500 "built" pointer are for the next docs PR.
