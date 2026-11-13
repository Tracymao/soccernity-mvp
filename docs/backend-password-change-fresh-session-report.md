# B-310: a password change keeps the caller signed in

Branch `backend/b310-password-change-fresh-session`, 2026-11-13. Decision Log #500 (B-305 follow-up). Written by `backend-api`,
including the `apps/web` and `apps/admin` client changes the new response shape needs.

## The problem

Since B-305, `AuthService.changePassword` and `AdminAuthService.changePassword` revoke **every** session of the account and
answered `204` with no body. That killed the caller's own session too, although the web page says "You stay logged in on this
device." Founder decision: fix the code, not the copy.

## What changed

### Part A: the fix

**User API** (`services/api/src/modules/auth/`)
- `POST /auth/change-password` now answers **`200`** with the `TokenPairResponse` shape (no user summary).
- Order in `AuthService.changePassword`: verify the current password, read whether the caller's refresh token is persistent,
  save the new password hash, **await** `revokeAllSessionsForUser`, then `issueTokenPair`. Awaiting the revoke first makes the
  new token's `iat` fall at or after the marker second; the B-305 rule "`iat === marker` is accepted" is unchanged, so the fresh
  access token passes immediately.
- "Stay signed in" is kept. New read-only `RefreshTokenStore.peekPersistent(rawToken, userId)` (and
  `TokenService.isRefreshTokenPersistent`) reads the caller's current refresh record **without consuming or rewriting it**, before
  the revoke deletes it. It checks the record belongs to the same user, so another account's cookie is ignored. Cookie mode
  reads `sn_rt`; with no cookie, or in body mode (the DTO has no refresh token), the new session is not persistent.
- Cookie mode: the controller calls `assertAllowedCookieOrigin` and `applyCookieSession`, so a fresh `sn_rt` replaces the revoked
  one with the same lifetime kind.
- The guardian notice and "password changed" email remain non-blocking background work.

**Admin API** (`services/api/src/modules/admin/`): the same, with `sn_admin_rt`, `AdminRefreshTokenStore.peekPersistent`,
`adminTokenService.issueTokenPair`, and a pair with no admin summary. **Exception (decided):** if
`twoFactor.isAdminEnforced()` and the admin has no `totpEnabledAt`, the password is saved, every session is revoked, nothing
is issued and the answer is `204` with no body (and the cookie is cleared in cookie mode). Otherwise the password change would
be a way round the two-factor enrolment gate.

**Clients**
- `apps/web`: `changePassword()` (`api/auth.ts`) sends the cookie-mode headers and `credentials: "include"`, and returns
  `{ accessToken } | null`. `ChangePasswordPage.tsx` and `EditProfileModal.tsx` call `replaceAccessToken(fresh.accessToken)`, or
  `clearStoredSession()` if the answer carried no token.
