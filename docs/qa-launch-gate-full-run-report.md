# QA launch-gate full run (2026-11-13)

Reviewer: `qa-reviewer` (read-only). Nothing in application code, specs, config, fixtures, the register or the Build Plan docx was changed. This file and one CLAUDE.md status bullet are the only changes.

## 1. Handshake

- `git fetch origin` was run at the start and again at the end. `origin/main` is **`91ef45155ec6361408a80eaa501a6172cb6dc5a6`** ("Merge pull request #759 from Tracymao/docs/dpia-v08-incident-v06"). Everything below was run on that commit. Branch `qa/launch-gate-full-run` was cut from it.
- Merged on that commit (checked with `git log`): docs PR #754 (closing-batch decisions #500 to #503, register B-305 to B-309, Section 92), B-305 #755, B-306 #756, B-307 #758, B-308 #757, B-309 Playwright specs #760, DPIA v0.8 and incident plan v0.6 #759. All present.
- Baseline named correctly: the last full Playwright result on main is `docs/qa-b304-playwright-specs-report.md` (143 passed, 0 failed, 0 not run, 23 files, branch cut from `2ddb300`). That run is not comparable with this one: this run covers 66 files and 538 tests.
- Worktree and files created: `D:\Projects\soccernity-qa-launch` (own `git worktree`, own `npm ci`, plus `npm ci` in `e2e/`). The root `.env` and `.env.test` were **copied** into it from the main checkout. Both are gitignored and were not committed. I edited the worktree copy of `.env.test` so `DATABASE_URL`/`DIRECT_URL` point at `soccernity_test_qalg`, a scratch database. The developer database `soccernity` was never used. I created `soccernity_qa_prod` for step 5 and dropped it afterwards. `npm ci --ignore-scripts` skips the ffmpeg-static download, so I ran `node node_modules/ffmpeg-static/install.js` once in `e2e/` (an environment step in my clone, not a repo change).
- I cannot read CI from here. Nothing below says anything about CI.

## 2. Summary table

| Step | What | Result |
| --- | --- | --- |
| 1a | `npm run lint` (all workspaces) | clean, 0 errors, 0 warnings from rules. One ESLint process warning (`ESLintEnvWarning`: a `/* eslint-env */` comment, known) |
| 1b | `tsc --noEmit` services/api, apps/web, apps/admin | clean (no output). `packages/shared` has no `tsconfig.json` (`TS5057`), so nothing to compile; not an application error |
| 1c | build (`nest build`, two `vite build`) | built. Vite prints the known `configLoader: 'native'` advisory |
| 1d | `npm audit --omit=dev --audit-level=high` per gated workspace | apps/web 0, apps/admin 0, packages/shared 0, services/api 1 low (`deepmerge`, GHSA-gcqx-w48m-w2h4), below the gate |
| 1e | `npm run check:pending-copy` | **fails, by design**: 246 places (apps/web 145, apps/admin 101). Allow-list `scripts/pending-copy/dist-allowlist.json` is `[]` |
| 2 | Unit: services/api Jest | 323 suites passed, 1 skipped; 6,334 tests passed, 8 skipped, 0 failed (576 s) |
| 2 | Unit: apps/web Vitest | 153 files / 1,978 tests, 0 failed (see note) |
| 2 | Unit: apps/admin Vitest | 60 files / 944 tests, 0 failed (65 s) |
| 3 | API e2e Jest, whole suite | 102 suites / 1,690 tests passed, 0 failed (6,096 s). No `40P01` deadlock in the log |
| 4 | Playwright, whole `e2e/tests` | 538 tests in 66 files. 522 passed at least once, 16 never passed (see section 4) |
| 5 | Production-boot checks | all as documented (section 5) |

Note on web unit: the full run reported 150 files / 1,805 tests passed with 3 "Unhandled Error" worker-start timeouts under load. Those 3 files re-ran alone: 3 files / 173 tests passed. 150 + 3 = 153 files, 1,805 + 173 = 1,978 tests.

Durations for 1a to 1d were not recorded to the second.

## 3. Steps 1 to 3 in detail

