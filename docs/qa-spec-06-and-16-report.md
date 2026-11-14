# QA: spec 06 flake and spec 16 on a pinned clock

Branch `qa/spec-06-flake-and-spec-16-clock`, from `origin/main` `da5b932`. Test-only: no application code, schema, Figma or
Build Plan changes. Follows `docs/qa-launch-gate-full-run-report.md` sections 4 and 5, which left two things open.

Harness: real Chrome, real API, Postgres and Redis, scratch database `soccernity_qa` and Redis DB 5. Ports 3100, 5273, 5274, 3191
and 3192 were free at the start and before every run; no open PR touched `e2e/`.

## 1. Spec 06, line 125 ("I've verified - continue")

**Measured before the fix** (`npx playwright test 06-login-routing.spec.ts -g "I've verified" --repeat-each=40 --workers=1`):
**35 passed, 5 failed** (repeats 1, 11, 16, 28, 31 of 40). Every failure was the same: `locator.click: Test timeout of 90000ms
exceeded` while "waiting for getByRole('link', { name: /I.ve verified/ })". The failure screenshots and error contexts of all
five show the page on `/` with the heading "Create your profile", i.e. the page had already moved on.

**Cause.** `VerifyEmailPromptPage` reads the account once on mount (`getUser`) and, by design, redirects an already-verified
account straight on (`alreadyVerified` -> `<Navigate to=/continue>`). The test waits only for the URL `/verify-email/prompt`,
which is true before that read has answered, then flips the account to verified through the API and clicks the link. When the
mount-time read lands after the flip the page redirects itself and the link the test wants no longer exists. The app behaves as
designed.

**Classification: spec defect** (a race between the test's API call and the page's own mount-time fetch).

**Fix** (`e2e/tests/06-login-routing.spec.ts`, one added web-first assertion, no sleep, no retry, no assertion removed): wait for
`We sent a verification link to <email>` (printed only after the page's read answered) before `verifyEmailViaApi`. The click and
the final `/create-profile` assertion are unchanged.

**After the fix:** the same repeat command: **40 passed, 0 failed**. The whole file, `npx playwright test 06-login-routing
--repeat-each=10 --workers=1`: **230 passed, 0 failed** (23 tests x 10).

## 2. Spec 16 on a pinned clock

`tests/16-fc8-final-week.spec.ts` now derives "now", the month key, the seeded dates (`revealed`, the cycle's start, rounds and
month end) and the skip decision from the API's pinned instant. New `pinnedClockInstant()` in `support/contest-clock.ts` is the
single resolver (QA_TEST_CLOCK_ISO, else QA_CONTEST_PHASE with QA_CONTEST_MONTH); `support/global-setup.ts` now calls it too, so
the API and the spec cannot disagree. With no pin the spec behaves as before (same skip message).

**Command** (documented in the spec header and in a new section at the end of `e2e/README.md`):

```
QA_TEST_CLOCK_ISO=2026-11-26T10:00:00Z QA_TEST_CLOCK_ADVANCE=1 npx playwright test 16-fc8-final-week
```

Use the file name: the filter is a substring match and plain `16` also runs `57-b304-users-list-block-and-under16.spec.ts`
(my first run did, 3 extra tests). Run the spec alone under a pin: the pin applies to the whole API process, and spec 17 skips
under a pin (`17-contest-phases-test-clock.spec.ts` lines 70 and 88).

**Results**

| Run | Result |
|---|---|
| Pinned 2026-11-26T10:00:00Z, advancing | **9 passed** (the 8 live tests + the leaderboard test) |
| Pinned, frozen (no QA_TEST_CLOCK_ADVANCE) | **9 passed** |
| Unpinned, today (14 Nov) | **8 skipped, 1 passed** - the same 8 as before (lines 178, 211, 233, 274, 285, 306, 320, 328) |
| Pinned 2026-11-10 (before day 25) | live tests skip with "The API clock is pinned to 2026-11-10T10:00:00.000Z, which is before day 25 ..." (message read from the JSON report) |

**Two findings on the way, both classified:**

1. **Spec defect (fixed).** The first pinned run failed `a tile opens the entry itself` (`expect(locator('video')).toHaveCount(1)`,
   received 0) and the 6 serial tests after it did not run. Since B-259 / B-260 the web draws a post's media only from its
   `PostMedia` rows ("nothing is read out of a URL", `PostMedia.tsx`), and the spec seeded posts with bare `mediaUrls` and no
   `PostMedia` row, so the entry page had no video. This is independent of the clock (the spec was date-gated, so it had not run
   since the change; it would have failed on any real day 25+). The seed now also creates an approved, published video
   `PostMedia` row per finalist, modelled on `41-b061-blurred-media.spec.ts`.
2. **Application inconsistency under the test clock (recorded, NOT fixed, no production effect).** The leaderboard test failed
   when I first moved its week to the pinned instant. `LeaderboardRollupService` and `LeaderboardHistoryRollupService` use
   `APP_CLOCK`, but `LeaderboardService.getLeaderboard` takes its default period from `getCurrentIsoWeekPeriod()` with no
   argument, i.e. the wall clock (`leaderboard.service.ts` line 35). Under a pin the rollup writes the pinned week and the read
   shows the real week. In production the two clocks are the same. The spec therefore keeps the REAL week for that test (as
   before), with a comment saying why. If the founder wants the leaderboard read to follow the test clock, that is a
   `services/api` change for another PR.

## What changed

`e2e/tests/06-login-routing.spec.ts`, `e2e/tests/16-fc8-final-week.spec.ts`, `e2e/support/contest-clock.ts` (new export),
`e2e/support/global-setup.ts` (uses it; the pin resolution order is unchanged), `e2e/README.md` (appended section). No change to
`api-process.ts` or `helpers.ts`, no retries, no weakened assertion, no other spec.

## Not run

The full suite, every other spec, the Jest/Vitest suites, CI. `tsc -p e2e`: 1 error before and after, in
`34-b037-profile-image-review-admin.spec.ts` (a Buffer typed as BodyInit), not touched here; `e2e` has no eslint config.
The pinned runs covered spec 16 only; a pin was never combined with another spec. The 06 repeats were on one machine, with the
real API clock, one worker.

## Setup note

A clean worktree needed `npm ci --ignore-scripts` at the root and in `e2e/`, `node node_modules/ffmpeg-static/install.js` in
`e2e/`, a copy of the root `.env` (gitignored) and `npm run prisma:generate` (global setup does not generate the client). The
spec runs rewrote five tracked screenshots under `docs/fc8-final-week-screens/`; they were restored with `git checkout`.
