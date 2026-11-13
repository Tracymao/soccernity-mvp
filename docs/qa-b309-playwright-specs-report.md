# B-309: Playwright specs for B-305, B-306 and B-308 (QA report)

Written by the figma-to-code session acting as the Playwright spec writer. Tests only: no application code, no
`e2e/playwright.config.ts`, no `e2e/support/global-setup.ts`, no `docs/build-register.md`, no
`docs/pending-copy-manifest.md`, no Build Plan docx was changed.

## 1. Handshake

| Item | State |
| --- | --- |
| `git fetch origin`, origin/main | `d6138c8ab870c2051703a1480cb2acfa712b45ee` ("Merge pull request #757 ... frontend/b308-hold-controls-and-audit-notes"); the branch `qa/b309-playwright-specs` was cut from exactly this commit (merge-base equals it) |
| B-305 session-revocation marker | merged, PR #755 (`e7a28ef`) |
| B-306 `MEDIA_UPLOADS_ENABLED` switch | merged, PR #756 (`fd5c66a`) |
| B-307 contest-entry retention lift | merged, PR #758 (`ba93495`); covered by its own Jest e2e, not here (as briefed) |
| B-308 hold controls and audit notes | merged, PR #757 (`d6138c8`) |
| Docs PR with the decisions #500 to #503 | merged, PR #754 (`b7fbede`, commit `61a5396` "closing-batch decisions #500-#503, register B-305..B-309 (Section 92)"); the docx itself was not opened |

Setup, the same as the B-304 run: Docker Postgres and Redis, scratch database `soccernity_qa`, Redis DB 5, real Chrome,
one worker, serial, no retries (the unchanged `playwright.config.ts`). The root `.env` was copied into the clone so the
API could start; it is gitignored (`git status --ignored` shows `!! .env`) and is **not committed**.

## 2. Step 1: specs 53 to 57 against the new main, and the repairs

Specs 53, 54, 57 passed unchanged. Two tests failed, and in both the failure was the spec's own drift from B-308, not an
application defect. Each was repaired with the smallest change and the app left alone.

| File:line | What the spec assumed | What B-308 changed | Repair |
| --- | --- | --- | --- |
| `e2e/tests/55-b304-hidden-context-and-vetting.spec.ts:135` (was "B-302: placing a bad-faith or legal hold is refused ... UI panel") | An admin who is not child-safety vetted sees a "Legal hold" button on a child-involved message report, clicks it, and the server's 403 shows the restricted panel | On such a report (`contextHidden`) the page no longer draws the three hold controls; it draws the tagged line "Holds on this report need a child-safety-vetted admin (Settings › Roles)." instead (`data-testid="hold-controls-restricted"`) | Test renamed "B-302 / B-308 ...". The UI click-through is replaced by assertions that the context-hidden line and the tagged hold line are visible and that "Legal hold", "Reporter acted in bad faith" and "Lift hold" buttons number zero. The API loop in the same test (coded 403 `child_safety_vetting_required` on all three routes, zero `AccountHold` rows, zero `AdminActionLog` rows) is kept unchanged, so B-302's server refusal is still proven |
| `e2e/tests/56-b304-audit-log-labels.spec.ts:99` | `getByRole('cell', { name: 'Appeal recorded' })` matches one cell | B-308 made the notes cell of an appeal row read "Appeal recorded, decision pending", which also contains the label, so the locator matched two cells | `{ name: label, exact: true }` with a comment saying why |

One support change, needed by the new spec 59 only: `e2e/support/api-process.ts` (`ApiClock.mediaUploads?: boolean` and
`MEDIA_UPLOADS_ENABLED: clock.mediaUploads === false ? 'false' : 'true'` at lines 24 to 25 and 107 to 109). It sets the
switch explicitly to `true` by default, so the existing media specs behave exactly as before, and `restartApi({ mediaUploads: false })`
starts the API with uploads off. This is the "separate-API-process helper" the brief named; it is the harness's existing
`restartApi`, extended by one option, not a new mechanism. `global-setup.ts` and `playwright.config.ts` are untouched.

## 3. Step 2: the three new specs

Each spec seeds its own people and data through the real routes, does not depend on another spec, and uses role and
visible-text selectors. No `data-testid` was added to the app. Three existing `data-testid`s that the app already carries
are read by spec 59 (`picture-input`, `profile-image-avatar`, `profile-image-avatar-input`) and one by spec 60
(`hold-controls-restricted`, via the visible tagged text, not the id).