Commands were the repo scripts: `npm run lint`; `npx tsc --noEmit` in each workspace; `npm run build`; `npm audit --omit=dev --workspace=<ws> --audit-level=high`; `npm run check:pending-copy`; `npx jest --maxWorkers=4` in `services/api`; `npx vitest run` in each app; `npm run test:e2e` in `services/api` (`--runInBand`, `.env.test`, scratch database `soccernity_test_qalg`, `E2E_LOG_CONNECTIONS=1`).

`check:pending-copy` fails as intended. The 246 places are the tagged strings that would ship in `apps/web/dist` (145) and `apps/admin/dist` (101). A few snippets come from the legal draft that `apps/web` imports raw (they quote the phrase "tagged `[COPY PENDING LEGAL REVIEW]`" in prose); I did not split them out. The allow-list is empty, as required.

## 4. Step 4: Playwright

### 4.1 Runs, and why there are several

The harness starts Postgres/Redis scratch state (`soccernity_qa`, Redis DB 5), the API on 3100, web on 5273, admin on 5274 and two fake media services (3191, 3192), then runs one worker, serial, no retries, 90 s per test.

| Run | Command | Passed | Failed | Skipped | Did not run | Time |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | whole directory | 275 | 50 | 11 | 202 | 25.7 min |
| 2 | specs 06, 10, 17 to 23, 24 to 45 (after I installed ffmpeg) | 89 | 47 | 2 | 194 | 19.0 min |
| 3 | specs 24 to 58 | 140 | 20 | 1 | 79 | 12.9 min |
| rerun | 16 files from run 3, each in its own invocation (fresh API each) | all passed except spec 26 (below) | | | | |
| rerun | spec 26 twice more | 6/6 and 6/6 | 0 | 0 | 0 | 1.0 min each |
| rerun | specs 59 and 60 | 15 | 0 | 0 | 0 | 2.4 min |
| targeted | specs 40, 41 (blurred), 41 (privacy), 23 with `-g` to bypass a failing first test | see 4.3 | | | | |
| enabling env | spec 17 with `QA_CONTEST_PHASE=week1_phase2`; spec 24 with `ADMIN_2FA_ENFORCED=true`; spec 15 `/withdraw` with `QA_THROTTLE_EXACT=1` | 2, 6, 1 | 0 | 12 (17 journey, pinned) / 1 (24, enforcement-only) | | |

The single full run did not complete cleanly, for harness reasons (4.2). To get a result for every test I re-ran the affected parts. **Per test: 522 of 538 passed at least once. 16 never passed (4.3).**

### 4.2 Why runs 1 to 3 showed so many failures and "did not run"

Two causes, both environment or harness, neither an application defect.

