# Report: content-removal decisions of 2026-11-10 (Decision Log #482 to #484)

Branch `docs/content-removal-decisions-2026-11-10-v2`, cut from `origin/main` `7cb1a40`. Docs only. Not merged: Temi verifies and merges. This PR edits the Build Plan docx, so it merges alone.

## What was done

- **Decision Log** (`docs/Soccernity_MVP_Build_Plan_v1.7.docx`, `Document.tables[6]`): three rows added, #482, #483, #484, by deep-copying the last row (#481). Dated pointers appended (old text a prefix) to the Status cell of #478, #475 and #462.
- **Build register** (`docs/build-register.md`): two B-IDs added (B-289 moderator removal of content, W8; B-290 media of a removed post, W5); dated notes appended to the Spec status cell of B-279, B-206, B-283, B-287, B-067, B-284 and B-280; dated notes appended to Section 81b item 2 and Section 82b item 1; Section 7 extended to #484; Section 1, the `Register size` paragraph, the Waves table and the W5 and W8 lists in Section 3 updated; Section 83 added.
- **CLAUDE.md**: one new status bullet, as its own rule asks.
- Not touched: the legal draft, the DPIA, the incident plan, the Log Book, `docs/pending-copy-manifest.md`, any application code.

## The three decisions

| # | Subject | Stated by the founder | Adopted defaults (veto-able) | State |
|---|---|---|---|---|
| #482 | Message retention and legal holds (follows #478, B-287) | An active legal hold on a message's sender, or on any other participant of its conversation, keeps the message out of the 12-month sweep. `bad_faith` and report-derived holds are not covered. | none | BUILT, PR #711 (merged 2026-11-10, `dfedf80`) |
| #483 | Moderator removal of content (new B-289) | Remove Content is enforced for posts, comments and messages; soft (row and text stay for staff); placeholders "This message/comment was removed by Soccernity" for everyone in the thread; a removed post disappears from lists, search, saved items and counts, a direct link answers like a missing post, its author sees a removed notice; only the reported item is removed, never context messages; offered only for post, comment and message targets; suspension, holds, escalation and legal action unchanged. | Removal in the same step as recording; an overturned appeal restores the content; a removed contest entry is hidden with any ranking or points effect unchanged; the author's stub on a direct visit. | DECIDED, NOT BUILT |
| #484 | Media of a removed post (new B-290) | The public copy is withdrawn at once so no link works; the private copy is kept so an overturned appeal can republish it; at confirmation (`reportClosedAt`: appeal window lapsed or appeal upheld) the private copy is deleted too, except media protected by the existing evidence rule (uploader has an active admin hold). B-206 will define evidence set-aside and hooks into the same function. | The two-stage form. | DECIDED, NOT BUILT |

## Checked against the code (read, not run)

- `content_removed` is only a value in the action set (`moderation.constants.ts`) mapped by `moderation.service.ts`. No Post column records a moderator removal; `Comment.hidden` and `Message.deletedForEveryoneAt` are the author's and the sender's own actions.
- `PostMediaObjectsService.withdraw` returns `noop` when `shouldBePublic(row)` is true, so as written it does not withdraw an approved file of a removed post. After approval `finishPublish` deletes the private original: an approved, published file normally has no private copy. B-290 must make and verify one at removal, then delete the public object.
- `reportClosedAt` (`account-hold.rules.ts`) is computed from timestamps, not an event. Nothing fires when the appeal window lapses, so stage two needs a sweep (the B-283 deferred-deletion pattern).
- `rejected-media-evidence.util.ts` protects only REJECTED files, through two arms: an active admin hold (reused here) and an unclosed report (cannot apply at the closure moment, since the report is closed by definition).
- PR #711 is in `origin/main`; its PR text already names this entry as #482.

## Recorded, not decided (details: register Section 83b)

1. Recording `user_suspended` on a report does not suspend the user (unchanged, untouched).
2. Whether a removed post's media must be kept as evidence for statutory reporting stays inside B-206 under counsel; if B-206 sets evidence aside it overrides stage two for that file.
3. Wording of the placeholders and the removed notice (tagged `[COPY PENDING LEGAL REVIEW]` only if it makes a legal or safety promise, #412 item 5); no Figma frame exists for any of them.
4. Whether a removal revokes the points and counters tied to the item; what happens to comments, likes and saves under a removed post.
5. Schema: a removal state on Post, Comment and Message is likely a column beyond Section 3 (Decision Log candidate for the build PR); the PostMedia row after the files go.
6. How an admin who is not child-safety-vetted sees a removed item about a minor.

## Statements these decisions make stale (named, not edited)

The moderation README and `ReportedMessageFields.tsx` ("Moderators can't delete a message yet"); the `backend/b067-message-report` bullet of CLAUDE.md; the `backend/b287-message-retention` bullet and `docs/backend-message-retention-report.md` (already marked superseded by PR #711); the "still undecided" text in B-067 and in Sections 81b and 82b (annotated).

## Reconciliation

- B-IDs: 288 + 2 = 290 (41 with gap frames + 249 without). Waves: W0 61, W1 13, W2 3, W3 16, W4 7, W5 20, W6 7, W7 2, W8 41, W9 57, W10 16, W11 26, W12 21 = 290. Gap frames: 146, unchanged. Main-table rows: 290, each 12 cells, all unique.
- Decision Log: 479 data rows before (#1 to #481, #293 and #294 absent), 482 after (#1 to #484, same two absent, no duplicates); docx table 480 rows before, 483 after.

## Verification

- `git fetch origin`; `gh pr list --state open` returned no open PR before any edit.
- Register compared positionally with `difflib` against the committed file (the blob is LF, the working tree CRLF under `autocrlf`; the edit kept CRLF): the seven noted rows differ in exactly one cell (Spec status) and the old text is a prefix; the other changed lines are the header `Updated` paragraph (old text a prefix), the `Register size` paragraph, three Waves-table lines, the W5 and W8 lists, the Section 7 heading and three inserted rows, the 81b and 82b lines (old text a prefix), two inserted main-table rows after B-288, and the appended Section 83.
- Docx reopened with python-docx and compared with the committed file: all body paragraphs and all tables except table 6 are text-equal; in table 6 only the Status cells of #478, #475 and #462 changed, each by appended text; three rows added; `word/document.xml` is the only differing zip part; `testzip` is clean; Build Plan stays v1.7.
- `docs/check_version_consistency.py` does not exist in the repository, so it was not run. No tests run: docs PR.

## Disclosure

A worktree already existed on the requested branch name (`D:/Projects/soccernity-docs-removal`, a broken index with every file staged as deleted). I left it untouched and used a new worktree and branch name (`-v2`). My first run of the edit script saved the docx before failing on the register (B-279 appears in a later table too); I restored both files from git and re-ran after restricting row lookups to the main table.
