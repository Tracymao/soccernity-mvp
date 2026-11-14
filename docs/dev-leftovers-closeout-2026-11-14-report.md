# Dev leftovers closeout, 2026-11-14

Docs only. Branch `docs/dev-leftovers-closeout-2026-11-14`, cut from `origin/main` `8d6b691`. Register Section 96. No application code, schema, migration, Figma, legal copy, DPIA, wording or manifest change. Nothing was run: no test suite, `tsc`, `eslint`, build or Playwright. Every test result below is quoted from the builders' reports. Figma was not read.

## What was recorded

| Item | Where | Source read |
|---|---|---|
| Decision Log #507 (founder 2026-11-14: a vote's release event is never stamped earlier than its cast, with a test) | docx row, register Section 7, B-313 | `docs/backend-contest-release-timestamp-report.md`; `contest-removal.rules.ts`, `contest-entry-removal.util.ts` line 239 |
| Decision Log #508 (founder 2026-11-14: Bants room posts take photos and videos like Create Post) | docx row, register Section 7, B-042 note | `docs/frontend-bants-attachments-report.md`; `BanterRoomPage.tsx` lines 76, 77, 117, 328 |
| B-313, B-314, B-315 (new rows, BUILT, PRs #770, #771, #772) | register main table, W8 62 | the four reports; `postMedia.ts` lines 29, 52 to 55; `useMediaUploads.ts` line 133; `contest-clock.ts` line 82; spec 06 line 129; `leaderboard.service.ts` line 35 |
| Pass X (PR #769) answers pass P's open points | B-261 note | `docs/figma-pass-x-report.md`; `contest-exposure.service.ts` lines 94 and 199; `apps/web/src/api/contest.ts` line 326 |
| Checked-on-main lines on stale rows | B-115, B-116, B-230, B-176, B-046 | files named in each line |

B-314 (the web composers did not recognise the uploads-switch 403) is recorded as a fixed defect, not a decision, because it matches the already decided pass Q state 11.

## Adopted defaults

None stated by the founder beyond #507 and #508. The builders' own choices (the later-of rule for a release, building only the room-composer attachment, one 'uploads unavailable' state for 403 and 503, the layer renames in pass X) are listed in Section 96b so they can be vetoed.

## Recorded, not decided (Section 96c)

B-106 (not done here, as instructed); three related clock-before-lock stamps still unfixed; the leaderboard read ignoring the test clock; the four create-a-topic frames not built; the pass X reason for hidden club layers is out of date (the API returns a club since B-234; the web does not draw it and a minor's club is undecided); B-116 unproven at full-suite level; the profile image control's different uploads-off message; stale Figma notes; remaining test debt.

## Verification

- Register: positional `difflib` comparison with `git show origin/main:docs/build-register.md`, LF and CRLF normalised, the working file keeps CRLF. 0 pure deletions. Nine main-table rows changed in exactly one cell (Spec status), old cell a prefix of the new, checked per cell. Counter lines, the Section 7 heading and the two Section 7 pointer rows are the only other changes; three rows, two Section 7 rows and Section 96 were inserted. 315 main-table rows, all 12 cells, 315 unique B-IDs.
- Docx: Decision Log table 505 rows before, 507 after; two rows added; only the Status cells of #419 and #495 differ (appended text); all other cells, tables and paragraphs equal; #293 and #294 still absent, no duplicates; only `word/document.xml` differs in the zip; `testzip` clean.
- Statements about code rest on file and line reads of `origin/main` `8d6b691`, listed in each dated line.
- `docs/check_version_consistency.py` does not exist in the repo, so it was not run.