### 58: session revocation, B-305 (Decision Log #500), `58-b309-session-revocation.spec.ts` (3 tests)

The one-second edge is accepted by #500 (a token issued in the same second as the revocation is not refused), so every
test waits 1.2 s past the second between taking the token and revoking (`pastTheSecond`, line 22).

- Line 33, suspend from the user page. The user signs in in a real browser and also holds the token the API login
  returned. The moderator suspends them through the admin console (user page, Suspend account, category "Spam or scam").
  Proven: the DB row is `suspended` (line 60); **both earlier access tokens get 401 on the next call** (lines 64 to 67); the
  open browser, on its next action (the Clubs header link), ends on "Log in to browse clubs", the held token is cleared,
  no progressbar and no `statusCode` text (lines 71 to 75); reinstating through the API (200) leaves the **old token still
  401**, a new login works and its token is 200, and a UI sign-in works again (lines 78 to 87).
- Line 90, Block from the Users list. Same proof through the admin Block button: token 401, login 401 while blocked;
  after unblock the old token is still 401 and a fresh login works (lines 109 to 118).
- Line 121, an admin removed from the Roles list (Remove account dialog). The removed admin's earlier token gets 401 on
  `/admin/profile` and on `/admin/moderation/reports`; another admin's token is still 200 (lines 139 to 141).

### 59: upload switch, B-306 (Decision Log #501), `59-b309-media-uploads-switch.spec.ts` (7 tests, serial, `afterAll` restarts the API with the default env)

- Line 77, setup with the switch ON: a real upload (link, PUT to the fake store, confirm) approved by the automatic check.
- Line 92, ON control: the four routes work (upload link, confirm, avatar, cover).
- Line 104, **OFF** (`restartApi({ mediaUploads: false })`, line 106): `POST /media/uploads`,
  `POST /media/uploads/:id/confirm`, `POST /users/:id/avatar`, `POST /users/:id/cover` each answer **403 with
  `code: 'media_uploads_disabled'`** (lines 113 to 125); the body has no `uploadUrl`; **no `PostMedia` row and no change to
  the eight avatar and cover columns** (lines 128 to 134); an anonymous caller still gets 401, not the switch answer
  (lines 136 to 138).
- Line 140, OFF: reading and deleting an existing upload and reporting media still work (not gated).
- Line 163, OFF in the browser, the post composer: choosing a picture ends on a card titled "Upload failed" (the generic
  card), no progressbar, no raw code or `statusCode` text; Remove clears the card and the text post can still be sent
  (line 170 to 181); no `PostMedia` row is written.
- Line 185, OFF in the browser, `/profile?edit=1`: choosing a profile picture ends on "Uploads are not available right
  now." with a "Try again" button inside the avatar control, no progressbar, no raw code; `avatarKey` and `avatarStatus`
  stay null.
- Line 202, back ON: link, confirm and avatar work again and the browser composer takes a file ("Checking").

**What a person sees with uploads off (recorded, not judged):** in the post composer the picture card says "Upload
failed" with the generic line "Check your connection and try again." (the composer maps the unknown code to its
generic network-failure card; the line is misleading in that no connection fault exists, and the app's copy was not
judged here beyond recording it); on the profile picture control the person sees "Uploads are not available right now."
and Try again. Neither screen hangs or shows raw JSON.

### 60: hold controls and audit notes, B-308, `60-b309-hold-controls-and-audit-notes.spec.ts` (8 tests)

- Line 66, an admin who is not vetted on a child-involved message report: the "Context hidden" line and the tagged
  "Holds on this report need a child-safety-vetted admin" line are shown, and the three hold buttons are absent.
- Line 79, a vetted admin on the same report: the controls are shown and the restricted line is not.
- Line 90, an adults-only message report: the controls are shown to the admin who is not vetted.
- Line 101, an active hold on the report is still listed for the admin who is not vetted, **without** a Lift hold button;
  the vetted admin has one.
- Line 120, setup through the real routes: a staff-recorded appeal and two decided username reviews (one decline, one
  reinstate) written by real moderators.
- Lines 151, 168 and 183: **Audit log** (superadmin) shows the username-review rows as sentences with decision, username
  and reason and no `key=value` text; the appeal row reads "Appeal recorded, decision pending" and not the stored word
  "pending"; **My activity** shows each recorder and reviewer their own row as a sentence.

## 4. Step 3: the combined run

Command (the B-304 QA command plus 52 to 60), from `e2e/`:

