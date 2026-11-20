# B-300 roll-forward (docs only), 2026-11-12

Branch `docs/b300-rollforward-2026-11-12`, cut from fresh `origin/main` `1524136`. Docs only: no application code, schema, migration, Figma, legal copy, DPIA or `docs/pending-copy-manifest.md` changed. No new B-ID and no new Decision Log row. This pass decides nothing.

R58 (PR #741) recorded the founder's rules for removed contest entries as Decision Log #495 and register row B-300, DECIDED, NOT BUILT. The build (PR #742, `backend/b300-contest-entry-removal`) is merged. This PR records that, records the builder's own adopted defaults, fixes one wrong phrase R58 left in B-300, and corrects two older rows whose "NOT BUILT" notes are stale.

## Handshake (before any edit)

- `git fetch origin`; `gh pr list --state open` returned nothing, so no open PR edits the docx or the register.
- Last numbers re-read on `origin/main`: Section 86 is the last register section, #495 the last Decision Log number (493 data rows), B-300 the last B-ID. Section 87 was free. (Checked again before opening the PR, see below.)
- PR #742 merged 2026-11-12 13:32 UTC (merge commit `3024853`); PR #741 merged 13:40 UTC (merge commit `1524136`).

## What changed

`docs/build-register.md` (working tree CRLF, the committed blob is LF; `core.autocrlf=true`):

| Place | Change |
|---|---|
| B-300, Spec status cell | Dated BUILT line appended: one sentence per rule group (a) to (g) of #495, the three schema additions, the widened `ContestVoteEvent` check, what B-300 does not change, and that the code was not re-read line by line. **One deletion:** the words ` (the build brief calls it R57)`. |
| B-289, B-290, B-294, B-299 | Dated note appended to the Spec status cell of each. |
| B-054, B-042 | Dated note appended to the Spec status cell of each (see below). |
| Section 85c item 2 | Dated bracketed note appended. |
| Section 7, row for #495 | Dated note appended; heading not renamed (no new Decision Log row). |
| Line 3, `Updated` paragraph | One sentence appended. |
| Section 87 | New block appended (87a to 87f). |

`docs/Soccernity_MVP_Build_Plan_v1.7.docx`: one line appended to the Status cell of Decision Log #495. Nothing else. #483 and #488 are not edited (both already point to #495; the builder's report asked for notes on them, the brief for this pass says not to).

`CLAUDE.md`: a new status bullet; the two bullets for PR #742 and PR #741 said "PR opened, not merged" and were corrected in place to "Merged as PR ..." (this file's own "Keeping this file current" rule).

### The two stale rows (B-054 and B-042)

Both carried a Section 69 note, "NOT BUILT (checked on main)", saying the membership check on posting is still in `banter.service.ts` (B-042 adds: the Bants attach button is disabled). Checked on `origin/main` `1524136`:

- `grep -rn assertRoomMembership services/api/src` finds nothing; `postToRoom` calls `assertRoomExists` and then `FeedService.createPost`. `git log -S assertRoomMembership` shows commit `0dbef8b` (2026-11-07, "B-117 backend: Bants open forum"), merged by PR #666 (`backend/b117-bants-open-forum`). So the membership half is stale for both rows.
- `apps/web/src/pages/BanterRoomPage.tsx` lines 314 and 315: the attach button is `disabled` with the title "Attaching photos or videos isn't available yet". So B-042's attachment variant is still not built.

B-054's note says only the membership point is stale and that its other points (comment thread versus feed, the unverified mobile no-results variant) were not re-checked. The old Section 69 text is untouched; Section 87d names it as stale.

## Numbers

| Count | Before | After |
|---|---|---|
| B-IDs | 300 (41 with gap frames + 259 without) | 300 (unchanged) |
| Gap frames | 146 | 146 |
| Main-table rows | 300, 12 cells each | 300, 12 cells each |
| Decision Log data rows | 493 (#1 to #495; #293 and #294 absent) | 493 (unchanged) |
| Docx Decision Log table rows incl. header | 494 | 494 |
| Register lines | 4,577 | 4,637 |

## Verification (what I ran)

1. **Register, positional diff** (`difflib.SequenceMatcher` over lines, committed blob normalised to CRLF; not by B-ID):

```
REPLACE line 3 Source: ...                  => APPENDED (old line is a prefix of new)
REPLACE line 95  | B-042 | ...               => only cell 5 differs, old a prefix of new
REPLACE line 107 | B-054 | ...               => only cell 5 differs, old a prefix of new
REPLACE line 342 | B-289 | ...               => only cell 5 differs, old a prefix of new
REPLACE line 343 | B-290 | ...               => only cell 5 differs, old a prefix of new
REPLACE line 347 | B-294 | ...               => only cell 5 differs, old a prefix of new
REPLACE line 352 | B-299 | ...               => only cell 5 differs, old a prefix of new
REPLACE line 353 | B-300 | ...               => cell5 NOT prefix [('delete', ' (the build brief calls it R57)', ''), ('insert', ..., ' 2026-11-12 (Section 87): BUILT, PR #742 ...')]
REPLACE line 676 | #495 | ...                => Section 7 row: last cell appended
REPLACE line 4507 2. **The contest_entry block waits on #488.** => APPENDED (old line is a prefix of new)
INSERT at new line 4579, 60 lines: ## 87. ...
hunks 9; unique B-IDs in main table: 300; rows with 12 cells: 300
```

   The one deletion (R57 label) is the only place an old cell is not a prefix of the new one.

2. **Docx, cell by cell** against `git show HEAD:docs/Soccernity_MVP_Build_Plan_v1.7.docx` (python-docx): same number of tables and body paragraphs, all paragraph text equal; exactly one differing cell: table 6, row #495, column 3 (Status), new text starts with the old text, the added text is ` [2026-11-12: Built by B-300, PR #742; the builder's own defaults are in register Section 87b.]`. 494 rows before and after; 493 data rows, 493 unique, last #495, only #293 and #294 missing from 1 to 495. `zipfile.testzip()` returns `None`; the only zip part whose bytes differ is `word/document.xml`.

3. **Sources read** (not memory): `gh pr view 742` body; `docs/backend-contest-removal-report.md`; the migration SQL `20261130090000_contest_entry_removal` (it adds `finalistsFrozenAt`, the `ContestFinalist` table, `revokedForRemovalAt`, and widens `ContestVoteEvent_action_check` to `cast, retract, release, restore`); existence of every file the report names (all present, including `contest-entry-removal.util.ts`, `contest-derivation.ts`, `contest-removal.rules.ts`, `contest-finalists.util.ts`, `engagement-points.util.ts` with `revokeEngagementPointsForRemoval` and `restoreEngagementPointsForRemoval`, and the three test files); function names in `contest-entry-removal.util.ts`, `contest-removal.rules.ts` and `contest-finalists.util.ts`; the call sites in `moderation/content-removal.util.ts`; the six scenario titles in `test/contest-removal.e2e-spec.ts`; `report-retention.service.ts` and its git history (last commits are B-294 and B-299, so B-300 did not touch it, and the `contest_entry` block at lines 301 and 302 is still there). The B-300 rule-group sentences come from the builder's report and PR body, not from my own line-by-line read of the code.

4. **CI.** `gh run list --branch main` shows CI and CodeQL `completed success` for both `3024853` and `1524136`.

5. **Not run, by me, by anyone I can verify:** no code was run. The brief lists the six end-to-end scenarios in `test/contest-removal.e2e-spec.ts` (they need a database), `tsc` and `eslint` for `services/api` as not yet verified by anyone; the PR #742 body states the builder ran `tsc`, eslint and `nest build` clean, 60 suites / 1,576 tests mocked with 0 failures, the new e2e file 6/6, nine neighbouring e2e files passing, and `points-engine` 36/36. I cannot confirm that statement and did not try. Also unverified: the vote-versus-removal race (no test; none of the six scenarios covers two requests at once) and the Playwright suite (not part of PR #742).

6. `docs/check_version_consistency.py` does not exist in the repository (`git ls-files` returns nothing), so it was not run. It exists only in the project documents.

## Recorded, not decided (full list in Section 87c)

- The retention block still stands; the Security session lifts it. Until then an author can hard-delete a removed entry's post and the sweep cannot.
- The vote-versus-removal race has no test.
- The builder's ten adopted defaults (Section 87b) are all veto-able; three more come from #495 itself.
- Schema additions are flagged for the Decision Log and not transcribed.
- The B-300 row's gap cell still describes the state before B-300 (history; not edited).

## Statements now stale (named, not edited; Section 87d)

The Section 69 notes on B-054 and B-042; `docs/backend-content-removal-report.md` section 3 (PR #742 added its own supersession note below it); `docs/contest-spec.md` line 409 is silent on the finalist set changing until Week 4 opens (no sentence in it says a removed entry still ranks); the CLAUDE.md bullet for `backend/b289-content-removal` (contest ranking and points "untouched"). `docs/backend-w7-contest-report.md`: nothing found.

PR opened, not merged. Temi verifies and merges. Do not merge alongside any other unmerged PR touching the Decision Log docx.
