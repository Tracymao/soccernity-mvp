# Closing-batch roll-forward: report (2026-11-13)

Docs only. Branch `docs/closing-batch-rollforward`, cut from `origin/main` `83a38e2` (merge of PR #761). No application code, schema, Figma, legal draft, DPIA, incident plan or `docs/pending-copy-manifest.md` changed. No B-ID and no Decision Log row added.

## Handshake

- `origin/main` at start: `83a38e2` (merge of PR #761).
- Merges since `bcc2f96` that belong to this batch, confirmed with `gh pr view` (UTC, 2026-11-13): #754 docs closing-batch decisions (01:45), #755 B-305 session-revocation marker (10:17), #756 B-306 media-uploads switch (10:52), #758 B-307 contest-entry retention lift (11:51), #757 B-308 hold controls and audit-log notes (12:10), #760 B-309 Playwright specs (13:03), #759 DPIA v0.8 and incident plan v0.6 (13:09), #761 QA launch-gate full run (17:36).
- The B-309 specs (`e2e/tests/58`, `59`, `60`) and `docs/qa-launch-gate-full-run-report.md` are on `origin/main`.
- The QA run was made on `91ef451`, not `83a38e2`; the later head adds only `CLAUDE.md` and the QA report.

## What changed

| File | Change |
| --- | --- |
| `docs/build-register.md` | Dated, prefix-preserving lines in the Spec status cell of B-305, B-306, B-307, B-308, B-309, B-267 (item l), B-206, B-294, B-299; built-by pointers appended to the Section 7 rows of #500, #501, #502 (#503 untouched); one sentence appended to the "Updated" paragraph (line 3); new Section 93 appended. |
| `docs/Soccernity_MVP_Build_Plan_v1.7.docx` | Built-by text appended to the Status cell of Decision Log #500, #501, #502. Nothing else. |
| `CLAUDE.md` | Merge-status lines corrected for the bullets of PRs #754 to #761; one new status bullet. |

B-294 was added to the brief's list because it carries the same sentence as B-299 (that the `contest_entry` block is unchanged), which B-307 superseded.

## Verification (run in this worktree)

- Register compared positionally with `difflib` against `git show origin/main:docs/build-register.md` (CRLF normalised): 13 changed lines (line 3, nine main-table rows, three Section 7 rows) and 90 inserted lines (Section 93). Every changed row differs in exactly one cell (index 5, Spec status) and the old cell is a prefix of the new one; Section 7 rows keep their original text as a prefix; line 3 likewise. Every main-table row still has 12 cells; 309 unique B-IDs.
- Docx: 501 Decision Log data rows before and after; only the Status cell of #500, #501, #502 differs, by appended text (old text a prefix); all body paragraphs and all other tables equal; no duplicate numbers; `zipfile.testzip()` clean; `word/document.xml` is the only differing zip part.
- Line endings: `build-register.md` and `CLAUDE.md` are CRLF throughout (CRLF count = LF count = CR count), no bare LF.
- Counters: no B-ID added, so 309 B-IDs, 146 gap frames, W8 56 and 501 Decision Log data rows are unchanged (arithmetic in Section 93d).

## Not verified

- No test, `tsc`, lint, build or Playwright was run (docs PR). Test counts are quoted from each PR's own report and the QA report.
- Code claims were read from files on `origin/main` `83a38e2`, not exercised.
- The blurred-video failure (`41-blurred:203`) is unclassified by the QA report and was not investigated; the spec 06 flake (`06:125`) was not investigated.
- Whether `37-b059-change-password-page` is affected by B-305 is not known: the QA run gives no per-test line for it.
- CI was read only as a status with `gh run list`; it is not a finding about any test.
- Figma was not read. `docs/check_version_consistency.py` does not exist in the repo.

## Merge note

This PR touches the Decision Log docx, so it merges alone. It is not merged by this pass.