```
npx playwright test tests/05- tests/08- tests/11- tests/13- tests/20- tests/21- tests/22- tests/25- tests/26- tests/27- \
  tests/28- tests/29- tests/34- tests/47- tests/50- tests/51- tests/52- tests/53- tests/54- tests/55- tests/56- tests/57- \
  tests/58- tests/59- tests/60- --reporter=list
```

Result: **161 passed, 0 failed, 0 did not run, 0 flaky, exit 0 (7.7 m).** No test needed a re-run. Before-figure: the
B-304 baseline was 143 passed, 0 failed, 0 not run; 161 is that plus the 18 new tests (58: 3, 59: 7, 60: 8). The 143 includes
the two repaired tests of Step 1, which now pass.

| File | Passed | File | Passed |
| --- | --- | --- | --- |
| 05-report-incorrect-details | 12 | 47-b284-admin-message-report | 5 |
| 08-admin-dob-correction-and-username-revoke | 24 | 47-b284-message-report-web | 5 |
| 11-admin-fc3b-screens | 2 | 50-b286-message-report-context | 6 |
| 13-fc4-admin-screens | 1 | 51-b289-content-removal-web | 8 |
| 20-held-investigations-holds | 7 | 52-b304-contact-appeal-option | 4 |
| 21-contact-us-page | 6 | 53-b304-suspend-from-report-and-user | 5 |
| 22-contact-enquiries-escalate | 7 | 54-b304-record-appeal | 4 |
| 25-b282-guardian-notices | 4 | 55-b304-hidden-context-and-vetting | 9 |
| 26-b114-admin-search | 6 | 56-b304-audit-log-labels | 3 |
| 27-b114-search-everywhere-audit-log | 6 | 57-b304-users-list-block-and-under16 | 3 |
| 28-b284-admin-report-categories | 4 | **58-b309-session-revocation** | **3** |
| 29-b284-web-report-categories | 5 | **59-b309-media-uploads-switch** | **7** |
| 34-b037-profile-image-review-admin | 7 | **60-b309-hold-controls-and-audit-notes** | **8** |

(The two log lines containing the word "failed" are test titles, "a failed search shows the error state" and "a failed
load shows the error and Retry recovers", both passing.) Before this combined run, 55/56/58/60 passed together (23, 1.7 m)
and 59 passed on its own (7, 1.8 m); the combined run is the figure to rely on.

## 5. Application defects and surprises

No application defect was found. Items worth knowing, all small:

1. **Misleading wording with uploads off (recorded, not judged).** The post composer shows "Upload failed" with the line
   "Check your connection and try again." when the server answers 403 `media_uploads_disabled`; the profile control shows
   a correct sentence ("Uploads are not available right now."). B-306's own report had already named this.
2. **Spec drift is the cost of B-308 for older specs.** 55 and 56 both broke on B-308 behaviour changes (section 2). Any
   other spec that clicks a hold button on a child-involved report or matches an appeal row's notes cell by substring would
   too; the ones in this run all pass.
3. **The one-second edge of B-305 is real in tests**: without the 1.2 s wait a revocation in the same second as the token
   would not be refused. The wait is in every B-305 test and explained in a comment; the app behaves as #500 says.
4. **Spec 37 (`37-b059-change-password-page`) was not run.** It is known to be affected by B-305 (a password change ends
   sessions); the brief said not to repair it and it was not part of the requested run.
5. The suite again rewrote tracked screenshots under `docs/` (86 files, not 90); they were restored with
   `git checkout -- <paths>` (section 7).

## 6. What was not run

Other Playwright specs (00 to 04, 06, 07, 09, 10, 12, 14 to 19, 23, 24, 30 to 33, 35 to 46, 48, 49 and the rest not
listed in section 4, including spec 37 and the whole-month spec 17), all Jest and Vitest unit suites, the API Jest e2e
suite (B-307 is covered by its own Jest e2e, as briefed), and CI. **CI cannot be read from this session**: this report
makes no statement about the state of GitHub Actions for this PR or for main.

## 7. Housekeeping

- 86 tracked screenshots under `docs/` were rewritten by the suite; they were listed with `git status` and restored with
  `git checkout -- <paths>` (only those paths).
- The scratch databases and the QA stack were left to the harness (it recreates `soccernity_qa` on every run).
- The root `.env` copy used for the run is in the clone, ignored and uncommitted.
- Intended diff against `origin/main`: `e2e/support/api-process.ts`, `e2e/tests/55-...`, `e2e/tests/56-...`, three new
  files `e2e/tests/58-...`, `59-...`, `60-...`, this report and one `CLAUDE.md` bullet. Nothing else.
