# QA second run - 2026-10-26

Branch `qa/second-run-2026-10-26`, cut from `origin/main` at `449cf2f` (Merge PR #459, Decision Log #416).
Read-only QA: **no product code, schema, Figma, legal copy or Decision Log docx was changed.** The only code added is one new
Playwright spec, `e2e/tests/15-second-run-new-work.spec.ts` (QA code, not product), plus its screenshots in
`docs/qa-second-run-screens/`.

## 1. Result in one paragraph

Every suite is green. **No release-blocking defect was found.** Five defects were found: two Medium (a Create Profile
input-wipe race, and an end-user error message that names `S3_*` environment variables), three Low (admin Contest create
form gives no reason why Create is disabled, plus two copy/visual nits). The rest of the new work behaved as the
decision records say. Coverage has honest gaps (section 5): the live Contest phases cannot be driven in a real browser on
the real clock, and no image can reach `approved` through the UI without an object store.

## 2. Exact counts

| Suite | Command | Result |
|---|---|---|
| API mocked (Jest) | `npx jest --maxWorkers=4` in `services/api` | **165 suites / 2,909 tests, 0 failures** (155.8 s) |
| API e2e (real Postgres) | `npm run test:e2e` (runs `--runInBand`) | **51 suites / 611 tests, 0 failures** (1,394.7 s) |
| `apps/web` vitest | `npx vitest run` | **85 files / 834 tests, 0 failures** |
| `apps/admin` vitest | `npx vitest run` | **20 files / 218 tests, 0 failures** |
| Playwright `e2e/` (real Chrome, real `apps/web`, `apps/admin`, `services/api`, Postgres, Redis) - **full suite, all 16 spec files** | `npx playwright test` | **221 tests: 220 passed, 1 skipped, 0 failed, 0 flaky** (6.4 min) |

Playwright breakdown: specs 00-14 = **192 tests** (the "180" in the brief is stale; FC7 recorded 192), new spec 15 = **29 tests**
(28 run, 1 skipped by design). The skipped test is the exact-throttle test, which needs a fresh API process (see D-note in
section 4); I ran it separately and it passed.

`tsc`, eslint and `npm run build` were not part of this task and were not run. The Postgres/Redis in use were the local
Docker `soccernity-postgres` / `soccernity-redis`; Playwright uses its own scratch database `soccernity_qa` and Redis DB 5.

### Failures and the run history (everything I saw, not only the last run)

| Run | Outcome | Cause |
|---|---|---|
| Full run 1 (specs 00-15, first draft of spec 15) | 204 passed, 3 failed, 8 skipped | (a) **spec 01 `Create Profile sets a username...` failed** - a real intermittent defect, see **D-18**; (b) two failures in my own new tests (a wrong assertion, `Registration status` is not the on-screen wording, and an over-broad regex that flagged the user-facing watch limit, which is meant to be user-facing). The serial Contest block skipped 7 further tests as a consequence. |
| Spec 01 alone, 4 times | 4 x 6 passed | Did not reproduce in isolation. |
| Spec 15 iterations | several | Test mistakes only (selectors, one `test.fail()` that unexpectedly passed because my matcher hit a label). Each is fixed in the committed file. |
| Full run 2 | 218 passed, 2 failed | Both my own new tests: the throttle bucket is shared with spec 14's earlier calls (same IP, same route, 15-minute window), and the D-20 probe sent an 8-byte stub PNG that is rejected before storage. Fixed. |
| **Full run 3 (final)** | **220 passed, 1 skipped, 0 failed** | - |

Spec 01 passed in runs 2 and 3, so D-18 occurred in 1 of 3 full runs.

**Known-defect tests that went red because their defect was fixed: none.** Every former `test.fail()` in specs 00-14
(D-01, D-02, D-06, D-07 and others) had already been converted to an ordinary regression test by earlier PRs; none remains.
The only expected-fail test now is the new D-18 pin, and it still fails as expected (the defect exists).

## 3. Coverage of the new work, as run

| Area asked for | How it was covered | Where |
|---|---|---|
| Create Profile and Edit Profile, avatar and cover states | Create Profile shows both controls and the automatic-check note; an upload ends in a visible error with Try again (never a stuck spinner); a wrong file type is refused before any upload; Edit Profile renders Under review, Approved (Replace/Remove, Keep from remove-confirm) and Rejected-with-reason for avatar and cover; another user never receives a pending/rejected image or reason | spec 15 (tests 1-6), spec 07 |
| Cover crop (too small, zoom) | choose -> crop at 796:192 with 1x-3x zoom -> only the cropped image is uploaded; under 796 px refused and Cancel leaves nothing; phone cover-fit preview; desktop preview shape | spec 14 |
| Block and Blocked users | block from the other-user profile (menu, confirmation, optional reason, Cancel does not block), "You blocked ..." state with no Follow/Message, Blocked users list with reason, confirmed Unblock to the empty state; server rules: identical 404 for a blocked viewer and a missing user, follow/DM both ways (403 for the blocker only, 404 for the blocked), follows removed and not restored on unblock, feed and search hidden both ways, Block allowed for a restricted-pending minor (authentication only), like/comment notifications hidden both ways and the unread count | spec 15 (tests 7-11) |
| Guardian withdrawal, all six states, token pre-fill, throttle | request, request sent (same answer for an unknown address), confirm pre-filled from the emailed link, success (spent link then refused), link invalid, too many attempts + Try again; inline 400s; **exact limit confirmed: 5 attempts answered, 6th and 7th are 429**, body `Too many attempts`, no `Retry-After` or `X-RateLimit-*` header | spec 14, spec 15 (throttle) |
| Notification Centre image-decision row | rejected avatar -> notification row opens Edit Profile; the same row serves a rejected cover; an unknown type renders a generic row | spec 14 |
| Contest pages | no cycle ("No contest right now"); no session shows a log-in prompt on `/contest`, `/contest/voting`, `/leaderboard?tab=contest` and calls nothing; next-month cycle created through the real admin API -> "Week 1 opens at 08:00", no Join button, admin-only settings (minimum tally, placement points, exposure settings) never in a user response; rules modal opens/closes with Escape and shows the placeholder; voting page and leaderboard Contest tab render without errors; Create Post offers no Contest tab; vote and final-entry endpoints refuse outside their windows | spec 15 (tests 12-19) |
| Rebuilt admin Contest screens | console, cycle detail, history, impressions, create form render for a real cycle with no page errors; the removed judging routes offer no judging control; the create form has no default minimum tally and Create is blocked when empty; API validation (missing tally, tolerance 51, daily cap 0, title 81 chars, watch limit 2 and 121) is 400; duplicate month refused; a user token cannot reach admin contest routes; the removed `rounds/1/results` route is 404 | spec 15 (tests 20-22) |
| Restricted Pending | screen shows "Browse and read", the registration status line, and no "browse and follow"; `POST /posts`, follow, `PATCH /users/:id`, `POST /community-groups` are all 403; the minor can open pages by URL read-only; after approval the gate is gone | spec 15, specs 02, 06, 09 |

Screenshots of every screen above are in `docs/qa-second-run-screens/` (24 images).

## 4. Defects

Severity: **High** = blocks launch or loses/exposes data; **Medium** = a real user can hit it and it costs them something;
**Low** = copy, visual or admin-only inconvenience. Nothing was fixed.

### D-18 - Create Profile wipes what the person has typed when its profile read returns - **Medium**
- **What:** `apps/web/src/pages/CreateProfilePage.tsx` (the `useEffect` around lines 70-100) fills every field from `GET /users/:id` when
  that response arrives (`setUsername(user.username ?? "")`, and the same for names, country, bio, preferred club, avatar and cover),
  unconditionally. Anything typed before the response lands is overwritten with the empty server values.
- **Impact:** a person on a slow connection (or a fast typist) loses their username and then gets "Username must be 3-30
  characters..." on Continue with a field that looks empty. Observed for real once in 3 full runs: spec 01
  `Create Profile sets a username and goes on to the club picker` timed out on `/signup/clubs`; the failure screenshot shows an empty
  Username field and that validation message. Passed 4 of 4 in isolation, and in the two later full runs.
- **Reproduction (deterministic):** log in as a verified adult with no username, hold the `GET /users/:id` response (the pin delays it with
  a route handler), type a username in the field, release the response: the field is empty again. Pinned by
  `D-18: text typed before the profile read returns is not wiped` (an expected-fail test, red the day it is fixed, then delete `test.fail()`).
- **Suggested direction (not done):** apply the fetched values only to fields the person has not touched.

### D-19 - Admin "Create a Contest": Create stays disabled and nothing says why; the hint omits a required field - **Low**
- **What:** the footer hint says Create "is blocked until the contest title, the minimum tally and every weekly watch limit are set".
  Filling exactly those leaves **Create contest** disabled, because every weekly **task** is also required (`errors.weeks[].task`).
  The per-field messages ("Write the week 1 task.") only render once `touched` is true, and `touched` is only set inside `submit()`,
  which cannot run while the button is disabled, so those messages never appear on Create.
- **Impact:** an admin cannot tell what is missing. (Edit mode is not affected: its button is not gated.)
- **Reproduction:** `/contest/cycles/new`, fill title, minimum tally and the three watch limits, leave the tasks empty: button disabled,
  no error text. Screenshot `docs/qa-second-run-screens/admin-contest-create-hint-only-fields.png`. Pinned by
  `D-19 (known defect)` (green while the defect exists, red when fixed).

### D-20 - The "no object store" error shown to people names the `S3_*` environment variables - **Medium (becomes irrelevant once storage is live)**
- **What:** with no object store configured, `POST /users/:id/avatar` (and cover) answers 503 with
  `Media storage is not configured yet - set S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY to a real provider before uploading.` The Create
  Profile and Edit Profile pages show the server message verbatim (screenshot `create-profile-avatar-after-upload.png`).
- **Impact:** internal configuration wording on an end-user screen. Only reachable while storage is unset, so it is a launch-gate
  fact as much as a defect: until Temi sets the R2 variables (build register B-207, Decision Log #307), no user can upload a picture.
  The page does degrade correctly (visible error, Try again, no stuck spinner).
- **Reproduction:** register and verify an adult, `POST /users/:id/avatar` with a real PNG: 503 with the message above. Pinned by
  `D-20 (known defect)`.

### D-21 - Edit Profile labels say "Add a ..." even when an image exists - **Low (copy)**
`Add a Cover Photo (Optional)` and `Add a Profile Picture (Optional)` stay as the section labels in the Approved, Under review and
Rejected states (screenshots `edit-profile-approved.png`, `edit-profile-rejected.png`). Not asserted by any test.

### D-22 - Admin create form: "Followers-excluded counting" label runs straight into its helper text - **Low (visual)**
No space between the switch label and the "Count only engagement from accounts that do not follow the finalist..." text (screenshot
`admin-contest-create-form.png`, Week 4 block). Not asserted.

### Observations that are not defects
- **`[COPY PENDING LEGAL REVIEW]` shows on user screens** (Block dialog, Blocked users page, Create Profile date-of-birth hint, Restricted
  Pending). This is by design while counsel has not reviewed the strings; `npm run check:pending-copy` fails by design and is the launch
  gate (B-124, B-090). Worth remembering because a person would see the tag if the site were published today.
- **Header avatar is an empty green circle** on every signed-in screen for an account with no approved picture (no initials). Seen on all
  signed-in screenshots; consistent with Decision Log #168 (no client-side identity source) but looks unfinished.
- **Harness note:** `E2E_KEEP_DB` is read as "set or not", so `E2E_KEEP_DB=0` keeps the database and global setup then fails on a
  duplicate admin email. Not a product issue. Also, a `test.fail()` test in the same file as a serial describe, or one whose matcher
  accidentally passes, shows up as "failed" (it is "expected to fail but passed"); I hit that once.

## 5. What was NOT covered, honestly

1. **The live Contest phases in a real browser.** A contest for the current month cannot be created (the month must not have started) and the
   calendar follows the real clock, so entries, voting, the vote toggle, forfeit pop-ups, week-4 upload, the live ranking and the crowned
   state were not driven in Chrome. They are covered by the API e2e (real Postgres, injectable clock) and by vitest only. Only the
   `upcoming` state and "no contest" were seen in the browser.
2. **Images reaching `approved` through the real path.** With no object store, no upload succeeds, and the admin reject/approve routes
   do not exist (B-036/B-037 not built). Under review / Approved / Rejected were rendered by writing the status to the database, exactly
   as spec 14 does, so the producer side (a moderator rejecting with a reason) is untested end to end. The notification row was created by
   a database insert for the same reason.
3. **Cover crop output file size / pixel size** (B-205) is undecided and was not checked.
4. **Mobile viewports** were not re-run beyond what specs 12 and 14 already cover.
5. **Stripe, Postmark, GeoLite2, R2** are not live; the harness pins them to inert values, so those paths fail closed as designed.
6. `tsc`, eslint and `build` were not run in this task.

## 6. How to re-run

```
cd services/api && npx jest --maxWorkers=4          # mocked
cd services/api && npm run test:e2e                 # real Postgres, ~23 min
cd apps/web && npx vitest run ; cd ../admin && npx vitest run
cd e2e && npx playwright test                       # full, ~7 min, needs docker compose up -d
cd e2e && QA_THROTTLE_EXACT=1 npx playwright test 15 -g "exactly 5"   # the exact throttle count, fresh API process
```

Run the API e2e and the Playwright suite one after the other, not together (they share the local Postgres and Redis containers).
The existing specs regenerate six PNGs under `docs/fc4-screens/` on every run; I reverted those so this PR contains only QA files.
