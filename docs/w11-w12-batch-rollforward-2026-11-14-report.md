# W11/W12 batch roll-forward, 2026-11-14 (docs only)

Branch `docs/w11-w12-batch-rollforward-2026-11-14`, cut from `origin/main` `4c4e8ad`. Task R74. No application code, schema, migration, Figma, legal copy, DPIA, wording or `docs/pending-copy-manifest.md` changed. Nothing was run (no tests, `tsc`, `eslint`, build or Playwright).

## 1. What was recorded

| Item | Where | Built by |
|---|---|---|
| A. Bants Create a topic: Title + optional text-only Description | Decision Log #510, row B-317, dated lines on B-042, B-117 | Figma PR #778, backend PR #780, web PR #782 |
| B. Repo-side launch-gate work starts now (deployment stays at the gate) | Decision Log #511, dated lines on B-179, B-088, B-180 | PR #779 (static sites), PR #781 (runbook) |
| C. Playwright in CI on demand only | Decision Log #512, dated lines on B-134, B-273 | PR #783 |
| D. Profile picture and cover uploads-off wording | Decision Log #513, row B-318, dated line on B-306 | PR #782 |
| E. PR #776 (test only) | dated line on B-316 only | PR #776 |
| F. PR #777 (test only) | dated line on B-305 only | PR #777 |

No new Decision Log number or B-ID was added for E and F.

## 2. Edits

- `docs/build-register.md`: rows B-317 and B-318 (12 cells, no pipe in a cell); dated append-only lines on B-042, B-117, B-179, B-088, B-134, B-273, B-180, B-306, B-196, B-316, B-305; checked-on-main lines on B-104, B-233, B-269; Section 68 item 10 (table row and bullet); counters on line 3, line 27, Waves table (W8 63 to 65, Total 316 to 318), the W8 list; Section 7 heading `#367-#509` to `#367-#513`, four new rows, pointers on the #404, #409, #419, #450 rows; new Section 98 (98a to 98f).
- `docs/Soccernity_MVP_Build_Plan_v1.7.docx`: Decision Log rows #510 to #513 (deep copies of #509); appended pointers on the Status cells of #404, #409, #419, #450.
- `CLAUDE.md`: one status bullet.

## 3. Stale-text sweep (counts)

- Rows whose latest note said not merged and were unresolved: 3 found (B-104 PR #431, B-233 PR #472, B-269 PR #579). 3 appended (merge commits proved with `git log --merges` on `origin/main`). 0 left unprovable.
- Other stale items given a dated line: B-196 (crop dialog built by FC6 #455 / FC7 #458), Section 68 item 10 (web fonts, PR #622), B-179 ("only two API services"), B-306 ("profile control untouched"), B-042 (create-topic frames not built), B-134 / B-273 (no CI step / no guard).
- Named in 98d, not edited: Section 97c (i), Section 96c (iv) and (viii), Decision Log #409 / #450 text, older CLAUDE.md bullets.
- Searched for register text describing the b291 tests as a suspended person appealing with their own token: none found.
- `render.yaml` header comment was read and is already correct (not stale).

## 4. Verification

- Handshake: `git fetch`; no open PR; main `4c4e8ad`; PRs #776 to #783 merged; last Decision Log number #509, last row B-316, last section 97.
- Register compared positionally (difflib over lines, in order) with `git show origin/main:docs/build-register.md`, LF/CRLF normalised: each changed main-table row differs in cell 5 (Spec status) only with the old cell a prefix of the new; the other changed lines are the counters, the Section 7 heading and rows, the Section 68 lines; Section 98 and the two new rows are insertions. 318 unique B-IDs, every main-table row 12 cells, no bare LF in the file (CRLF kept).
- Docx Decision Log compared cell by cell: 508 table rows (507 data rows) before, 512 (511) after; four rows added (#510 to #513); the only changed existing cells are the Status cells of #404, #409, #419, #450 (appended text); all other tables and all paragraphs equal; `word/document.xml` is the only differing zip part; `testzip` clean; no duplicate number; #293 and #294 still absent.
- The brief expected 509 Decision Log data rows before these rows; the actual count was 507 (the last NUMBER is #509, with #293 and #294 absent).
- Every "built" statement names the file or commit read. Test results are quoted from the six reports (`docs/figma-pass-y-report.md`, `docs/backend-bants-room-description-report.md`, `docs/frontend-bants-create-topic-report.md`, `docs/infra-static-site-hosting-report.md`, `docs/launch-gate-runbook-report.md`, `docs/qa-playwright-on-demand-report.md`) and the two PR bullets; they were not rerun.
- `docs/check_version_consistency.py` does not exist in the repo; Temi runs it locally before merging.

## 5. Not done / open (also in Section 98c)

The three clock-before-lock stamps; the leaderboard read ignoring the test clock; the club line on Final week tiles; B-116 unproven; B-106 and B-285 untouched; the on-demand workflow has never run on GitHub; the runbook unknowns F2 to F19; room name and description have no screening and no retention rule.
