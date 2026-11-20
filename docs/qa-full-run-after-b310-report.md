# QA full Playwright run after B-310 (2026-11-14)

Reviewer: `qa-reviewer` (read-only on the product). Nothing in application code, specs, harness, register, Decision Log, Build Plan, Log Book or the pending-copy manifest was changed. This file and one CLAUDE.md status bullet are the only changes.

**This is a local run on Temi's Windows machine. I cannot read CI, and nothing below says anything about CI.**

## 1. Handshake and environment

- `git fetch origin` at the start. `origin/main` = **`7875a9fc8e1fba3bf7544a1c7e23015d5b779770`** ("Merge pull request #767 from Tracymao/docs/blur-and-race-closeout-2026-11-13"). Everything below ran on that commit. Checked with `git log`: #765 (B-310), #764 (blurred-media minimum size), #763 (vote-versus-removal race test), #766 and #767 (docs) are all in it.
- Windows 11 Home 10.0.26300, Node v24.16.0, Docker 29.9.2 (Postgres and Redis containers were already up, healthy, for 2 days; I did not stop, restart or remove anything in Docker), Google Chrome 157.0.8103.78, `@playwright/test` 1.64.1, one worker.
- Worktree: **`D:\Projects\soccernity-qa-fullrun`**, branch `qa/full-run-after-b310`, cut from `origin/main`. The brief named `D:\Projects\soccernity-qa-run`, but a worktree already exists at that path (older branch `qa/playwright-run-2026-11-12`), so I used a new path and did not touch it. The main checkout, its 3 local-only commits and 2 stashes were not touched.
- The root `.env` and `.env.test` were copied into the worktree (gitignored, not committed, no secret printed). The harness is hard-pinned to the scratch database `soccernity_qa` and Redis DB 5 (`e2e/support/stack.ts`); the `soccernity` dev database was never used.
- Ports 3100, 5273, 5274, 3191 and 3192 were free before the run and free after it.

## 2. Setup: what was and was not sufficient