- `apps/admin`: `changeAdminPassword()` (`api/adminAuth.ts`) does the same; `adminFetch` gained an optional `credentials`
  option so this one call can send the cookie. `AdminProfilePage.tsx` calls `replaceAdminAccessToken(...)` on a pair, and on
  `204` calls `clearAdminSession("two-factor-enrolment-required")`, which reuses the existing sign-in notice ("two-factor is now
  required"). **No new customer-facing wording.**

**Where the session is stored, and why.** The API-layer functions only talk to the API and return the access token; the three
calling pages store it. That matches `login()`, and no other API-layer code in either app writes the session. The access token
lives in memory (`lib/session.ts`, `lib/adminSession.ts`, B-246 / B-247); the refresh token is the httpOnly cookie the API sets,
so the client never touches it.

### Part B: test-only, separate commits (nothing under `apps/` or `services/` changes)

| Item | File | Change |
|---|---|---|
| B1 | `37-b059-change-password-page.spec.ts` | Not edited. The spec now passes against the fixed API (the page's promise is true); see "Verification". |
| B2 | `10-screenshots.spec.ts` | Added the missing `db` import. |
| B3 | `23-user-two-factor.spec.ts` | Selector now matches "Use a backup code instead" (4 places). |
| B4 | `40-b060-data-export.spec.ts` | Asserts the live Public profile switch (enabled, `aria-checked=true`) instead of the old disabled image. |
| B5 | `41-b061-privacy-leaves.spec.ts` | Asserts the live Read receipts switch the same way. |
| B6 | `26-b114-admin-search.spec.ts` | Heading locator is `exact: true` (a **flagged addition**, own commit). |
| B7 | `support/api-process.ts`, `support/helpers.ts` | `spawnApi` is `detached` + `windowsHide` + `unref()`, pid file still written. Admin-login limit: see below. |
| B8 | `e2e/README.md` | Documents `node node_modules/ffmpeg-static/install.js` after `npm ci --ignore-scripts`. |

**Admin-login limit (B7), which way it was handled.** The limit (5 per 15 minutes per IP, Decision Log #190) is a hard-coded
`@AuthRateLimit({ limit: 5, windowMs: 15 min })` in `admin-auth.controller.ts`, **not** an environment variable, so the QA stack
cannot relax it without an app change. I therefore did the second option: `adminToken()` caches one real login per
(email, password) for 10 minutes, with `{ fresh: true }` to force a real one. Limit of this fix: it only helps repeated calls for
the **same** admin; distinct admins still cost one login each. A follow-up making the limit env-configurable would be cleaner.

### Tests added or changed

- API unit: `auth.service.spec`, `admin-auth.service.spec`, both controller HTTP specs, `account-emails.send-points.spec`.
- API e2e: `session-revocation.e2e-spec.ts` extended (fresh session works, old access token dead, fresh refresh rotates, a second
  session and the old refresh token are dead, wrong password changes nothing, admin equivalents, the `ADMIN_2FA_ENFORCED`
  `204` branch and the same change with two-factor on). `.expect(204)` became `.expect(200)` in `account-lifecycle`,
  `admin-auth-isolation`, `guardian-notice-withhold`, `guardian-security-notices` and `transactional-emails`.
- Web: `ChangePasswordPage.test.tsx`, `api/auth.cookieMode.test.ts`. Admin: `api/adminAuth.test.ts`, `AdminProfilePage.test.tsx`.
- Playwright: new `e2e/tests/61-b310-password-change-keeps-session.spec.ts`.

## Decisions to know about

1. Non-cookie (body) mode cannot learn persistence, because the DTO has no refresh token; the new session is non-persistent
   there. That only affects a cookie's lifetime, which does not exist in body mode.
2. A refresh cookie that belongs to a different user than the caller is ignored (not an error): the new session is simply not
   persistent.
3. The admin `204` branch is also reachable in cookie mode; the controller clears `sn_admin_rt` there so a dead cookie is not left.

## Verification results (measured)

| Check | Result |
|---|---|
| API unit: `src/modules/auth`, `admin`, `two-factor`, `write-route-guards` | 108 suites / 1,810 tests, 0 failures |
| API e2e (real Postgres + Redis, private database, `--runInBand`): `session-revocation` (extended, 11 tests), `account-lifecycle`, `admin-auth-isolation`, `guardian-notice-withhold`, `guardian-security-notices`, `transactional-emails`, `w3-gates`, `cookie-session` | 8 suites / 128 tests, 0 failures |
| `apps/web` vitest (full) | 153 files / 1,985 tests, 0 failures |
| `apps/admin` vitest (full) | 60 files / 949 tests: 948 pass; 1 failure in `contactEnquiries.test.tsx` (a focus assertion in the unrelated Escalate dialog), which passes alone 42/42, so a load flake already recorded for that file |
| Typecheck | `tsc --noEmit` clean for `services/api`, `apps/web`, `apps/admin`. `e2e/` has one pre-existing error in `34-b037-profile-image-review-admin.spec.ts:39` (a `Buffer` body); not touched |
| Lint | clean on the touched files of all three apps (one real error caught and fixed: `RequestCredentials` is not a known global to the admin lint config, so `adminClient.ts` now uses an explicit union) |
| Build | `nest build`, `apps/web` and `apps/admin` vite builds clean |
| `npm run check:pending-copy` | fails by design at **246** tagged places, allow-list empty; no tagged string added. (The before/after comparison was not run against a rebuilt `dist`, so the "246 before" rests on the brief's figure) |
| Playwright (real Chrome, real API, Postgres, Redis): specs 61 (new, 4 tests), 37, 10, 23, 40, 41-privacy, 26 | 42 passed, 0 failed, 4.7 min |

Spec 61 covers: web change keeps the device signed in after a reload with a **new persistent cookie**, the old cookie is dead, a
**second browser context** for the same account is signed out, the old password stops working and the new one works; a session
cookie stays a session cookie; a wrong current password changes nothing and the session survives; the Admin Console change keeps
the console session (session cookie kept), and both the old cookie and a second API session are dead. The `ADMIN_2FA_ENFORCED` `204`
branch is **not** in Playwright (it needs an API restart with a different environment); it is covered by the API unit and e2e tests.

My first spec-61 run failed two of its own tests, both bugs in the spec: a `getByLabel('New password', { exact: true })` that
missed because the admin label also carries its hint line, and a wrong-password test that asserted the refresh cookie did not rotate
(the 401 legitimately triggers one silent refresh). Both were fixed in the spec; the app was not changed for them.

## Not verified / suites not run

- The detached-process behaviour of `spawnApi` on Windows beyond these runs (an API left running after a crashed Playwright run, console
  window behaviour). Stop/start through the pid file worked in the runs above.
- The `ADMIN_2FA_ENFORCED` `204` path in a real browser.
- Not run: the full mocked and e2e API suites, the rest of the Playwright suite (the QA reviewer runs it at the launch gate), `apps/mobile`.
- The `ffmpeg-static` binary was already present in this worktree, so the new README step was not exercised from a clean install.

## Surprises and disclosures

- Two Jest e2e runs overlapped on the same private database (the first survived a context reset), which produced a deadlock and several
  false failures in `w3-gates` and `guardian-security-notices`. I stopped both, then re-ran once alone: all green. The one real find from
  that noise was two `.expect(204)` lines in `guardian-security-notices` that still needed to be `200`.
- A `git stash` / `pop` ran while an e2e batch was executing (for a pending-copy before/after count). The batch still passed, but
  that comparison was not clean (see above).
- Scratch Python patch scripts were written to the session scratchpad, not the repo. No stray edits outside the files listed.
