# Report: suspension, message context, report retention, removed contest entries and the removed-message stub (Decision Log #485 to #489)

Branch `docs/suspension-retention-decisions-2026-11-11`, cut from `origin/main` `8fd2b8e`. Docs only. Not merged: Temi verifies and merges. This PR edits the Build Plan docx, so it merges alone.

## What was done

- **Decision Log** (`docs/Soccernity_MVP_Build_Plan_v1.7.docx`, `Document.tables[6]`): five rows added, #485 to #489, deep-copied from the last row (#484). Dated pointers appended (old text a prefix) to the Status cell of #475, #477, #478, #483 and #484.
- **Build register** (`docs/build-register.md`): six B-IDs added (B-291 to B-296, all 0 gap frames); dated notes appended to the Spec status cell of B-279, B-289, B-290, B-286, B-287, B-284, B-206 and B-067; dated notes appended to Section 83b items 1, 4 and 6 and Section 82b items 4 and 5; Section 7 extended to #489; Section 1, the `Register size` paragraph, the Waves table and the W5, W6 and W8 lists in Section 3 updated; the header `Updated` paragraph extended; Section 84 added.
- **CLAUDE.md**: one new status bullet, as its own rule asks.
- Not touched: the legal draft, the DPIA, the incident plan, the Log Book, `docs/pending-copy-manifest.md`, any application code, schema or Figma.

## The five decisions

| # | Subject | Stated by the founder | State |
|---|---|---|---|
| #485 | Suspension on a report (supersedes Section 83b item 1; B-291, B-292, B-295) | Recording `user_suspended` on a report suspends the account in the same step by the user page's path (sign-in blocked, sessions ended, points revoked, guardian of a person under 18 told once); offered only on user, post, comment and message reports; no separate ban state; deletion stays separate and is refused under an active hold; the person is emailed at once for every suspension with a fixed plain-words reason from the report category (generic line for `child_safety_concern`, `other` or none) and how to appeal; reinstatement email; user-page suspension requires a category; appeal path through Contact Us; staff record the appeal for a report suspension (reason, logged, vetting gate, inside the 30-day window, pauses the closure clock, #138 unchanged); an overturned appeal of the suspending report reinstates automatically; points not restored. | DECIDED, NOT BUILT |
| #486 | Message context visibility (amends #477; B-293) | Where the reported sender or any participant is under 18, only child-safety-vetted admins see the attached context and any edited original; others see the reported message plus "Context hidden: this involves a child". | DECIDED, NOT BUILT |
| #487 | Report retention (B-294) | 12 months after closure, 6 years if `concernsMinor`; legal holds, active admin holds on the involved accounts, B-206 evidence and escalated reports sit outside; a sweep hard-deletes removed content (rows and media), then the report; the action log is never touched; a purge that would break another record keeps the report and logs a count; both periods are configuration. 6-year figure unverified for UK law, counsel may confirm, does not hold the build. | DECIDED, NOT BUILT |
| #488 | Removed contest entries (Dev session; no B-ID here) | A removed entry stops competing: leaves the ranking and every tally, earned points revoked, both restored if the removal is overturned. | DECIDED, NOT BUILT; handed to the Dev session |
| #489 | Data export and the removed-message stub (B-296) | Export unchanged; the stub gains `isMine` for the viewer, not `senderId`. | DECIDED, NOT BUILT |

## New register rows (waves are the drafter's choice, veto-able)

| ID | Item | Wave | Agents |
|---|---|---|---|
| B-291 | Suspension on a report, emails, auto-reinstatement, user-page category pick (services/api) | W8 | BE -> QA |
| B-292 | Staff-recorded appeal on a person's behalf (services/api plus the admin dialog, drawn in B-295) | W8 | BE -> FC -> QA |
| B-293 | Vetted-only message context; correct the stale `schema.prisma` comment (services/api) | W8 | BE -> QA |
| B-294 | Report retention sweep (services/api) | W6 | BE -> SG -> QA |
| B-295 | Screens and emails: Figma pass U, then admin and web code | W8 | SB -> FC -> QA |
| B-296 | Removal follow-ups: `isMine` on the stub; the two post-media approval paths | W5 | BE -> QA |

**Gap-frame count.** Design rows with no audit frame of their own count 0 in this register (B-281, B-286 and B-289 were read to confirm this), so B-295 counts 0. No ambiguity was found, so nothing is flagged on this point.

## Every dated note added (old text is a prefix of the new in each)

**Register rows, Spec status cell:** B-279, B-289, B-290, B-286, B-287, B-284, B-206 (the seven the brief named) and **B-067** (found by grep).

