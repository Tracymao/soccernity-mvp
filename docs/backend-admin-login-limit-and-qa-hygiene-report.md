# Admin login limit for QA, and QA harness hygiene

Branch `qa/admin-login-limit-and-hygiene`, cut from `origin/main`. Part A is `services/api` (plus `.env.example`,
`docs/deployment.md`); Part B is test and harness only (`e2e/`, nothing under `apps/` or `services/`). Founder decision
2026-11-14: make the admin login limit configurable for QA only; production is unchanged. CI cannot be read from this
session, so nothing here says anything about CI.

## Part A: the admin login limit

**What changed**

- New `ADMIN_LOGIN_RATE_LIMIT_MAX` (default 5) for `POST /admin/auth/login`. The window stays 15 minutes, still per IP,
  still its own counter (Decision Log #190). An unset, blank, non-numeric, zero or negative value gives 5, resolved the
  same way as the other auth limits (`positiveInt`, now exported from `auth-limits.config.ts`).
- **Throttler choice.** The limit is resolved **per request**, not at import time. The decorator `AuthRateLimit()` now
  accepts `limit: number | (() => number)` and the admin login passes a function. Reason: `ConfigModule.forRoot` loads the
  root `.env` into `process.env` when `app.module` is imported, which happens after the controller module is imported, so
  an import-time read would miss a value that only the `.env` file provides. A real-guard HTTP test proves the function
  form is honoured by `@nestjs/throttler` (unset: 6th request is 429; `3`: 4th is 429; invalid: 6th is 429; `1000000`:
  8 pass).
- `assertProductionEnv` refuses to boot when `NODE_ENV=production` and the variable is set to anything non-blank (like the
  QA test-clock variables). The message names the variable and says it is QA only.
- **Not in `render.yaml`.** Added to `NOT_IN_RENDER` in `env-completeness.spec.ts` (with a test that it is read in code,
  present in `.env.example` and absent from `render.yaml`). Documented in `.env.example` (commented) and in
  `docs/deployment.md` under "QA-only variables that must never be set on Render".
- `e2e/support/api-process.ts` sets `ADMIN_LOGIN_RATE_LIMIT_MAX: '1000000'`. `adminToken()` still caches one real login per
  run. `services/api/test/env.ts` was not changed.
- Existing tests that assert the limit: only `services/api/test/admin-login-rate-limit.e2e-spec.ts`. Its last test used
  to read a number from the route metadata; the metadata is now a function, so it calls it with the variable deleted
  (gives 5), restores the variable, and still checks the 15 minute window. The default behaviour (6th request is 429,
  independent of the user login counter) is unchanged and its other tests pass untouched.
- The two-factor code limit (`ADMIN_CODE_IP_LIMIT`) and the user-side limits were not changed.

**Verification (measured)**: `tsc --noEmit`, `eslint`, `nest build` clean. Unit: 12 suites / 220 tests, 0 failures (the
touched areas plus `env-completeness` and `validate-runtime-env`; new `admin-login-rate-limit.spec.ts`, new cases in
`validate-runtime-env.spec.ts` and `env-completeness.spec.ts`). Jest e2e on a private database
(`soccernity_test_qahyg`) and Redis DB 12, `admin-login-rate-limit` and `admin-auth-isolation`: 2 suites / 11 tests,
0 failures. Not run: the full mocked suite, the full Jest e2e suite.

## Part B: harness and spec repairs (test only)

| Item | Change |
|---|---|
| B1 | Spec 19 restarts the normal API (`restartApi({})`) in an `afterAll`, whatever the test does. Its header comment ("last spec on purpose") is corrected. The README had no matching sentence, so a sentence about the `afterAll` was added. |
| B2 | Spec 10, club picker: the held route handler is now followed by a promise that resolves after `route.continue()`; the spec awaits it after `release()` and only then calls `page.unroute`. What is screenshotted is unchanged. |
| B3 | Spec 37: it asserted the weekly empty-state card, which fails whenever earlier specs leave ranked users on the weekly board of the shared QA database. It now asserts what the test owns: Weekly is selected and its own all-time seeded rows are not on the weekly board (they were written to `all-time` only). The empty card itself is covered by the web unit tests. Screenshot names changed from `overall-empty-*` to `overall-weekly-*` (the page is no longer empty). Nobody else's data is deleted. |
| B4 | Spec 38: the API now answers 202 and writes the row and emails in the background (Decision Log #476), so every read of those rows waits with a bounded `expect.poll` (`waitForRows`, 15 s). The "send the link again" step waits for a new row id before it replaces the secret. **Negative assertions kept**: the taken-address test now first waits for the API log to show one more `Would send "email-change-unavailable"` (a quiet template, so it logs no recipient; the count is the only signal and is exact because the suite runs one worker and only this case sends that template), and only then asserts no row was written. The other `toHaveLength(0)` checks (wrong password, wrong code, restricted-pending minor) follow synchronous refusals (403 before any background work), so they need no wait. |
| B5 | `global-setup.ts` runs `npx prisma generate` in `services/api` first (idempotent). README notes it, and that a run rewrites about 290 tracked screenshots under `docs/` plus untracked ones. |
| B6 | `CLAUDE.md`: the vite path in the `fix/e2e-vite-per-app-and-spec-24` bullet had lost its backslashes (`\n`, `\v`, `\b` had become a newline, a vertical tab and a backspace). Restored to `node_modules\vite\bin\vite.js`. Its own commit; nothing else in that line changed. |

`npx tsc --noEmit -p e2e` shows one error in `tests/34-b037-profile-image-review-admin.spec.ts` (a `Buffer` as `BodyInit`);
it is not in a file touched here and was not changed.

## The one whole-suite run

`npm test` in `e2e/`, one run, no retries, no config change, on `soccernity_qa` / Redis DB 5, started 12:19, 38.6 minutes.
Ports 3100, 5273, 5274, 3191 and 3192 were free first and no node process was running.

**Result: 534 passed, 1 failed, 12 skipped, 1 did not run** (548 tests).

- **Skipped (12)**: spec 15 `/withdraw` "exactly 5 attempts" (needs a fresh API process, by design), spec 16 final week
  (8, date-gated, only runs from day 25 or on a pinned clock), spec 17 single-phase (2, need `QA_CONTEST_PHASE`),
  spec 24 enrolment-with-enforcement (1, needs `ADMIN_2FA_ENFORCED=true`).
- **Failed (1)**: `37-b058-admin-remove-account.spec.ts:120` "your own account: the dialog explains and the server is
  never called". The next test in the file (`:139`) did not run (serial block).
  - Alone, once: `npx playwright test 37-b058`: **4 passed, 0 failed** (including the one that did not run).
  - **Classification: spec defect, data dependent.** The click uses `getByRole('button', { name: 'OK' })`, a
    case-insensitive substring match. In the full run other admins named "Mira Okon" and "Amara Okafor" were in the
    shared database from earlier specs, so the buttons `Remove account: Mira Okon ...` also matched ("ok" in "Okon") and the
    strict-mode check failed. Alone, no such admins exist. Fix would be `exact: true` (spec 37-b058 line 132); not done here
    as instructed.
- **`admin login failed: 429`**: none, in the full run or the rerun. The earlier six 429 failures did not recur.
- **Two-factor code-limit refusals**: none.
- **Spec 19 restore**: specs 34 and 40 (which failed after spec 19 in the previous run) passed, as did 59 and 62.
- **Specs 10, 37 and 38**: passed in the full run.
- After the run: no node process left, `.run/api.pid` removed, ports free. Tracked screenshots under `docs/` were
  restored with `git checkout -- docs/` and the three new untracked ones deleted.

## Not verified / surprises

- CI cannot be read from here; the Playwright suite is not in CI.
- Spec 38's negative check depends on the API log format of quiet emails (`Would send "<template>" (recipient and
  content are not logged`). If that log line changes, the poll times out (it fails closed, not open).
- B3 changes what the test asserts about the weekly board; a reviewer may prefer a different independence strategy.
- `ffmpeg-static` needed `node node_modules/ffmpeg-static/install.js` by hand in this clone (README step), as documented.
- Nothing in `apps/`, `services/` (other than Part A) or the Build Plan docx, Log Book, `docs/build-register.md` or
  `docs/pending-copy-manifest.md` was changed.
