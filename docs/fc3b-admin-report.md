# FC3b admin report

Branch `fc3b/admin-user-detail-revoke-incorrect-details`, 2026-10-19, from fresh `origin/main` (`9e2ab86`). Scope: `apps/admin` only, plus `e2e/` (the matching tests), `docs/pending-copy-manifest.md`, `docs/build-register.md` (status lines) and this report. **Not touched: `services/api`, `apps/web`, Figma, the Decision Log docx, legal copy.** Not merged: Temi verifies and merges.

Frames used (Figma `weZWWqggy9j13eX8bhFgs6`, page `0:1`): User Detail `6647:25540`; Revoke Username Dialog `6647:25789`, Username Revoked `6649:24462`, Revoke Username Error `6649:24714`; Incorrect-Details Reports family `6737:27844` (list), `6738:27962` (truncated), `6738:28144` (empty), `6738:29952` (loading), `6738:28328` (load error), `6738:30173` (resolve confirm), `6738:28510` (resolve 404), `6738:28693` (resolve failed); DOB guardian block `6752:29980` and validation `6752:30141`. Text was read from the frames node by node (`use_figma` read-only), and each screen was compared against a screenshot of the frame.

## What was built

### (a) D-07 / B-129: User Detail without the date of birth
- `api/adminUsers.ts`: new `getUserSummary()` (`GET /admin/users/:id/summary`) and the `AdminUserSummary` type (the response shape of `admin-user-detail.service.ts`).
- `UserDetailPage.tsx` reads the summary. It never selects the DOB, so opening a user writes no `user.dob_viewed` audit row and the date never reaches the browser. Only `CorrectDobPage.tsx` still calls the full `getUserDetail()` (it needs the current date).
- `CorrectDobPage.tsx` shows the server's `reason_contains_date` message under the reason field (the form returns from the confirm dialog to the form). The client-side `reasonHasDate` check stays as the first line; the server is authoritative.
- `usersShared.formatDate` is now built by hand ("03 Sep 2026", as the frames write it) because newer ICU renders "Sept".

### (b) B-033 frontend: Revoke username
- The button on User Detail is enabled when the account has a username; the drawn dialog opens (title, close, body "This removes @x from Name's account.", Cancel / Revoke username) and calls `POST /admin/users/:id/username-revoke`.
- **Reason required** (10 to 500 characters, trimmed, checked in the form before the call, the same limits as the endpoint). The frames do not draw a reason field, so the field and its help line ("Reason (required)", "Recorded with the revoke in the audit log.") reuse the wording the drawn DOB form already uses. This is the one control beyond the frames and it is there because the endpoint refuses a request without a reason.
- After a revoke: the dialog closes, the drawn banner "Username revoked. The action was recorded." appears, the summary reloads and shows "No username", "This account has no username." and the button disabled (frame `6649:24462`).
- Failure: the dialog stays open with the drawn banner "The username could not be revoked. Nothing was changed. Try again."; a specific 4xx message from the server (for example 409 "This user has no username to revoke.") is shown instead of the placeholder.
- **The 30-day hold wording is not shown, because no frame carries it.** The dialog frame says only what is removed; the success and error frames carry no hold line. The response includes `heldUntil`, but nothing in the frames says where to show it. Inventing it would add unreviewed wording about a child's account. If the founder wants it, it needs a frame (or a line in these three) first.

