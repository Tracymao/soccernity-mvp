# Security and safeguarding roll-forward, 2026-11-12 (report)

Branch `docs/security-rollforward-2026-11-12`, cut from fresh `origin/main` `e5deb02`. Docs only. Register Section 88; Decision Log #496 and #497.

## What was done

1. **Decision Log (Build Plan docx), two new rows, both "stated by the founder, 2026-11-12":**
   - **#496** the AccountHold check relaxed so a bad-faith hold can outlive its report. Written from the migration and the schema, not from the brief: only `AccountHold_type_shape_check` changed. Before: `(bad_faith AND expiresAt NOT NULL AND reportId NOT NULL) OR (legal_hold AND expiresAt NULL)`. After: `(bad_faith AND expiresAt NOT NULL) OR (legal_hold AND expiresAt NULL)`. Untouched: the legal-hold rule (it never required a `reportId`), `expiresAt` for bad-faith, the nullable column, the FK (still ON DELETE RESTRICT), every row, the application (it still always sets `reportId` on placement). Rollback SQL is in the migration header. Forward-pointer added on #493: "(a) and (b) BUILT by B-299, PR #735; (a) needed the AccountHold check relaxed, accepted in #496."
   - **#497** the new wording of B-295 and B-298 carries the literal `[COPY PENDING LEGAL REVIEW]` tag in the rendered string, with a manifest row per string; allow-list stays empty. Names the strings the founder listed. No pointer on #405 (the text names the B-124 guard and #412 item 5 as the practice it extends, not #405).
   - Built-by lines appended (append only) to the Status cell of #490, #491, #492, #493, #494. Status cells of #485 to #489 not edited.
2. **Register `docs/build-register.md`:**
   - Dated status lines on B-292, B-295, B-297, B-298, B-299 (Spec status cell only; old text a prefix).
   - New row **B-301** (Wave 8, 12 cells, counsel-pending Y), inserted after B-300.
   - Section 7: heading renamed `#367-#495` to `#367-#497`; rows #496 and #497 added after #495 (the practice used for #490 to #495).
   - Counters: header "Updated" paragraph, "Register size" paragraph (301 = 41 + 260), Waves table (W8 48, total 301), W8 list (48 names, B-301 added).
   - **Section 88** (88a to 88f) appended.
3. **CLAUDE.md:** new status bullet; the stale "PR opened, not merged" lines of the bullets for PRs #730 to #740 and #743 corrected in place (the #740 bullet had no merge line; one was added).

## Reconciliation

| | Before | After |
|---|---:|---:|
| B-IDs | 300 | 301 (41 with gap frames + 260 without) |
| Gap frames | 146 | 146 |
| W8 | 47 | 48 |
| Waves sum | 300 | 61+13+3+16+7+21+9+3+48+57+16+26+21 = 301 |
| Main-table rows (12 cells each) | 300 | 301 |
| Decision Log data rows | 493 | 495 (#1 to #497 less #293 and #294; 496 rows with header) |

## Verification (what was run)

- `git fetch origin`; `gh pr list --state open` returned `[]`; `origin/main` was `e5deb02` at the start and still at the end. No Decision Log row #496 or #497, no Section 88 and no B-301 existed.
- **Docx**, cell by cell against `git show origin/main:docs/Soccernity_MVP_Build_Plan_v1.7.docx`: 10 tables and 246 paragraphs, paragraphs text-equal; table 6 differs only in the Status cell (cell 3) of #490 to #494 (each old text a prefix of the new) and two added rows (#496, #497); 495 data rows, no duplicate number, #293 and #294 still absent; `word/document.xml` is the only zip part whose bytes differ, same part list; `zipfile.testzip()` clean.
- **Register**, positionally with `difflib` against `git show origin/main:docs/build-register.md` (never by B-ID; the same B-ID is on two lines in about 157 cases): five main-table lines differ in the Spec status cell only (B-292 line 345, B-295 line 348, B-297 line 350, B-298 line 351, B-299 line 352), each old cell a prefix of the new; one inserted line (B-301, line 354); changed non-row lines are the "Updated" paragraph (appended), the "Register size" paragraph, the W8 and Total rows of the Waves table, the W8 list and the Section 7 heading (counters and names, deliberate non-append edits); two inserted Section 7 rows; Section 88 appended (48 lines). All 301 main-table rows have 12 cells and 301 unique B-IDs. Working tree stays CRLF (the index is LF, as for every file in this repo).
- **CLAUDE.md**, positionally against `origin/main`: the 12 edited lines keep their text with the merge sentence replaced or added; one block inserted before `## Figma notes`.

## What was NOT run

No test suite, `tsc`, `eslint` or build (docs PR). CI cannot be read from here. Facts about code (migration, schema, callout text, check script, `existing.report?.concernsMinor`, missing audit-log key) were read from files on `origin/main`, not executed. The PR bodies of #730 to #740 state their own test results; none was confirmed. `docs/check_version_consistency.py` does not exist in the repo.

## Discrepancies and findings (every one, however small)

1. **PR numbers in the brief are swapped twice.** Actual: #733 = Figma pass W, #734 = Figma pass V; #737 = web removed-message bubble, #740 = admin code (B-295 admin leg). Recorded in 88f, the B-295 and B-298 cells and the CLAUDE.md bullet.
2. **#739 changed apps/admin as well as apps/web** (Category filter and labels); the brief listed it as Contact Us web code.
3. **The callouts say "the account"; the frames say "@christine001".** Recorded as the founder's accepted drift (88b), no Decision Log row, frames unchanged.
4. **Pass V decided the label "Appeal a suspension" is not tagged** (`docs/figma-pass-v-report.md` line 92); #497 reverses that. Said so in #497, B-298, B-301.
5. **The two "Not yet in any app" bullets** of `docs/pending-copy-manifest.md` (lines 146 and 147) are stale; B-301 replaces them. Not edited here.
6. **The DPIA outline v0.6** (lines 69, 1575, 1813) and the **incident plan v0.4** (line 380) still say the web page and admin inbox do not offer the Contact Us category. Separate PR.
7. **Hold routes still gate on `concernsMinor` only** (PR #730 body): an unvetted admin can place or lift a hold on a child-involved message report. Founder call.
8. **A hold whose report was purged** is treated by the lift route as not concerning a minor (`moderation-holds.service.ts` line 95); follows from #493 (a) and #496.
9. **`report.appeal_recorded` has no label in `apps/admin`** (no match in `apps/admin/src`); the audit-log screen would show the raw key.
10. **The `contest_entry` block** in `report-retention.service.ts` still stands; the Security session lifts it (#493 (c), #495 (h)).
11. **Suspension email goes to the address on file** (Section 85c item 1, restated).
12. **Status cells #488 and #489** still lead with "NOT BUILT" (#488 has a pointer to #495; #489 has none although B-296 is built by PRs #724 and #737); #486 and #487 lead with "DECIDED, NOT BUILT" but carry brackets saying the read rule and the sweep are built. Not edited; listed in 88d.
13. **Section 85c item 4** said "only a legal_hold row may have none"; the original check never required a `reportId` for a legal hold at all. #496 states the precise before and after. Section 85c is not edited.
14. **The brief's `inspect.py` trap**: a scratch helper named `inspect.py` shadows the standard library (known from an earlier pass); it was renamed on first failure, no side effect.
15. A first multi-line shell heredoc for the register script failed to parse and wrote nothing; the script was re-written with the file tool.
16. **Playwright was not run** for the Contact Us seventh option or the new admin dialogs (the PRs say so); nothing here changes that.