**Register lines:** Section 83b item 1 (decided by #485), item 4 (settled by #488 for contest entries only), item 6 (partly settled by #486 for message context and edited originals only); and, found by grep, Section 82b item 4 (answered by #486) and item 5 (answered by #487).

**Decision Log Status cells:** #475, #478, #483, #484 (the four the brief named) and **#477** (found by grep).

## Other lines found by grep (listed, as the brief asked)

A grep of the register and of every Decision Log row for "user_suspended", "does not suspend", "not enforced", "record-only" and "report's own retention" found:

- **Annotated:** B-067 (no admin read of originals), Section 82b items 4 and 5, Decision Log #477 (staff and the original of an edited context message). B-279, B-284, B-289 and Section 83b item 1 already carried the `user_suspended` statement and are annotated per the brief.
- **Named as stale, not edited (Section 84d):** the `sprint-5/admin-users-dashboard-backend` bullet of `CLAUDE.md` ("actioning a report as Suspend User does NOT automatically call it"), the `frontend/b284-admin-message-report` bullet ("Warn User and Suspend User record ... with nothing enforced"), `schema.prisma`'s comment on `Message.originalContentText`, and the DPIA refresh report's statements that reports have no retention clock (R33(c), R34(b), finding 5). The legal draft and the DPIA are not edited by this PR.

## Checked against the code (read from files, not run)

- `ModerationService.actionReport` records `user_suspended` and sends the guardian notice `account_suspended`; it suspends nobody.
- The only path that sets `accountStatus` to `'suspended'` is `AdminUsersService.updateUserStatus`: it ends sessions, revokes engagement points, writes the audit row and notifies the guardian. Its DTO takes a status only, so no category.
- `AuthService.login` answers the generic `Invalid credentials` for a non-active account; no email goes to a suspended person. `ModerationService.appealReport` accepts an appeal only from the reported user, who cannot sign in.
- No job deletes a `Report`; no report retention setting exists; `reportClosedAt` is a computed predicate with no trigger.
- The removed-message stub has no sender; the two post-media publish paths do not check whether the post is removed; the admin report detail returns context and edited originals to any admin allowed on the report (the gate keys off `concernsMinor`, DPIA R33(f)); `schema.prisma` still says there is no admin read of `originalContentText`.

## Flagged, not decided (details: register Section 84b)

1. **The category-to-plain-words map** for the suspension email and both emails' wording: only the generic line is given.
2. **Who decides a staff-recorded appeal.** #138 needs a second reviewer; the recorder is not necessarily the original reviewer.
3. **Overlapping suspensions** (two reports, or a user-page and a report suspension) and a manual reinstatement while another report's appeal is pending.
4. **The causing-report column** is beyond Section 3's `User` list: a Decision Log candidate for the build PR.
5. **#487:** the 6-year figure's legal basis; which accounts count as "the involved accounts"; the sweep schedule, batch size and deletion order.
6. **#486:** how "under 18" is read (assumed the stored `isMinor` flag); what a non-vetted admin sees of the edited original of the reported message itself.
7. **#488** is the Dev session's: no B-ID is added here; how points already revoked are restored is not stated.
8. **B-296's post-media item** is the drafter's inclusion from the open gap in the B-290 report, not a founder statement.
9. **Register status lag (not edited here).** The B-289 and B-290 main-table rows still say NOT BUILT, although PR #714, #715, #716 and #719 are merged on `origin/main`. A status roll-forward pass should record them; this PR only appended dated notes.
10. **B-292 split.** The brief put "services/api plus admin screen" in B-292; the admin dialog's Figma frame is drawn in B-295, so B-292 depends on B-295 for the Figma leg while B-295 depends on B-291, B-293 and B-296 (no cycle).

## Verification

- `gh pr list --state open` returned no open PR before any edit, so none edits the docx or the register. Branch cut from fresh `origin/main` `8fd2b8e`; #484 was the last Decision Log row, B-290 the last B-ID, Section 83 the last register section.
- **Docx** (python-docx, cell level, against `origin/main`): same tables and paragraphs; the only existing cells that changed are the Status cells of #475, #477, #478, #483 and #484, each with the old text as a prefix; five rows added (487 data rows after, 482 before; #1 to #489 with only #293 and #294 absent; no duplicate number; numbers sequential); every other table and paragraph text-equal; `word/document.xml` is the only zip part whose bytes differ; `testzip` is clean; the Build Plan stays v1.7.
- **Register** (positional `difflib` against `origin/main`, CRLF in the working tree, LF in the index): 23 existing lines changed, all intended: the header `Updated` paragraph (old text a prefix), the `Register size` paragraph, four lines of the Waves table (W5, W6, W8, Total), the W5, W6 and W8 lists, the Section 7 heading, the eight noted rows (exactly one cell differs in each, the Spec status cell, old text a prefix), and five annotated lines of Sections 82b and 83b (old text a prefix); 11 lines inserted (six rows after B-290, five Section 7 rows) plus Section 84 appended. Every other line is byte-equal.
- **Reconciliation:** 296 B-IDs (41 with gap frames + 255 without; was 290); all 296 appear in exactly one wave list; the wave counts sum to 296 (W0 61, W1 13, W2 3, W3 16, W4 7, W5 21, W6 8, W7 2, W8 45, W9 57, W10 16, W11 26, W12 21); gap frames 146 unchanged; every first-table row has 12 cells; every B-ID and Decision Log number cited exists.
- Only the four files named in the brief changed (`docs/Soccernity_MVP_Build_Plan_v1.7.docx`, `docs/build-register.md`, `CLAUDE.md`, this report). `docs/pending-copy-manifest.md` is untouched. `docs/check_version_consistency.py` does not exist in the repository, so it was not run. No tests run: docs PR.
