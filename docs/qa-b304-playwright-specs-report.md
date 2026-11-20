# B-304 Playwright specs: repairs, six new specs, and a full run

Written for: the founder (Temi) and the QA reviewer, to verify and merge.
Branch `qa/b304-playwright-specs`, cut from `origin/main` `2ddb300e75ff97247adc12cf56cc03c011ae559f` (handshake: `git fetch` just before the final commit showed `origin/main` unchanged at that sha).

Only `e2e/`, this report and `CLAUDE.md` changed. No application code, `prisma`, `e2e/playwright.config.ts`, `e2e/support/global-setup.ts`, `docs/build-register.md`, `docs/pending-copy-manifest.md` or Build Plan docx was touched.

## 1. Result in one table

Command (from a fresh clone at `D:\Projects\soccernity-b304`, real Chrome, one worker, serial, no retries, scratch database `soccernity_qa`, Redis DB 5):

`npx playwright test tests/05- 08- 11- 13- 20- 21- 22- 25- 26- 27- 28- 29- 34- 47- 50- 51-` plus `tests/52- 53- 54- 55- 56- 57-`

**143 passed, 0 failed, 0 did not run (6.3 min).** Baseline for the 17 existing files was 97 passed, 4 failed, 14 not run (115).

| File | Baseline | Now |
|---|---|---|
| 05-report-incorrect-details | passed | 12 passed |
| 08-admin-dob-correction-and-username-revoke | passed | 24 passed |
| 11-admin-fc3b-screens | passed | 2 passed |
| 13-fc4-admin-screens | passed | 1 passed |
| 20-held-investigations-holds | failed | 7 passed |
| 21-contact-us-page | passed | 6 passed |
| 22-contact-enquiries-escalate | passed | 7 passed |
| 25-b282-guardian-notices | passed | 4 passed |
| 26-b114-admin-search | passed | 6 passed |
| 27-b114-search-everywhere-audit-log | failed | 6 passed |
| 28-b284-admin-report-categories | passed | 4 passed |
| 29-b284-web-report-categories | passed | 5 passed |
| 34-b037-profile-image-review-admin | passed | 7 passed |
| 47-b284-admin-message-report | failed (1) | 5 passed |
| 47-b284-message-report-web | passed | 5 passed |
| 50-b286-message-report-context | passed | 6 passed |
| 51-b289-content-removal-web | failed | 8 passed |
| 52-b304-contact-appeal-option (new) | n/a | 4 passed |
| 53-b304-suspend-from-report-and-user (new) | n/a | 5 passed |
| 54-b304-record-appeal (new) | n/a | 4 passed |
| 55-b304-hidden-context-and-vetting (new) | n/a | 9 passed |
| 56-b304-audit-log-labels (new) | n/a | 3 passed |
| 57-b304-users-list-block-and-under16 (new) | n/a | 3 passed |

