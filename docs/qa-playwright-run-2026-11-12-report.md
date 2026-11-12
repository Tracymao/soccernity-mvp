# QA Playwright run, 2026-11-12

Written for: Temi (founder) and the next dev/QA session. A read-only QA report. No application code, spec, config or fixture was changed.

## 1. Summary

I ran 17 existing Playwright spec files (115 tests) against `origin/main` after PRs #722 to #750. **97 passed, 4 failed, 14 did not run.**

- **The 4 failures are all out-of-date specs, not application defects.** They fail the same way on a second run (so they are not flaky).
- **Two of the failing specs (20 and 27) stop at their own set-up step, so 11 tests behind them never ran.** That includes the held-investigations/hold-route screens (the area PR #749 changed) and the Audit log screen tests (the area PR #748 changed). **Those screens are not verified end to end by this run.** The fix for each is small (see section 5), but I was told not to edit specs, so I did not.
- **The baseline you named, `024c105`, is not "before this batch".** It is the merge of PR #738, and it already contains PRs #722 to #740 (including the suspension work #740 and the Contact Us category #739). Only #741 to #750 come after it, and of those only #742, #746, #748 and #749 contain code. To classify properly I also ran the commit before the whole batch (`448c295`, parent of #722).
- **Coverage gaps: your expectation is confirmed in full** (section 6). None of the new suspension, appeal, hidden-context, hold-vetting or Contact Us seventh-option behaviour has any Playwright test. I also found two more untested items.

## 2. What was tested

| | |
|---|---|
| Commit tested | `da59722` (PR #750 merge, docs only). Its code is identical to `6cc1522` (the merge of #748); `git diff 6cc1522 HEAD` outside `docs/` and `CLAUDE.md` is empty. |
| Worktree | fresh `git worktree` of `origin/main`, own `npm ci --ignore-scripts` (1,441 packages), `npm install` in `e2e/`, `npm run prisma:generate`. The shared checkout was not used or touched. |
| Machine | Windows 11 Home 10.0.26300, Node v24.16.0, npm 11.16.0 |
| Browser | Google Chrome 157.0.8103.40 (real Chrome, `channel: 'chrome'`), Playwright 1.64.1 |
| Stack | Docker Postgres and Redis (both healthy, up 37 h before the run); API, `apps/web` and `apps/admin` started by `e2e/support/global-setup.ts` |
| Databases | scratch database `soccernity_qa` (dropped and recreated by global setup) and Redis logical DB 5. The developer's `soccernity` database was not touched. |
| Ports | 3100, 5273, 5274, 3191, 3192 were free before every run (checked with `netstat`). |
| Workers | 1, serial, `retries: 0` (as configured) |

Command (run 1, from `e2e/`):

```
npx playwright test tests/05- tests/08- tests/11- tests/13- tests/20- tests/21- tests/22- tests/25- tests/26- tests/27- tests/28- tests/29- tests/34- tests/47- tests/50- tests/51-
```

`tests/47-` matches both spec files numbered 47, which is why there are 17 files. Run 1 took 411.5 s (6.9 min).

### Which specs, and why

Your ten: 20, 21, 22, 27, 28, 29, both 47s, 50, 51.

Added after reading `e2e/tests` (each opens a screen the merged PRs changed):

| Spec | Why added |
|---|---|
| 08, 11, 13, 25 | open the admin Users list or User detail (changed by #740: Suspend row, Account card rows; #739/#740 admin changes) |
| 05 | opens the Users list to reach the incorrect-details reports link |
| 26 | admin search bar, Users list, Contact enquiries category labels (#739) |
| 34 | opens the Audit log screen (`/activity`) (labels changed by #748) |

Considered and not added: 30 (username reviews: its `username_review_decided` hits are database assertions, not the Audit log label), 15, 18, 35, 37-b058 (no changed screen). Not run on purpose: spec 17 (ten-minute contest month), the other specs, the full suite.

## 3. Results, spec by spec (run 1)

| Spec | Passed | Failed | Not run | Total |
|---|---|---|---|---|
| 05-report-incorrect-details | 12 | 0 | 0 | 12 |
| 08-admin-dob-correction-and-username-revoke | 24 | 0 | 0 | 24 |
| 11-admin-fc3b-screens | 2 | 0 | 0 | 2 |
| 13-fc4-admin-screens | 1 | 0 | 0 | 1 |
| **20-held-investigations-holds** | 0 | 1 | 6 | 7 |
| 21-contact-us-page | 6 | 0 | 0 | 6 |
| 22-contact-enquiries-escalate | 7 | 0 | 0 | 7 |
| 25-b282-guardian-notices | 4 | 0 | 0 | 4 |
| 26-b114-admin-search | 6 | 0 | 0 | 6 |
| **27-b114-search-everywhere-audit-log** | 0 | 1 | 5 | 6 |
| 28-b284-admin-report-categories | 4 | 0 | 0 | 4 |
| 29-b284-web-report-categories | 5 | 0 | 0 | 5 |
| 34-b037-profile-image-review-admin | 7 | 0 | 0 | 7 |
| **47-b284-admin-message-report** | 4 | 1 | 0 | 5 |
| 47-b284-message-report-web | 5 | 0 | 0 | 5 |
| 50-b286-message-report-context | 6 | 0 | 0 | 6 |
| **51-b289-content-removal-web** | 4 | 1 | 3 | 8 |
| **Total** | **97** | **4** | **14** | **115** |

"Not run" means Playwright skipped the test because an earlier test in the same serial describe failed. Raw results: `e2e/.run/results-run1.json` (local, gitignored); a copy of the run-1 JSON is in the session scratchpad.

## 4. The four failures

Artifacts are in the QA worktree `D:\Projects\soccernity-qa-run\e2e\.run\artifacts\` (gitignored, local only). Run 2 overwrote that directory; the run-1 copy is in `.run\run1-artifacts\`. Failure screenshots exist only where Playwright took one (the browser test below).

Classification used two baselines, because `024c105` already contains most of the batch:

| | Current main (`da59722`) | `024c105` (PR #738) | `448c295` (before #722) |
|---|---|---|---|
| 20 set-up | fails | fails | **fails** |
| 27 first test | fails | fails | **fails** |
| 47-admin "gone message" | fails | fails | **passes** |
| 51 stub keys | fails | fails | **passes** |

Run 2 (the four failing files again, same commit): the same 4 failed and the same 14 did not run, so none is flaky. Both baseline runs: 20 and 27 fail identically; at `448c295` the 47 and 51 tests pass.

### F1. `20-held-investigations-holds.spec.ts:63` "set-up: two reports, and the account each hold will keep is past its grace period"

- Assertion: `report failed 400 {"message":["reasonCategory must be one of the following values: harassment_or_bullying, hate_or_abusive_language, ..., other"],"error":"Bad Request","statusCode":400}` at `20-held-investigations-holds.spec.ts:37` (`reportAgainst`, called from the set-up test, which POSTs `/reports` with `targetType`, `targetId`, `reason` and no `reasonCategory`).
- Artifacts: `.run\artifacts\20-held-investigations-hol-fd8bf-ep-is-past-its-grace-period\` (trace, error-context).
- Cause: `reasonCategory` became required on both report routes with B-284 (PR #612, merged 2026-11-03). The spec was never updated. The set-up is serial, so the other 6 tests in the file never run.
- **Classification: PRE-EXISTING.** Fails at `448c295` too. Not caused by anything in #722 to #750. It has been red for about nine days. The B-284 frontend bullet in `CLAUDE.md` had already noted that specs posting reports without `reasonCategory` would get a 400.
- Consequence: the 6 skipped tests are the hold place/lift tests on Report Detail and the Held investigations list. They are the only end-to-end cover for the screens PR #749 gates.

### F2. `27-b114-search-everywhere-audit-log.spec.ts:172` "the working search bar is on every admin screen, including ones that used to hide it"

- Assertion: `POST /reports failed 400 {"message":["reasonCategory must be one of the following values: ..."]}` at line 91, inside the file's `beforeAll` hook, which seeds a report with a bare body (Playwright reports a hook failure against the first test and skips the rest).
- Artifacts: `.run\artifacts\27-b114-search-everywhere--0953e-g-ones-that-used-to-hide-it\`.
- Cause: same as F1 (missing `reasonCategory`).
- **Classification: PRE-EXISTING.** Fails at `448c295` too.
- Consequence: the 5 tests behind it never run, including **"Audit log (superadmin) ..."**, **"Audit log: a failed load shows the error and Retry recovers"** and the **"My activity"** variants. These are the dedicated Audit log tests. (Spec 34 does open `/activity` for its profile-picture rows and passed, so the Audit log screen was exercised by that one test only. Neither spec 27 nor 34 asserts the two labels PR #748 added; see section 6.)

### F3. `47-b284-admin-message-report.spec.ts:159` "a message that is gone says so and the rest of the report still shows and can be dismissed"

- Assertion: `expect(page).toHaveURL("http://localhost:5274/moderation")` failed; received `.../moderation/reports/f4a15922-...` after 15 s (`47-b284-admin-message-report.spec.ts:168`, after clicking Dismiss Report).
- Artifacts: `.run\artifacts\47-b284-admin-message-repo-7747d--shows-and-can-be-dismissed\` (screenshot `test-failed-1.png`, trace, error-context).
- What the page showed (from error-context): "The reported message is no longer available.", "Context hidden: this involves a child. [COPY PENDING LEGAL REVIEW]", and a **"Restricted — child-safety vetting required"** panel ("The server rejected it — nothing was changed").
- Cause: the test deletes the `Message` row (`db().message.delete`), then dismisses the report as the QA superadmin, who is not child-safety vetted. Since PR #730 (B-297, `assertVettedToActOn`) a missing message row counts as "a child may be involved" (fail closed), so an unvetted admin is refused. The "Context hidden" line comes from PR #721 (B-293), which uses the same fail-closed reading.
- **Classification: CAUSED BY THE MERGED CHANGES (PR #730, with #721).** Passes at `448c295`, fails at `024c105`. The behaviour is the documented design, not a defect: the spec predates it. Product note: a report whose message has vanished can only be closed by a vetted admin. The spec's own comment says "nothing does this in the product".

### F4. `51-b289-content-removal-web.spec.ts:99` "the API answers both people with the stub and nothing else"

- Assertion: `expect(Object.keys(stubs[0]).sort()).toEqual(['id','removedByModeration','sentAt'])`; received keys also contain `"isMine"` (line 105).
- Artifacts: `.run\artifacts\51-b289-content-removal-we-e38f9-h-the-stub-and-nothing-else\`.
- Cause: the removed-message stub now also carries `isMine` (PR #724, B-296, Decision Log #489, commit `73800aa`). The spec pins the exact key list. The Jest e2e file `test/content-removal.e2e-spec.ts` was updated in that PR; this Playwright spec was missed.
- **Classification: CAUSED BY THE MERGED CHANGES (PR #724).** Passes at `448c295`, fails at `024c105`. Spec out of date, behaviour intended.
- Consequence: the 3 tests behind it (the Community pop-up placeholder, the mobile page placeholder plus inbox preview, the inbox preview wording) never ran, so the web bubble alignment from PR #737 is **not verified in a browser**.

### Not caused by environment

No port conflict, stale Redis or Chrome problem occurred in any run. The shared Postgres/Redis were healthy throughout.

## 5. Suggested fixes (not applied)

- F1 and F2: add a valid `reasonCategory` (for example `harassment_or_bullying`) to the report bodies in `20-held-investigations-holds.spec.ts` (`reportAgainst`) and `27-b114-search-everywhere-audit-log.spec.ts` (line ~89). Then re-run 20 and 27 to see the 11 skipped tests. They may reveal further drift.
- F3: have the test vet the QA admin first (as spec 25 and 27 do with `childSafetyVetted`), or change what it asserts (the refusal is now the intended behaviour).
- F4: add `isMine` to the expected keys, and assert its value for each of the two viewers.

## 6. Coverage gaps (from reading `e2e/tests` and `e2e/support`, not from running)

Searches (all under `e2e/tests` and `e2e/support`; first a case-sensitive `grep -rlF`, then a case-insensitive `grep -rliF` of the same list): `Suspend`, `suspend`, `suspension`, `suspension_appeal`, `Appeal a suspension`, `Record an appeal`, `appeal`, `recorder`, `Context hidden`, `contextHidden`, `this involves a child`, `child-safety`, `childSafety`, `child_safety_vetting`, `vetted`, `holds/legal`, `holds/bad-faith`, `holds/`, `/lift`, `lift`, `Appeal recorded`, `appeal_recorded`, `username_review_decided`, `Username review decided`, `Warn User`, `Remove Content`, `Dismiss Report`; plus `Block|Unblock` over the admin specs and `Under 16|Age group|Suspend account|Support actions` over all specs.

| Behaviour | Coverage found |
|---|---|
| Seventh Contact Us option "Appeal a suspension", its helper line and tag chip | **None.** `suspension_appeal` and "Appeal a suspension" appear nowhere. Spec 21 opens the dropdown but only ever picks "Data" and "Suggestions" and never asserts the list of options. |
| Suspend dialog (from a report, or from the user page) | **None.** The only `Suspend` hit is spec 22 line 213, which asserts the "Suspend User" button is **absent** on enquiry-origin reports. |
| Record-an-appeal dialog | **None.** |
| Recorder-cannot-decide and second-reviewer appeal rules | **None.** `appeal` appears only in a comment in spec 28 (line 15: Appeal Review "is covered by unit tests"). |
| Hidden message context ("Context hidden: this involves a child") for an unvetted admin | **None as a test.** The text appears nowhere in `e2e/`. Specs 47 and 50 use adults only (`minor` never appears in 50). I saw the line only by accident, in F3's failure screenshot. |
| 403 on the three hold routes for an unvetted admin on a child-involved message report | **None.** Spec 20 uses user-target reports only and contains no `vetted` or 403 case (and cannot run, see F1). |
| Audit-log labels "Appeal recorded" and "Username review decided" | **None.** "Appeal recorded" / `appeal_recorded` appear nowhere. `username_review_decided` appears only in spec 30 as a database/audit-row assertion (lines 260, 264, 295, 354), not as a label on the Audit log screen. Spec 27 seeds only `report.actioned` rows. |

Two more untested items I found:

- **Users-list Block button (now opens the reason-category dialog since #740) and Unblock:** no admin spec clicks Block or Unblock (the only hits are the web profile Block in spec 15).
- **"Under 16" row on User detail (PR #623, B-172):** `Under 16` as a User-detail label appears nowhere (spec 08's hits are DOB-correction tier text).

Vetting is exercised in specs 22, 25, 27 and 34, but only for guardian notices, escalate, audit-log rows and profile pictures.

## 7. Surprises and things I could not do

- The brief's baseline description is wrong for most of the batch (section 1). I used `024c105` as asked and added `448c295` to attribute failures. `024c105` could not tell F3 and F4 from pre-existing.
- Specs 20 and 27 have been unrunnable for about nine days, so a "green" Playwright run of their areas has not been possible since 2026-11-03. This is the main finding for the launch-gate run.
- Run 2 and both baseline runs reused the installed dependencies via directory junctions (the lockfiles and `package.json` files are identical between the three commits, checked with `git diff`). Each baseline had its own `npm run prisma:generate`; because the generated client lives in the shared `node_modules`, I ran them one after the other and regenerated the client for `main` at the end. I removed the junctions before deleting the baseline worktrees.
- The suite rewrites tracked screenshots under `docs/` (72 files). I reverted them with `git checkout -- docs`; none is in this PR.
- I copied the root `.env` (gitignored) from the developer's checkout into the QA worktree so the stack could start. It is not committed.
- Cause attribution for F3 and F4 is from code and a baseline run, not from bisecting each PR.

## 8. What I did not run

Every other spec (including 00 to 04, 06, 07, 09, 10, 12, 14 to 19, 23, 24, 30 to 33, 35 to 46, 48, 49), the full suite, spec 17 (the whole-month contest journey), the `services/api`, `apps/web` and `apps/admin` unit/Jest suites, the API e2e (Jest) suite, and CI. No real device and no browser other than Chrome 157. Nothing was fixed.

## 9. Worktrees left behind

`D:\Projects\soccernity-qa-run` (branch `qa/playwright-run-2026-11-12`) is kept so the artifacts above stay readable; delete it with `git worktree remove` when done. The two baseline worktrees were removed.
