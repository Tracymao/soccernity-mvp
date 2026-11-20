# Blur and race closeout (docs only), 2026-11-14

Branch `docs/blur-and-race-closeout-2026-11-13`, cut from `origin/main` `8227ecd`. Docs only. Records two founder decisions of 2026-11-13 and two merged PRs. No application code, schema, migration, Figma, legal copy, DPIA, incident-plan or `docs/pending-copy-manifest.md` change.

## What changed

| File | Change |
|---|---|
| `docs/build-register.md` | Rows **B-311** and **B-312** added after B-310; dated lines on the Spec status cell of **B-261**, **B-061**, **B-300**; Section 7 heading `#367-#504` to `#367-#506` and rows #505, #506; header `Updated` paragraph, 'Register size' paragraph, Waves table (W8 57 to 59, total 310 to 312) and the W8 list in Section 3; new **Section 95** (95a to 95f). |
| `docs/Soccernity_MVP_Build_Plan_v1.7.docx` | Decision Log rows **#505** and **#506** added; one dated pointer appended to the Status cell of **#472** (to #506) and of **#436** (to #505). |
| `CLAUDE.md` | One status bullet appended; the stale "PR opened, not merged" lines of the PR #763, #764 and #766 bullets corrected in place (each confirmed merged). |

## The two decisions and the two builds

* **#505 (founder, 2026-11-13, not a default):** B-261 (c), item (c) of #436, is confirmed as built. The finalist impressions screen keeps its 'No impressions yet' pills and its '-' Tolerance band stat before the reveal. Read, not run: `apps/admin/src/pages/contest/ContestImpressionsPage.tsx` `statusLabel` lines 59 to 64, pill line 206, band stat lines 155 to 158, settings card lines 224 to 258; `contest.test.tsx` lines 590 to 618. Still open and not decided: the two other items of `docs/figma-pass-p-report.md` section 8 (the new sets are not wired into the feed frames; the hidden club layers come back when the API returns a club).
* **#506 (founder, 2026-11-13):** fix the application for the blurred cover that could not be pressed on very small media. BUILT as **B-311**, PR #764 (merged 2026-11-13 23:30 UTC, `4a8e037`). The sizes are defaults, veto-able: the box is at least `min(100%, 200px)` x 120 px, a video box 168 px high (the builder's deviation; the length chip clears the cover only from 154 px up), media centred at natural size on the `--sn-green-tint-12` wash. Read: `SensitiveMedia.css` and `SensitiveMedia.tsx` line 61. Test results are the builder's: spec 41, 11 passed, 0 failed, at 1280, 820 and 320 px; `apps/web` folder `src/pages/community` 206 tests, 0 failures.
* **B-312:** the vote-versus-removal race test, **test only**, PR #763 (merged 2026-11-14 00:05 UTC, `3b9fdc8`). The report found **no defect against its stated invariants** (five runs of 50 iterations, no 5xx, no leftover vote, no deadlock), so it is recorded as BUILT, not as an open defect. One **observation** is recorded as not decided: in 3 to 6 of 50 iterations the `release` event is stamped earlier than its `cast`; I read `votesToRestore` (`contest-removal.rules.ts` lines 62 to 84 and `compareEvents` lines 46 to 48) and by that code such a vote would not be restored by an overturned appeal. A restore after a race was not tested.

## Numbers

| Count | Before | After |
|---|---|---|
| B-IDs | 310 (41 + 269) | 312 (41 + 271) |
| W8 | 57 | 59 |
| Gap frames | 146 | 146 |
| Main-table rows (12 cells each) | 310 | 312 |
| Decision Log data rows (#293 and #294 absent) | 502 | 504 |

## Where the brief and the sources differ

* The brief gives the cover as 148 x 58. The builder's report measured 148 x 55 on a static page with the system font and 148 x 86 in the real app; the QA screenshot showed a strip about 40 px wide. The register uses the report's numbers.
* The brief says the picture minimum was chosen by R60. The report says 200 x 120 px was the founder-given default, kept, and only the 168 px video height is the builder's own. Both are recorded as veto-able.
* The PR #765 bullet in `CLAUDE.md` was already corrected; only #763, #764 and #766 needed it.

## Verification (what I ran)

* `git fetch origin`; `gh pr list --state open` returned nothing; `gh pr view 763` and `764` both MERGED; Decision Log #504, row B-310 and register Section 94 on main. Next numbers #505, #506, B-311, B-312, Section 95 as expected.
* Register compared **positionally** with `difflib.SequenceMatcher` against `git show origin/main:docs/build-register.md` (LF and CRLF normalised; working file CRLF, no bare LF). Changed lines: header paragraph (old text a prefix), 'Register size' (counters and one inserted clause), the W8 row and the Total row (one digit each), the W8 list (heading count and two names appended, old list a prefix of the new line after the heading), Section 7 heading, three row lines changed in cell 6 only (B-061, B-261, B-300, each cell-level old text a prefix, 12 cells before and after), two inserted rows, two inserted Section 7 rows, one inserted Section 95. No deletion. All main-table rows have 12 cells; 312 unique B-IDs, none duplicated.
* Docx compared **cell by cell** with the committed file: tables 10 and 10; every table except the Decision Log identical; Decision Log 503 rows (header included) before, 505 after; added rows #505 and #506; the only changed cells are the Status cells of #436 (+270 characters) and #472 (+194), each with the old text a prefix; 246 body paragraphs equal; no duplicate number, only #293 and #294 absent; `word/document.xml` the only zip part whose bytes differ; `testzip` clean.

## Not run

No test suite, `tsc`, `eslint`, build or Playwright (docs PR). Every test result above is quoted from the PR #763 and #764 reports and was not rerun. The code claims rest on reading the named files on `origin/main`. `docs/check_version_consistency.py` does not exist in the repo, so it was not run.