(Per-file baseline status is from the brief's totals; the four failing files are the four it named. The per-file counts "now" are counted from the run log.)

No test failed in the final run, so no flakiness rerun was needed. Failures seen *during development* were all in my own new specs and are listed in section 4.

## 2. Step 1: the four repairs (smallest change each)

All four were spec-own drift; the app behaved correctly.

1. **Spec 20** `reportAgainst` (line 35): body now sends `reasonCategory: 'harassment_or_bullying'`. `POST /reports` requires a category since B-284 (PR #612), so the old body was a 400.
2. **Spec 27** seed report (line 89): same added `reasonCategory`.
3. **Spec 47 (admin message report)**, the "a message that is gone..." test (lines ~166-172): the QA superadmin is not child-safety vetted, and since B-297/B-302 a missing `Message` row fails closed for an unvetted admin, so the report page shows the restricted panel instead of "no longer available". The test now saves the QA admin's `childSafetyVetted/vettedAt/vettedByAdminId`, vets the admin, runs the original assertions in `try`, and restores in `finally`. The same restore pattern is already used by spec 27.
4. **Spec 51** (lines 106-107): the removed-message stub now carries `isMine` (PR #724, B-296, Decision Log #489). Expected keys are `['id','isMine','removedByModeration','sentAt']` and `isMine` is asserted per viewer (`who === sender`).

## 3. Step 2: new specs and what each proves

All seed their own data (synthetic accounts in the scratch database). Admin actions use moderators created in Postgres and used through a locally signed admin token (see section 5 for why). No `data-testid` was added to the app; selectors are roles and visible text. The literal tag lives in one exported constant `COPY_TAG` in `e2e/support/helpers.ts` (with `tagged()`).

- **52 Contact Us seventh option.** Dropdown has exactly 7 options, the last is "Appeal a suspension" followed by the tag (`52:26`). Helper line "Use the email address your Soccernity account is registered with so we can find it." and the `.contact-page__tag` chip show only for that category (`52:53`). Submitting stores `category = suspension_appeal` (`52:74`). The admin inbox row shows the label *without* the tag; the Category filter has "All" plus seven labels and finds it (`52:103`).
- **53 Suspend.** From report detail: confirmation lists five tagged consequences and no category radios; Cancel changes nothing (`53:55`). Confirming suspends, shows the tagged "Account suspended..." callout and the pill, sets `suspendedByReportId` (`53:106`), kills the refresh token and login is 401. From the user page: nine required radios, "Choose a reason category." error, audit notes `status=suspended; reasonCategory=spam_or_scam` (`53:168`), `suspendedByReportId` null (`53:164`). My activity lists both. The real route returns 400 `suspension_reason_category_required` without a category.
- **54 Record an appeal.** Empty reason stopped client-side with no request sent; recorded appeal shows the tagged callout, `appealRecordedByAdminId` = recorder, audit `report.appeal_recorded` with notes `pending` and no reason text; the recorder is refused on the review page and by the API with code `appeal_recorder_cannot_decide` (`54:117`), the original actioner is refused too; a second reviewer overturns, the account is `active`, link cleared (`54:139`), login works.
- **55 Hidden context and vetting.** Unvetted admin sees the tagged "Context hidden: this involves a child." and no context/original (`55:78`); vetted admin sees both (`55:104` negative control). B-297: Dismiss refused (restricted panel, coded 403 `55:127`). B-302: bad-faith and legal holds refused (`55:147`), nothing written; vetted places the hold, unvetted lift refused (`55:164`), after `AccountHold.reportId` is set NULL any moderator can lift (Decision Log #499, `55:170`); 404 comes first for a missing report/hold; vetted Dismiss works in the UI; adults-only control thread shows context to the unvetted admin and lets them act; fail-closed with the `Message` row gone (`55:246`).
- **56 Audit-log labels.** Both rows are written by real routes (suspension then `POST /admin/moderation/reports/:id/appeal`; `username-revoke` then `POST /users/me/username-review` then `POST /admin/username-reviews/:id/decide`). No row is inserted directly. Audit log Action-kind list offers "Appeal recorded" and "Username review decided" (`56:72-73`); rows read as words and never contain the raw keys; My activity shows them for recorder and reviewer.
- **57 Users list and detail.** Block opens the category dialog, needs a category, suspends, Suspended tab lists it, Unblock restores, audit notes say which (`57:59`). User detail "Under 16": Yes for a 14-year-old (`57:80`), No for a 17-year-old and for an adult (`57:85`, `57:91`); the page reads the summary route, no `user.dob_viewed` row is written.

## 4. Failures during development (all spec-own, all fixed)

- Spec 55: I asserted `status = 'dismissed'` after Dismiss; the app maps dismissed to status `reviewed` with `actionTaken = 'dismissed'` (`moderation.service.ts:1044`). Fixed in two places.
- Spec 53: `verifiedAccount` generated a username with too many digits (the username rules refuse phone-like handles); the helper now strips digits from the label and retries on `username_not_allowed`.
- Spec 52: the Category filter's first option is "All", not "Any category".
- Helpers: a regex line was broken by a heredoc escape (TypeScript error), rewritten.

## 5. Surprises, deviations and application observations

1. **The brief expected no "Under 16" row for an adult. The app draws the row for every account** (Yes/No), per B-172 / PR #623 and the Figma frame. Spec 57 asserts what the app does (row present, "No" for an adult). Not an app defect; the brief's expectation was out of date.
2. **Username rule.** Handles with many digits are refused as phone-like, so labels in generated handles must not contain digits. Harness issue only.
3. **Access tokens stay valid after suspension** (the JWT guard does not check account status). Specs assert login refusal and refresh-token revocation, not that an already-issued access token is refused. Existing app behaviour, recorded, not a regression.
4. **Admin tokens are minted locally, not obtained by login.** The admin login is limited to 5 per 15 minutes per IP and the suite spends that budget elsewhere. `createQaAdmin` inserts a moderator/superadmin row (password hash is a non-verifying placeholder) and signs a JWT with `ADMIN_JWT_SECRET`; `adminPageAs` answers the console's start-up `POST /admin/auth/refresh` in the browser. Real admin sign-in is still covered by spec 08.
5. **Two states are simulated by a direct database write** (stated, not hidden): a purged report's hold link (`UPDATE AccountHold SET reportId = NULL`, which is what the retention sweep does) and a missing `Message` row (delete). The report row itself is not really purged.
6. **No email assertions for suspension/reinstatement.** Those templates are "quiet" (they log no recipient), so `waitForEmail` cannot see them. The callout text that says the account "has been emailed" is asserted; delivery is not.
7. The tag text is asserted in rendered strings per B-301; the admin inbox label for "Appeal a suspension" is asserted to be untagged (decided default).
8. The suite rewrote 90 tracked screenshots under `docs/` (more than the ~72 in the brief). I listed them via `git status` and restored only those with `git checkout -- <paths>`; nothing else was reverted.
9. I copied the root `.env` into the clone (gitignored, never committed) because the harness reads it.

No application defect was found in this pass.

## 6. What was not run

Every other Playwright spec (00-04, 06, 07, 09, 10, 12, 14-19, 23, 24, 30-33, 35-46, 48, 49 and any not named above), spec 17 (the whole-month journey), all Jest/Vitest unit suites, the API Jest e2e suite, and CI. CI cannot be read from here; I did not look at it. No real-browser check outside the Playwright runs.

## 7. Files

Changed: `e2e/support/helpers.ts` (appended B-304 helpers), `e2e/tests/20-`, `27-`, `47-b284-admin-message-report`, `51-` specs. New: `e2e/tests/52-` to `57-b304-*.spec.ts`. Plus this report and a `CLAUDE.md` bullet.