| Step | Result |
| --- | --- |
| `npm ci` at the root | Worked (7 minutes; 1,441 packages). |
| `npm ci --ignore-scripts` in `e2e/` | Worked. |
| `node node_modules\ffmpeg-static\install.js` (the B8 README step) | **Sufficient.** `ffmpeg.exe` was fetched. First time this README step was run from a clean install: it works. |
| Prisma client | **NOT sufficient, a setup gap.** After the steps above the generated client is a stub (it has no `ProfileImageCheck`). Global setup (`e2e/support/global-setup.ts`) runs `prisma migrate deploy` and `new PrismaClient`, but never `prisma generate`, so a clean clone cannot start the stack. I ran `npm run prisma:generate` (generation only, into the worktree's own `node_modules`). `e2e/README.md` does not mention this. I did not run the suite without it, so I did not observe the failure itself; the stub is verified (355 `ProfileImageCheck` matches after generation, 0 before). |

## 3. The run

One invocation: `npm test` in `e2e/`, started 01:00:46, finished 01:39:15 (38.4 min), no retries, no config change.

**Totals (first, whole-suite run): 478 passed, 14 failed, 12 skipped, 41 did not run. 545 tests in 61 files.** Exit code 1.

- 12 skipped = 8 in spec 16 (date-gated: the live carousel only runs from day 25), 2 in spec 17 (single-phase tests need `QA_CONTEST_PHASE`), 1 in spec 15 (`/withdraw` throttle needs a fresh API process), 1 in spec 24 (enforcement-only).
- 41 did not run = serial-block skips: the tests that follow a failed test inside the same `describe.serial`. Exactly 41 = 5 (27) + 8 (30) + 7 (31) + 5 (34) + 3 (35) + 3 (37 b058) + 2 (38) + 6 (40) + 2 (45), every one in a file that also had a failed test. None is a "whole files never started" case.

### Per-spec table (first run, then solo rerun of every file that had a failure)

| Spec | Tests | Passed | Failed | Skipped or not run | Solo rerun of the file |
| --- | --- | --- | --- | --- | --- |
| 00 known-defects | 3 | 3 | 0 | 0 | not needed |
| 01 adult-signup | 6 | 6 | 0 | 0 | |
| 02 minor-signup-and-consent | 23 | 23 | 0 | 0 | |
| 03 age-gate-and-under-13 | 23 | 23 | 0 | 0 | |
| 04 guardian-decline-x3 | 15 | 15 | 0 | 0 | |
| 05 report-incorrect-details | 12 | 12 | 0 | 0 | |
| 06 login-routing | 23 | 23 | 0 | 0 | |
| 07 create-profile-username | 18 | 18 | 0 | 0 | |
| 08 admin-dob-correction-and-username-revoke | 24 | 24 | 0 | 0 | |
| 09 edge-cases | 26 | 26 | 0 | 0 | |
| **10 screenshots** | 7 | 5 | **2** | 0 | **2 failed again, 5 passed** |
| 11, 12, 13 | 2, 4, 1 | all | 0 | 0 | |
| 14 fc6 | 12 | 12 | 0 | 0 | |
| 15 second-run | 28 | 27 | 0 | 1 | |
| 16 fc8 final week | 9 | 1 | 0 | 8 | date-gated |
| 17 contest phases | 14 | 12 | 0 | 2 | |
| 18 fc10 media upload | 7 | 7 | 0 | 0 | |
| 19 d20 no object store | 1 | 1 | 0 | 0 | |
| 20, 21, 22, 23 (two-factor), 24 | 7, 6, 7, 5, 7 | all (24: 6) | 0 | 24: 1 | |
| 25, 26, 28, 29, 32 | | all | 0 | 0 | |
| **27 b114 search + audit log** | 6 | 0 | 1 | 5 | **6 passed** |
| **30 b139 username reviews admin** | 9 | 0 | 1 | 8 | **9 passed** |
| **31 b139 username review web** | 8 | 0 | 1 | 7 | **8 passed** |
| **34 b037 profile image review admin** | 7 | 1 | 1 | 5 | **7 passed** |
| **35 b057 admin add role** | 6 | 2 | 1 | 3 | **6 passed** |
| 36 (two files), 37 b059 change-password | | all | 0 | 0 | |
| **37 b053 leaderboard columns** | 1 | 0 | 1 | 0 | **1 passed** |
| **37 b058 admin remove account** | 4 | 0 | 1 | 3 | **4 passed** |
| **38 b059 email change** | 9 | 5 | 2 | 2 | **8 passed, 1 failed** (:264) |
| 39 | 8 | 8 | 0 | 0 | |
| **40 b060 data export** | 9 | 2 | 1 | 6 | **9 passed** |
| 41 blurred media, 41 privacy leaves | 11, 6 | all | 0 | 0 | |
| 42, 43 (two files), 44 | | all | 0 | 0 | |
| **45 b117 bants open forum** | 3 | 0 | 1 | 2 | **3 passed** |
| 46, 47 (two files), 48, 49, 50, 51 | | all | 0 | 0 | |
| 52, 53, 54, 55, 56, 57 | | all | 0 | 0 | |
| **58 b309 session revocation** | 3 | 2 | 1 | 0 | **3 passed** |
| 59, 60 | 7, 8 | all | 0 | 0 | |
| 61 b310 password change keeps session | 4 | 4 | 0 | 0 | |

Per-test result across the first run and the solo reruns: **530 of 545 passed at least once; 3 never passed (spec 10 twice, spec 38:264); 12 are skipped by design.** The brief expected one clean result; **the whole-suite command did not give one**: it failed 14 tests, of which 11 pass when their file runs alone on a fresh stack (section 4).

## 4. Every failure, with both outcomes and classification

Method: the first run's failure screenshots, error contexts and API log were copied out before anything was re-run (the next invocation overwrites `.run`). Then each failing file was re-run alone once, in its own `npx playwright test <file>` invocation (fresh API and scratch database each time).

| Test (first run) | Whole run | File alone | Classification and evidence |
| --- | --- | --- | --- |
| `10-screenshots:258` club picker **desktop** and **mobile** (2) | `route.continue: Route is already handled!` (a different error from the previous run's `db is not defined`; that one was repaired) | failed again, same error | **Spec defect (probable).** Spec lines 280 to 288: the handler waits on `gate` then calls `route.continue()`, but the spec calls `release()` and then `page.unroute(...)` without waiting for the held handler, so the handler resumes on a route that is already gone. Deterministic (4 of 4). I did not try a change to confirm it. |
| `27:172`, `30:141`, `31:79`, `35:92`, `58:121` (5) | `admin login failed: 429 ThrottlerException` at `helpers.ts:155` | all passed (6, 9, 8, 6, 3 tests) | **Environment / harness.** The admin login is limited to 5 per 15 minutes per IP and the counter lives in the API process. The last API restart before these was spec 19 at 01:23:27; the 429 failures are at 01:25:36, 01:26:14, 01:26:15, 01:27:04 and 01:37:28, all inside the 15 minutes after that restart (the one at 01:37:28 is 58's own, after a counter filled by specs 20 to 57; spec 59 restarts the API at 01:38). The B-310 harness cache is per (email, password), so it only helps repeats of the same admin; every new admin a spec creates is a real login. |
| `37-b058:44` | `expected 401, received 429` | passed (4 of 4) | **Environment / harness**, same cause: the spec logs in as the removed admin (line 86) and expects a 401; the limiter answers 429 first. |
| `34:134` profile picture, Approve | `getByAltText('The profile picture under review')` not found; the screenshot shows "The preview link isn't available right now. Reload this page to get a new one." | passed (7 of 7) | **Harness / spec order.** See the object-store finding below. The preview needs the object store. |
| `40:75` real export | "We couldn't prepare your file" (screenshot); API log: `Data export ... failed: ServiceUnavailableException` | passed (9 of 9) | **Harness / spec order**, same object-store cause (the export writes a file to private storage). |
| `37-b053:45` leaderboard columns | expects the weekly board's empty card "No ranked players here yet"; the screenshot shows the weekly board already holding two ranked users (`...lbfrac1`, `...lbfrac2`, 3,318 points each) | passed (1 of 1) | **Spec defect: depends on state.** The spec assumes an empty weekly board; earlier specs in the whole-suite run leave ranked users on it (and the board is rolled up every 15 minutes). Alone, on a fresh database, the board is empty. |
| `38:157` good change | `emailChangeRequest` rows: expected 1, received 0 | passed | **Spec defect (race), load-dependent.** See below. |
| `38:264` two-factor | same assertion | **failed again** (never passed) | **Spec defect (race), probable.** Since Decision Log #476 the request is answered 202 at once and the row and the email are written in a background step. The spec reads the database straight after the "Check your inbox" heading. Evidence: in the solo rerun the test ended at 01:51:17 and the API log shows the `email-change-verify` and `email-change-notice` lines for it at 01:51:16, i.e. the email was sent in the same second as the assertion. I did not prove the ordering by a controlled test. **Regression note:** the previous full run (`docs/qa-launch-gate-full-run-report.md`) had this file passing alone; it fails alone now. A faster or slower machine would change a race like this, but I cannot rule out a real change. |
| `45:63` open forum | `expect(mine).toBeTruthy()`: received `undefined` (the post found in `GET /banter-rooms/:id/posts` read as the creator) | passed (3 of 3) | **Unexplained.** The screenshot shows the post on the page with its text, so it was created; the creator's API read did not list it. It passed alone. I could not reproduce it and did not find the cause. Worth a developer's look if it recurs. |

### The object-store finding (explains 34 and 40, and probably nothing else)

`19-d20-no-object-store.spec.ts` restarts the API with `noObjectStore: true`. Its own header says it is "the LAST spec on purpose". It is not last any more: specs 20 to 61 run after it. Nothing restores the store until spec 59 restarts the API (01:38). So specs 20 to 58 ran against an API with no object store, and the two tests that need one (34 and 40) failed, while every other media test is in specs 18, 59 or 60, which run on a store. The same file's description in `e2e/README.md` also still says it must come last.

## 5. Cascade check (the main question)

- **No API-death cascade.** After the first failure of the run (spec 10 at 01:08) the stack kept going: 0 occurrences of `ECONNREFUSED`, `fetch failed`, `ERR_CONNECTION_REFUSED` or `socket hang up` in the run log; `.run/api.pid` existed through the run and the API log shows only deliberate restarts (specs 17 and 19, and 59/58). The previous run's cascade (API child process dying with the Playwright worker, one failure turning into dozens) did **not** recur. The B-310 harness change (detached, `windowsHide`, `unref`'d API) appears to work on this machine, with one caveat: the suite never recycled a worker after a failure that mattered here, because each of the 14 failures happened outside a spec that restarts the API, so I cannot say the new behaviour survives the exact case that broke before.
- **Other kinds of cascade did occur**, both in-suite: serial-block skips (41 tests, all inside files that already failed) and state leaking between specs (the missing object store, and the leaderboard rows).
- **Leftover processes:** after the run and global teardown, 0 `node.exe` processes (so none running `dist\main.js`), `.run/api.pid` was removed, and ports 3100, 5273, 5274, 3191, 3192 were free. Nothing had to be killed.

## 6. Admin-login 429

Yes, it occurred: **6 tests** failed on it in the whole run (5 with the literal `admin login failed: 429`, plus 37-b058 which saw a 429 instead of a 401). All pass alone. The cache in `adminToken` is per distinct admin per process and does not help a suite that creates many different admins between restarts. The limit is hard-coded in `admin-auth.controller.ts` and cannot be relaxed from the harness.

## 7. Comparison with the previous run and with the expectation

Expected (from the brief), result:

- specs 10, 23, 40, 41-privacy, 37, 26 and 61 pass: **23, 41-privacy, 37 (b059 change-password), 26 and 61 pass; 40 passes alone but its test 75 failed in the whole run (storage, section 4); 37 (b053 leaderboard and b058 remove account) failed in the whole run and passes alone; spec 10 still fails, now at a different line.** The previous report's reason for spec 10 (`db` not imported) is gone; a second defect sits behind it.
- `41-b061-blurred-media.spec.ts` "2. a blurred video keeps its length chip": **passes** (after #764). All 11 tests in that file pass.
- spec 16's 8 live tests skip: **yes, 8 skipped**.
- `06-login-routing.spec.ts:125` may still flake: **passed** (23 of 23).
- Previous run's 16 never-passed: 3 no longer fail at all (spec 23's three), 23's selector and 40:40 and 41-privacy:55 are fixed, the blurred-video test passes, spec 16's 8 still skip (by design), spec 10's 2 still fail (new error).
- **Tests that passed in the previous run and fail now:** 38:264 (also alone). In the whole-suite run only: 27, 30, 31, 34, 35, 37 b053, 37 b058, 38:157, 40:75, 45, 58, all of which pass alone.
- The total grew from 538 to 545 tests. Spec 61 accounts for 4; I did not map the other 3.

## 8. Pending-copy check

Built `apps/web` and `apps/admin`, then `npm run check:pending-copy`. It **failed, as designed**, with **"FAIL: 246 place(s) where [COPY PENDING LEGAL REVIEW] would ship to users"**: apps/web 145 and apps/admin 101, matching the repo's record exactly. `scripts/pending-copy/dist-allowlist.json` is `[]`.

## 9. What I could not verify

- CI (cannot read). Anything at the real domains or against real Render, Neon, Upstash, R2, Postmark, Stripe, Highlightly, Rekognition or push services (none exist or are configured).
- Spec 16's 8 live-carousel tests (date-gated: they run only from day 25 of the month).
- Spec 17's 2 single-phase tests, spec 15's `/withdraw` throttle test and spec 24's enforcement-only test (they need an environment variable or a fresh process; they were not run with those enabled in this run).
- Whether the spec 10 and spec 38:264 diagnoses are right (I read the code and logs, I did not change any spec to test them).
- Whether the new detached API behaviour survives a recycled worker after a failure inside spec 17, 19 or 59.
- The cause of 45:63.
- The two Vite warnings and the one ESLint process warning were not looked at in this run.

## 10. Surprising, and process disclosures

1. Spec 19 breaks every later media test in a whole-suite run (section 4), and its comment says otherwise.
2. A clean clone cannot run the suite without a manual `prisma generate`.
3. The suite rewrote **290 tracked screenshots under `docs/`** and created one untracked file (`docs/b059-email-screens/04-taken-address-same-screen-desktop.png`); I reverted all of them (`git checkout -- docs/`, file deleted) in my worktree before committing. The same thing happened in the previous run.
4. First-run evidence was copied to my session scratchpad (outside the repo, not committed) before the solo reruns, because each invocation clears `.run/artifacts`.
5. Stray tool calls: one PowerShell `Start-Process` call failed on a quoting slip (no effect); one `sleep` was blocked by the harness (no effect); one PowerShell `Select-Object` calculated-property call failed on bash quoting (no effect); one monitor was armed with a pattern that did not match the list reporter and expired silent (I then read the log directly). No file outside the report and CLAUDE.md was edited; the only other files touched are the worktree's gitignored copies of `.env` and `.env.test`, its generated Prisma client, and build output (`dist` folders), all ignored.
