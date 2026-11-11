# Report: founder decisions of 2026-11-11 on retention, appeals and vetting (Decision Log #490 to #494)

Branch `docs/decisions-retention-appeals-vetting-2026-11-11`, cut from fresh `origin/main` `290102c` (PR #726 merged) in a fresh clone. Docs only: no application code, schema, Figma, legal draft, DPIA, incident plan or Log Book changed.

## 1. Handshake and numbers

- `git fetch origin`; `gh pr list --state open` returned no open PR. No unmerged remote branch differs from `origin/main` in `docs/Soccernity_MVP_Build_Plan_v1.7.docx` or `docs/build-register.md`.
- Read from fresh main: the last Decision Log number was #489, the last register section 84, the last B-ID B-296. Nothing had landed since the brief, so the numbers taken are the ones the brief named: **Decision Log #490 to #494, register Section 85, B-297 to B-299.**

## 2. What changed

### Build Plan docx (Decision Log, `d.tables[6]`)

- Five rows added (#490 to #494), each deep-copied from the last row (#489) and refilled. Founder statements are marked STATED BY THE FOUNDER; adopted defaults are marked as the technical lead's proposal, veto-able.
- Dated forward-pointers appended to the Status cell of three earlier rows (old text a prefix of the new): **#485** (by #492 and #494), **#486** (by #491), **#487** (by #490 and #493).

### `docs/build-register.md`

- New main-table rows **B-297** (W8, vetting to act on a message report that involves a child, #491), **B-298** (W7, Contact Us 'Appeal a suspension' category, #492), **B-299** (W6, retention figures 6 and 7 years and the two purge unblocks, #490, #493). All DECIDED, NOT BUILT, 0 gap frames, 12 cells.
- Dated notes appended to the Spec status cell of **B-291** (BUILT, PR #722, plus the edge-case defaults), **B-292** (recorder may not decide; only for `user_suspended`; Contact Us route via B-298; still NOT BUILT), **B-293** (BUILT, PR #721; acting gated by B-297), **B-294** (BUILT, PR #725 with the 12-month and 6-year defaults; figures changed by B-299), **B-295** (Figma pass U BUILT, PR #723, frames U1 to U7, ids 7041:60951 to 7046:63455; U7 email wording reconciled under #494; code NOT BUILT), **B-296** (BUILT, PR #724).
- Section 7 heading renamed #489 to #494 and five coverage rows added; the header 'Updated' paragraph, the 'Register size' paragraph, the Section 1 wave table and total, and the W6, W7 and W8 lists in Section 3 updated, the way PR #720 did.
- Section 85 appended (85a to 85f).

### `docs/pending-copy-manifest.md` (append only)

- Five bullets appended to the end of the 'OPEN: services/api email wording' list, each dated 2026-11-11: the `account-suspended` email (subject and every body sentence, read from `registration-email.service.ts`), the `account-reinstated` email, the `suspensionReasonLine` map (all seven lines and the generic line), the admin line 'Context hidden: this involves a child', and the Contact Us label 'Appeal a suspension' with its helper line (wording TBC).
- A dated correction appended to the `guardian-safety-notice` bullet, original text left: 'nothing enforces it yet' is out of date. Verified on `origin/main` `290102c`: `content_removed` is enforced for post, comment and message targets (`moderation/content-removal.util.ts`, PR #714) and its guardian notice goes through `GuardianSecurityNoticeService` from `ModerationService` (`GUARDIAN_NOTICE_FOR_REPORT_ACTION`); `user_suspended` is enforced (PR #722) and the guardian notice `account_suspended` is sent once by `AccountSuspensionService` (`account_reinstated` on reinstatement).

**Why bullets and not table rows (a deviation from the brief's word "rows"):** the inventory test (`apps/web/src/pendingCopyManifest.test.ts`) reads table rows only for `apps/web` and `apps/admin` and fails on a row whose string is not in the named file. The two emails and the reason map live in `services/api`, which the guard does not cover (#406); 'Context hidden' and 'Appeal a suspension' are not in either app yet. Table rows for any of them would fail CI, so they are bullets, as the manifest already does for every other `services/api` string.

**Gap noted, report not edited:** `docs/legal-copy-v0.15-report.md` says the suspension wording is already in the manifest. On `origin/main` `290102c` it was not (no `account-suspended`, `account-reinstated` or `suspensionReasonLine` entry anywhere). This PR adds it.

### `CLAUDE.md`

- One new status bullet after the `legal/v0.15-suspension-retention` bullet.
- Stale 'PR opened, not merged' lines corrected in place for the bullets of PRs #720 to #728 (each confirmed merged in `git log` on fresh `origin/main`).

## 3. Found while checking (recorded, not decided)

- **#493 (a) meets a database constraint.** `AccountHold_type_shape_check` (migration `20261102090000_add_account_hold`) requires a `bad_faith` row to keep a non-null `reportId`. Clearing the link to a purged report works for a `legal_hold` row but not, as the schema stands, for a bad-faith row. Recorded in register 85c item 4, on B-299 and on #493's Status; the B-299 build must stop and ask.
- The suspension email goes to the address on file (85c item 1); the contest_entry block waits on #488; the context_of_other_report block stays.

## 4. Verification output

Positional comparison (`difflib`, line by line in order, not by B-ID) against `git show origin/main:<file>`, line endings normalised:

```
== docs/build-register.md 4471 -> 4531
 line old-prefix | Source: ... (header Updated paragraph)
 line COUNTER/RENAME | Register size: **296 B-IDs** ...
 row | W6 Hold / | W7 Contact | W8 Remaini | **Total** : cells changed [2] COUNTER
 insert 3 lines after the replaced block at 350 | | B-297 ...
 row | B-291 .. B-296 : cells changed [6] old-prefix   (Spec status only)
 line COUNTER/RENAME | B-IDs (8) / B-IDs (2) / B-IDs (45)   (count renamed, one entry appended)
 line COUNTER/RENAME | ## 7. Decision Log #367-#489 coverage
 insert 5 lines at 670 | | #490 ...
 insert 52 lines at 4480 | ## 85. ...
 main table: 299 rows, every row 12 cells; wave lists sum to 299
== docs/pending-copy-manifest.md 228 -> 233
 line old-prefix | - Same file, template `guardian-safety-notice` ...
 insert 5 lines at 143
 docx t6 r483 c3 485 prefix
 docx t6 r484 c3 486 prefix
 docx t6 r485 c3 487 prefix
 docx table 6 488 -> 493 ['490', '491', '492', '493', '494']
 DL data rows 492 dups 0 missing [293, 294]
 zip diff parts ['word/document.xml'] testzip None
```

The only non-prefix changes are the counter and heading lines, which change exactly as PR #720 changed them (register Section 84f). Every other table and body paragraph of the docx is text-equal; the Build Plan stays v1.7.

Pending-copy inventory test (`npx vitest run src/pendingCopyManifest.test.ts` in `apps/web`): **1 file, 15 tests, 15 passed.** No other test run (docs PR). `docs/check_version_consistency.py` does not exist in the repository, so it was not run.
