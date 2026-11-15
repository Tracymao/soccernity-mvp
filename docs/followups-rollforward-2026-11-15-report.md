# Follow-ups roll-forward, 2026-11-15 (docs only)

Branch `docs/followups-rollforward-2026-11-15`, cut from `origin/main` `7d29078`. No code, schema, migration, Figma, legal copy, DPIA, runbook, `docs/deployment.md` or `docs/pending-copy-manifest.md` changed. Nothing was run (no tests, `tsc`, `eslint`, build or Playwright).

## What was recorded

- **Decision Log #522** (founder, 2026-11-15, on the recommendations): staff may reactivate a Bants room staff deactivated, and a creator's status and topic-tag controls need an active creator account. BUILT by PR #795 (backend) and PR #797 (admin screen). Builder defaults are stated as veto-able. There is no Figma frame for Reactivate Room. Accepted as is: a report on a room whose creator is anonymised still writes a notification to that dead account. Supplements #515.
- **Decision Log #523** (founder clarification): the leaderboard's per-row club is the club the user supports (the represented club, #74), never the club they play for. The leaderboard keeps it, the Figma CLUB column stays, #514 does not apply. Closes the question raised in PR #789's report and the club-layers report.
- **B-320** (new, W8, BUILT): route `POST /admin/banter-rooms/:id/reactivate`, audit action `banter_room.reactivated`, creator guard, `reportedRoom` on the report detail, admin screen, spec 64.
- Dated lines on B-071, B-053, B-305 (PR #796, two tests at risk, both fixed), B-232 (PR #794), B-265 and B-180 (PR #793 and its three unchanged gaps), Section 99c (iv) and Section 99d smoke-test line 7. Section 100 added (100a to 100f). Section 7 extended to #523.

## Numbers taken

Decision Log #522 and #523 (docx: 519 data rows before, 521 after; #293 and #294 still absent, no duplicates). B-320 (320 B-IDs, 146 gap frames, W8 66). Section 100.

## PR numbers cited

#793 (R84), #794 (R83), #795 (R81), #796 (R82), #797 (R85), plus #788, #789, #785, #787, #791 as references.

## Judgment calls

- B-320 is in W8, not W11 (the brief mentioned the W11 list). Veto-able; stated in 100b.
- "The three Security-session gaps" in R84 are read as the three found-not-changed items in `docs/docs-launch-gate-wording-fixes-report.md`; named on B-180 and in 100c (vi).

## Verification

- Register compared positionally (difflib, CRLF normalised) with `origin/main`: changes are 6 main-table rows differing in the Spec status cell only (old cell a prefix of the new one, all other cells equal), 2 appended dated notes, counter lines, one new row, two new Section 7 rows and Section 100. No bare LF; 320 unique B-IDs; every main-table row has 12 cells.
- Docx: Decision Log table 520 rows to 522 rows; only the Status cell of #514 and #515 changed (appended); other tables and body paragraphs equal; `word/document.xml` is the only differing zip part; `testzip` clean.
- `check_version_consistency.py` does not exist in the repo, so it was not run.

## Not verifiable here

All test results are the builders' (quoted from their reports). CI cannot be read from this session. R2 cross-bucket copy remains unproven. Open and untouched: F2, F5, F8, F15, F17, F19, the Node version, the exact R2 endpoint host for the CSP, Highlightly and per-account state.