### (c) B-120: incorrect-details reports screen
- New `IncorrectDetailsReportsPage.tsx`, route `/users/incorrect-details-reports` (a static segment, so it outranks `users/:id`). The sidebar host is Users (the existing nav item stays active on the path).
- Columns are exactly the response fields: Minor, User ID (shortened as drawn, `6b1f5f2e…2f7c1a8d`), Account, Guardian, Guardian email, Consent, Reported, Action. No date of birth, no note field (the resolve endpoint takes none), no other control.
- States as drawn: loading ("Loading the open reports."), empty, load error with Retry, truncated notice ("Showing the first 200 open reports...", from the server's `truncated`), resolve confirm dialog, resolve failed ("The report could not be resolved. It is still open. Try again."), and the **404 as an expected outcome**: "No open incorrect-details report for this user. It may already have been resolved, so the list has been refreshed." plus a list reload, never a crash. After a successful resolve the row leaves the list, with no success message (the frame draws none).
- **One thing outside the frames, flagged:** a link "Incorrect-details reports" on the Users list (next to Add Member). Without it the screen is reachable by URL only; the frame notes list the entry point as SCOPE OPEN (B-119 note 2, 3). Remove it if the founder wants another entry.
- Not built (the frame notes list them as SCOPE OPEN): a link from a row to User Detail, a success message after resolve, a sidebar item of its own.

### (d) B-104: guardian fields in the DOB correction
- The drawn "Guardian details" block (legend, help line, Guardian's full name, Guardian's email, Relationship) now appears **as soon as the new date makes a minor and the account has no guardian on file** (`user.guardian === null` on the full read, new date under 18), instead of only after a server 400. "Review correction" refuses to continue until all three are filled, with the drawn message "Enter the guardian's name, email and relationship." above the card and the empty fields marked invalid (frame `6752:30141`).
- The server stays the authority: the old fallback is kept (if the server still answers "Provide guardian name, email and relationship", the block is shown then).
- Frame `6752:30127` tags the help line `[COPY PENDING LEGAL REVIEW]`; the code now does too, and `docs/pending-copy-manifest.md` has the row.

### Pending-copy manifest
Four tagged strings added to `docs/pending-copy-manifest.md` (the inventory test would otherwise fail): the guardian help line, the reports explainer callout, the resolve dialog line, the revoke dialog body. `apps/web/src/pendingCopyManifest.test.ts` passes (15/15). `npm run check:pending-copy` still fails by design (every row is draft wording).

## e2e: `test.fail()` lines removed

- **`e2e/tests/08-admin-dob-correction-and-username-revoke.spec.ts`, D-07** ("opening User Detail is not an audited date-of-birth read"): the `test.fail(true, ...)` line is removed; it is now a plain regression test and passes. It is the only remaining `test.fail()` on the admin side. No other `test.fail()` in `e2e/tests` matches this work (the remaining hits in `00`, `03`, `07` are comments saying the line is already gone).
- **G-2** (no admin screen for incorrect-details reports) was not a `test.fail()` but a test named "there is no admin UI screen for it yet" with a deliberately loose URL assertion in `05`. It is replaced by a real UI test (list reached from the Users list, row with a Pending pill, no date of birth) and the resolve step now runs through the UI; a new test covers the 404 message (a second report resolved through the API behind the admin's back).
- Other test changes forced by the new behaviour: `08` "Revoke username is a disabled button (UI not built yet)" became "disabled for an account with no username"; the adult-to-minor tests now fill the guardian block up front (the old flow waited for the server's 400); a new UI test drives the revoke dialog end to end (reason required, drawn revoked state, audit row with the reason, no `user.dob_viewed` row); the admin sign-in helper moved to `e2e/support/admin-ui.ts` so `05` and `08` share the single throttled login.
- New evidence-capture spec `e2e/tests/11-admin-fc3b-screens.spec.ts` (no assertions) writes the screenshots in `docs/fc3b-admin-screens/`.

## Verification

- `apps/admin` vitest: **17 files / 186 tests -> 18 files / 207 tests, 0 failures** (before measured on a clean checkout of `origin/main` in a worktree; after on this branch). New file `incorrectDetailsReports.test.tsx` (9 tests); `userDetailDob.test.tsx` rewritten for the summary read, the revoke dialog, the up-front guardian block and the server reason-date message.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` (`apps/admin`): clean.
- `apps/web` `pendingCopyManifest.test.ts`: 15/15.
- e2e (real Chrome, real API, Postgres, Redis; `npx playwright test 05 08` before the final fix and `08` again after): `05` and `08` green. **Full e2e suite on this branch: 176 passed, 0 failed (5.8 min)** (the last recorded figure, from fc3a, was 172; the difference is the two screenshot-capture tests plus the new UI tests for revoke, the reports screen and its 404).
- **Visual check against the frames in a real browser (Chrome at 1440 px, the frame width):** screenshots in `docs/fc3b-admin-screens/` (`fc3b-01` User Detail, `02` revoke dialog, `03` revoke error, `04` username revoked, `05` DOB guardian block with the validation message, `06` reports list, `07` resolve confirm, `08` empty, `09` load error). They match the frames in layout, wording, pills and states. Known differences, all deliberate:
  - **The red error bar.** The frames draw error callouts (revoke error, guardian validation) with a `semantic/alert` red bar. `apps/admin` has no such token and non-negotiable #3 forbids a new colour in code, so errors keep the navy bar the app already uses (`.us-error`). The `semantic/alert` token is a founder-authorised exception in Figma only.
  - The reason field in the revoke dialog (see above).
  - Long guardian emails truncate with an ellipsis inside the 1100 px table (the frame uses short sample emails).
  - Frames show sample text in Inter and the page header sits at the shell's usual position; unchanged from the existing admin screens.
- Not checked: the loading frame `6738:29952` and the truncated frame `6738:27962` were not screenshotted from the live app (both states are covered by unit tests); the 404 and resolve-failed states are covered by e2e/unit tests, not screenshots.

## Open points for Temi

1. **30-day hold wording**: the brief asked for it "from the frames"; the frames have none. Needs a frame or a decision.
2. **Entry point to the reports screen**: a link on the Users list was added (outside the frames).
3. **Error colour**: navy bar instead of the Figma red.
4. The DOB correction page still performs the audited full read on load (`getUserDetail`), as before; that is the only place the date is read.
5. Revocation history (`usernameRevocations` in the summary) is returned but no frame shows it, so it is not rendered.

## Register status lines

Appended in `docs/build-register.md` (spec-status cell, dated 2026-10-19, "Built, not merged"): **B-033** (admin frontend: revoke dialog), **B-143** (UI path built and covered by e2e), **B-120** (reports screen), **B-129** (frontend leg: User Detail on `/summary`, reason-date message), **B-104** (guardian block). B-109, B-119 and B-137 are unchanged (the host screen was built earlier; the frames are Figma-only rows).
