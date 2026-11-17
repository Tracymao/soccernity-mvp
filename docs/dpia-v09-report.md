# DPIA v0.8 to v0.9: report

**Scope.** `docs/sprint-1-dpia-outline-draft.md` only. Branch `legal/dpia-v09-counsel-refresh`, cut from fresh `origin/main` `014afcd4c8d507ba70307542fc69767669f4b491` (after PR #808).
**Status.** DRAFT. Not approved, not legal advice. The Section 6 sign-off block is untouched and empty. Nothing in this pass completes, advances or approves the DPIA, closes a risk, or re-rates a risk. No new risk was added.

## What was NOT verified

- Nothing was run (docs only). CI cannot be read from here.
- The Security session was not asked (this session is non-interactive) whether it has an open PR on this file.
- Every built-behaviour statement is read from merged reports and the Decision Log text, not tested by this pass.
- The three founder statements "only vetted authorised staff open such files", "staff welfare and vetting is the founder's HR duty" and "the founder will cooperate fully if law requires more" come from the brief. I did not find them as a Decision Log row, and R8 update point 3 says so.

## Changes, with line numbers (in the v0.9 file)

| Line | Change | Before (short) | After (short) |
|---|---|---|---|
| 30, 34, and the Drafted-by line | Header | Version 0.8; "v0.3 to v0.8 likewise"; sprint/PR list ends at v0.8 | Version 0.9; "v0.3 to v0.9 likewise"; adds `legal/dpia-v09-counsel-refresh`; "revised 2026-11-17 (v0.9)" |
| 36 to 55 | New changelog v0.8 to v0.9 | none | Includes the "what this update is, stated plainly" paragraph: narrow refresh, re-rates nothing, closes no risk, completes nothing, §6 empty |
| 82 | v0.8 changelog item 3 | "...B-206 is not decided here..." | Adds `[v0.9 CHANGED — #524, #529, #532]` supersession marker; old text kept |
| 1181 | R6, "Known discrepancy in the sibling document" | Said one document is wrong | Adds marker: legal draft v0.16 line 1073 now says relationship is not retained, matching the code (item 17) |
| 1209 | R8: new "Update to R8, v0.9" | v0.8 update said the founder turns the switch on only after counsel answers B-206 | Five points: (1) that condition superseded (#524, reversing #501); (2) review model stated as decided and built (#430 item 1); (3) reporting path built, profile pictures and covers included (#525, #530); (4) what does not exist: until the founder registers with a receiving body a vetted admin has no prepared route to file (#529, founder's own risk, not counsel's view), detection decided and not built (#526), PhotoDNA and the Cloudflare tool dropped; (5) counsel's non-blocking list (#532), no answers suggested |
| 1232 | R9 | Text predates `concernsMinor` and vetting | Marker only: set-aside restricted to vetted admins; HR duty statement; no re-rating |
| 1452 | R36, escalated reports (first place) | "escalated (kept until counsel answers B-206)" | Adds marker: rule unchanged, nothing waits for counsel, evidence retention past 365 days is on the non-blocking list |
| 1783 | R36, escalated reports (second place) | same wording | same marker |
| 1735 | R35 v0.8 update, item 5 | "The founder turns the switch on only after counsel answers B-206" | Adds supersession marker (#524, #529, #532); switch behaviour unchanged |
| 1871 | §4 R1-residual row | v0.3 finding: no guardian≠child check, no second step | Marker: both built; adequacy is item 24 (resolved, row 29) |
| 1880 | §4 R8 row | "non-user parent has no route to report a photo of their child" | Marker: `POST /reports/public` exists, set-aside exists; no route specific to a depicted photo |
| 1926 to 1940 | New "Section 5 summary" table above the §5 table | none | Counts A/B/C/D with item lists, plus the line that A items are the ones carried into the counsel pack and nothing else |
| 1949 to 2015 | §5 | 51 items, no dispositions | A `[v0.9 DISPOSITION: X — reason]` marker on every item, no renumbering, nothing dropped. Items 25, 26, 34 and 50 had their status rewritten (previous status kept in the same cell); item 50's title carries a supersession marker; items 10, 11, 17 carry a "v0.9 CHANGED" note inside the disposition |
| 2057 | Closing notes | v0.8 note first | New v0.9 italic note above it |

## Disposition table

Counts: **A 14, B 13, C 10, D 14, total 51.** Item 3 is counted as A (transfer assessment open) with its hosting sub-part resolved (C, Frankfurt, Decision Log #391).

| Item | Disp. | Reason (source) |
|---|---|---|
| 1 | C | #4 signed off; Part C rows 1, 28, 29 |
| 2 | C | ToS 2.1/2.2, #8, #19 |
| 3 | A | transfer assessment open (Part C row 20); hosting part C (#391) |
| 4 | C | auth provider #7; social sign-in decided and removed #479 |
| 5 | C | Highlightly, #6 |
| 6 | C | Part C row 3 |
| 7 | C | Part C row 4 |
| 8 | A | consent-withdrawal adequacy (built, PR #261, no counsel view) |
| 9 | D | founder's mapping; see "unclear" |
| 10 | D | Part C row 8, product matter; route now built (`POST /reports/public`) |
| 11 | D | HR duty; vetting mechanism built (#491, #498) |
| 12 | A | data-subject rights, erasure, `MediaAsset` FK gap |
| 13 | A | residual risk rating, Article 36 |
| 14 | D | founder reconciliation against Build Plan 8.1 |
| 15 | D | version drift housekeeping |
| 16 | A | 6-month consent-evidence retention, Nigeria cross-check (Part C row 14) |
| 17 | D | reconciled: legal draft v0.16 line 1073 matches the code |
| 18 | B | #350 |
| 19 | D | #346, #363 product/engineering |
| 20 | A | age-sweep retention and related questions |
| 21 | A | anonymisation design, Article 17 |
| 22 | C | Part C row 28 |
| 23 | A | Article 8 / national capacity; table is recollection |
| 24 | C | card verification, Part C row 29 |
| 25 | D | built: guardian≠child check and second step |
| 26 | D | built: `below_minimum_age` (#407 item 2) |
| 27 | C | row 29; see "unclear" |
| 28 | A | legal propositions in 2.5/2.6 unverified |
| 29 | B | #478 |
| 30 | B | #482, #477 |
| 31 | B | #477, #486 |
| 32 | A | messages not end-to-end encrypted |
| 33 | B | #483 (and #488) |
| 34 | A | rewritten: removed-post media window; B-206 questions, non-blocking |
| 35 | B | #485 |
| 36 | B | #494, #503 |
| 37 | C | B-292 and B-298 built, #492; see "unclear" |
| 38 | D | register Section 84b |
| 39 | A | 6/7-year split vs counsel's recorded range (#490) |
| 40 | B | #482, #496, #498, #499; see "unclear" |
| 41 | B | #486, #491, #498 (numbers proposed by me); see "unclear" |
| 42 | A | dismissed/bad-faith report fit to the range |
| 43 | D | engineering/founder (no field encryption, no read log, backups) |
| 44 | D | register Section 85c |
| 45 | D | #498, #499 |
| 46 | B | #503 |
| 47 | B | founder's mapping; see "unclear" |
| 48 | B | #500 |
| 49 | B | #498, #499, #496 |
| 50 | A | rewritten per #524, #525, #526, #529, #530, #532 |
| 51 | D | builder's question, nothing built |

## Unclear, founder to say

I did not change your mapping on any of these; I could not verify one way or the other, or the evidence is soft.

1. **Item 2 (C):** #8 and #19 are logged as resolved, but I found no row recording counsel's sign-off specifically for the minimum age.
2. **Item 9 (D):** the status text says the TTL value and approach "still need review". Counsel was asked whether it is adequate. If that is still a counsel question it belongs in A.
3. **Item 27 (C):** Part C row 29 is general. It does not obviously name the three sub-points (direct-notice content of the consent email, a parent data-review route, separate consent to third-party disclosure). If any of those needs a counsel view, say so.
4. **Item 37 (C):** the appeal routes are built (B-292, B-298, #492), but that is a build fact, not a legal sign-off.
5. **Item 40 and 47 (B):** each item's own text says "recorded, not decided" and the register (Section 85c) says the same. B means "founder decided", so please confirm a decision exists.
6. **Item 41 (B):** you gave no Decision Log numbers. I cited #486, #491, #498.
7. **Item 3 (A with a C part):** counted once, as A.
8. **Founder statements from decision 4/5 of the brief** (vetted staff only, HR duty, will cooperate fully): not found as a Decision Log row. R8 update point 3 says so.

## Statements changed because the build contradicted them

- v0.8 changelog item 3, R8 v0.8 update, R35 v0.8 update item 5, §5 item 50: "uploads off until counsel answers B-206" (superseded by #524).
- R36 (two places) and §5 item 34: "escalated, kept until counsel answers B-206" (rule unchanged; nothing waits for counsel).
- R6 "Known discrepancy" and §5 item 17: legal draft now matches the code.
- §4 R1-residual row and §5 items 25, 26: built since v0.3.
- §4 R8 row and §5 item 10: a public report route exists.
- §5 item 11: vetting mechanism exists.

## Stale statements found and LEFT

Left because they are history, or because correcting them was outside this brief:

- Line ~484: "Hosting and data location are not yet decided — Decision Log #9" (decided: #26, #391). Item 3's marker covers the hosting part.
- The two "still stale" lists in the v0.4 and v0.5 changelogs (around lines 150 to 158 and 188 to 196).
- The §2.6.3 findings (around lines 221 to 227 and 880): about the guardian email check and the second step. The built state is recorded in the §4 row and item 25 markers.
- The R9 body text still describes the model before `concernsMinor` and vetting existed (a v0.9 marker was added instead of a rewrite).
- Item 1's status text still says "OPEN" ahead of its disposition marker (C); the marker is the current position and the older status is kept as history.
- Other drafts (legal draft, incident plan, post-media addendum) may say uploads wait on counsel. Not touched.

## Not touched

Build Plan docx, `docs/build-register.md`, `docs/pending-copy-manifest.md`, the runbook, `docs/deployment.md`, code, Figma, any other draft. No new customer-facing wording was written, so nothing needed a `[COPY PENDING LEGAL REVIEW]` tag.

## Verification done

- File is UTF-8, 2,104 CRLF line endings and 0 bare LF (checked), 0 replacement characters.
- 51 disposition markers (53 occurrences of the phrase including two in the changelog and summary).
- Summary-table counts recomputed from the same mapping used to write the markers (A 14, B 13, C 10, D 14).
- Every edit was applied by an asserted exact-match replacement; each matched exactly once.