1. **Missing ffmpeg in my clone (run 1, spec 17 and 18).** `npm ci --ignore-scripts` did not fetch the ffmpeg-static binary, and spec 17 throws "ffmpeg-static is not installed in e2e/". That was my clone's setup. After I installed it, spec 17 passed.
2. **The API child process dies with its Playwright worker (cascade).** Specs 17, 19 and 59 call `restartApi`/`stopApi` (`e2e/support/api-process.ts`: `spawn('node', ['dist/main.js'], ...)`). After spec 17 the API is a child of the test worker. When any test fails, Playwright recycles the worker, which on Windows ends that child. Every test after the first post-17 failure then fails or does not run. This accounts for the large counts in runs 1 and 2 (50 failed / 202 not run; 47 failed / 194 not run). In run 3 I excluded 17 and 19 so the API belongs to global setup; the cascade did not recur, but 17 other failures remained: the next item.
3. **Admin login limit, 5 per 15 minutes per IP, kept in memory (Decision Log #190).** In run 3, **17 of the 20 failures** were `admin login failed: 429 ThrottlerException: Too Many Requests` at `e2e/support/helpers.ts:144` (`adminToken`). The files are 25, 26, 27, 28, 30, 31, 34, 35, 37 (b058), 43 (b056), 47, 50, 51 (two tests), 52, 56, 58. Without a restart between them the API process accumulates admin logins and refuses later ones. **Evidence it is not an application defect:** each of those 16 files, run alone on a fresh API, passed in full (counts in 4.1). Spec 26 failed once on a fresh API for a different reason (4.3) and then passed twice. A full single invocation that includes a restart (specs 17, 19, 59) would reset the counter at those points; run in order, it still passes 5 admin logins per 15 minutes only if fewer than 5 occur between restarts, which the current suite does not guarantee. Whether to raise the admin-login limit for the QA harness (in `api-process.ts`, like `AUTH_RATE_LIMIT_MAX`) is a harness decision for the founder or the dev session. I changed nothing.

### 4.3 Tests that never passed (16) and their classification

| Test | Result | Classification and evidence |
| --- | --- | --- |
| `10-screenshots.spec.ts:257` `w9 capture: club picker desktop` and `... mobile` (2) | fail, every run | **Spec defect.** `ReferenceError: db is not defined`. `seedClubs` (spec lines 217-219) calls `db().clubPage.deleteMany({})` but the import list (lines 4-19) lacks `db` (exported at `e2e/support/helpers.ts:105`). Introduced by commit `a60b5b4` (2026-11-05, W9 comparison pass). Not an application issue |
| `16-fc8-final-week.spec.ts:140, 173, 195, 236, 247, 268, 282, 290` (8) | skipped | **By design.** `test.skip(!IN_FINAL_WEEK, ...)` (line 83): the live carousel tests only run from day 25 to the month end; today is 13 November. Not run |
| `23-user-two-factor.spec.ts:160` and `:184` (2) | fail | **Spec drift.** The tests click `getByRole('button', { name: /can.t use your authenticator app\?/i })` (spec lines 163, 175, 188, 225). The prompt now reads "Use a backup code instead" (`apps/web/src/pages/twoFactor/TwoFactorCodePrompt.tsx:191`), renamed by commit `8e01cea` (B-278, 2026-11-02), after the spec's own commit `9948f66`. The application is behaving as built |
| `23-user-two-factor.spec.ts:221` (1) | did not run | Same stale selector (line 225), same serial block; not exercised |
| `40-b060-data-export.spec.ts:40` `Adult variant...` (1) | fail | **Spec drift.** Expects `img` "Public profile: On (not adjustable yet)". Public profile became a live switch (B-060 web leg, commit `164947f`) after the spec was written. The other 8 tests in the file pass when run past it (`-g`) |
| `41-b061-privacy-leaves.spec.ts:55` `Direct Messages: default...` (1) | fail | **Spec drift.** Expects `img` "read receipts: not adjustable yet" (spec line 61). Read receipts became a live switch in commit `5971614`. The other 4 tests pass when run past it |
| `41-b061-blurred-media.spec.ts:203` `2. a blurred video keeps its length chip...` (1) | fail, 3 of 3 runs | **Not resolved (application layout defect or environment; I could not decide).** Playwright reports `<span class="sensitive__duration">0:02</span> intercepts pointer events` and then `<article class="post"> intercepts pointer events` while clicking the "Sensitive video hidden. Tap to view." button until the 90 s timeout. The failure screenshot shows the blurred video cover collapsed to a narrow strip (about 40 px wide, text clipped to "ntent / ew"). The duration chip appears (`0:02`), so the video metadata loaded. The area (`SensitiveMedia.tsx/.css`) was last changed by commit `7436aec`, the same commit that introduced the spec, so there is no earlier commit to compare against. The other 5 tests in the file pass when run past it |

Flaky, not defects:

- **`26-b114-admin-search.spec.ts:48`**: failed once on a fresh API (strict-mode violation: `getByRole('heading', { name: 'Search' })` matched both the page title "Search" and the "What you can search" intro heading, which renders while the view is briefly `idle` after the URL changes), then passed on two further runs. The intro has been in `SearchPage.tsx` since its first commit `f2887b8`. Race in the spec's non-exact locator.
- **`06-login-routing.spec.ts:125`** ("I've verified, continue"): failed in run 1, passed in run 2. I could not find the cause (the run-1 artifacts were overwritten) and did not re-run it enough to measure a rate. Unexplained.

### 4.4 What did not run, and why

- 8 live-carousel tests in spec 16 (date-gated, above).
- 12 journey tests in spec 17 were skipped in the single-phase run (`QA_CONTEST_PHASE` pins the clock); the same tests passed in the full runs. With `QA_CONTEST_PHASE=week1_phase2` the 2 single-phase tests passed.
- `23-user-two-factor.spec.ts:221` was not run (4.3).
- Spec 24's enrolment test is enforcement-only; it passed with `ADMIN_2FA_ENFORCED=true`.
- Spec 15's `/withdraw` throttle test needs a fresh API process; it passed with `QA_THROTTLE_EXACT=1`.

Artifacts: Playwright clears `e2e/.run/artifacts` at the start of every invocation, so the failure screenshots, traces and error contexts of the earlier runs are no longer on disk. The log files of every run are in my session scratchpad (outside the repo, not committed). The quoted lines above are from them.

## 5. Step 5: production-boot checks (no UI)

Run against the built `services/api/dist` with `NODE_ENV=production`, port 3300, scratch database `soccernity_qa_prod` (migrated with `prisma migrate deploy`) and Redis DB 6. I moved the worktree `.env` aside during this step (and put it back) because the API loads the root `.env` before the boot check and it would mask an unset value. Secrets were generated on the spot; origins were `https://app.example-qa.com` and `https://admin.example-qa.com`.

- **Uploads switch.** With `MEDIA_UPLOADS_ENABLED` unset, `/health` was ok and the log contained: `MediaUploadsSwitchService ... MEDIA_UPLOADS_ENABLED is off: user image and video uploads (post media, avatar, cover) answer 403 media_uploads_disabled. In production it must be exactly "true" ...`. A registered adult's `POST /media/uploads` and `POST /users/me/avatar` both returned `403 {"statusCode":403,"error":"Forbidden","code":"media_uploads_disabled","message":"Uploads are not available right now."}`. With `MEDIA_UPLOADS_ENABLED=TRUE` (wrong case) the warning was still logged (only exact `"true"` turns it on).
- **`assertProductionEnv` refusals** (each: exit 1 with the stated message, no boot): `JWT_SECRET` unset; `JWT_SECRET=replace-me`; `ADMIN_JWT_SECRET` unset; both secrets equal ("must differ from JWT_SECRET"); `WEB_APP_BASE_URL` unset; `WEB_APP_BASE_URL` plain http; `ADMIN_APP_BASE_URL` on localhost; `DOB_ENCRYPTION_KEY` unset; `DOB_ENCRYPTION_KEY=replace-me`; a 31-byte key; `DOB_ENCRYPTION_KEY_PREVIOUS` set while the version is 1 or unset; `TEST_CLOCK_ISO` set ("the QA test clock is configured in production"). My first guess at the test-clock variable name (`APP_CLOCK_ISO`) was wrong, which is why that attempt booted; the real name is `TEST_CLOCK_ISO` and it is refused.

## 6. Surprises and things to know

1. Whole-suite Playwright runs are not reliable on Windows because the API started by `restartApi` is a child of the worker, and a recycled worker kills it (4.2). This is the main reason one command did not give one clean result.
2. The admin-login limit (5 per 15 minutes) is in memory and the QA harness does not relax it (`api-process.ts` relaxes only `AUTH_RATE_LIMIT_MAX`).
3. Three specs are behind the application (23, 40, 41 privacy) and one is broken by a missing import (10).
4. The blurred-video click failure (4.3) is the one finding I could not classify. It is worth a developer's look.
5. The suite rewrites many tracked screenshots under `docs/` (reverted with `git checkout -- docs/`) and wrote one new untracked file, `docs/b059-email-screens/04-taken-address-same-screen-desktop.png` (deleted, not committed).
6. ffmpeg-static needs `node node_modules/ffmpeg-static/install.js` after `npm ci --ignore-scripts`; the e2e README does not say so.

## 7. Not run

CI (cannot read). Spec 16's eight live tests (date-gated). `23-user-two-factor.spec.ts:221`. A measured flake rate for spec 06. Any check at the real domains or against real Render, Neon, Upstash, R2, Postmark, Stripe or Highlightly (none exist). No real-browser manual look beyond the Playwright runs in real Chrome.
