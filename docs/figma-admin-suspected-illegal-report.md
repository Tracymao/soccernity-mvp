# Figma: admin Suspected illegal imagery frames (B-206)

Figma and docs only. No application code, tests, schema, legal drafts, counsel pack, pending-copy manifest or Build Plan docx changed. No Decision Log row (nothing here is a decision; see "Adopted defaults").

## 1. Handshake

- Branch `design/admin-suspected-illegal-imagery`, cut from `origin/main` `e5184241` (includes PR #856 counsel pack v1.2 and PR #857 admin Change password frames). No open PRs when checked.
- Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Nothing existing was edited, moved or archived.
- Register: next free section was 114 (113 was taken by the Change password frames). Section 114 and a dated line on the B-206 row were added.

## 2. What was drawn

The admin screens built in PR #803 and PR #807 had no Figma frame (five code comments still say so, see section 7). 21 frames plus one Notes frame, all named "Admin — Suspected illegal imagery — <name>", 1440 wide, Light mode, on the Admin Shell set (Active = Moderation).

List screen, row at y 331600 (x step 1640):

| Id | State | Node |
|---|---|---|
| L1 | Not filed (default) | `7074:64435` |
| L2 | All filter | `7075:65405` |
| L3 | Empty | `7075:65573` |
| L4 | Loading | `7075:65747` |
| L5 | Load error | `7075:65920` |
| L6 | Restricted (vetting) | `7075:66097` |
| L7 | No access (role) | `7075:66272` |

Detail screen, row at y 333400 (x step 1640):

| Id | State | Node |
|---|---|---|
| D1 | Not filed | `7077:65267` |
| D2 | Record filed | `7080:65413` |
| D3 | Decided not to file | `7080:65638` |
| D4 | Filed form validation | `7080:65854` |
| D5 | Not-filed form validation | `7080:66073` |
| D6 | Saving | `7080:66259` |
| D7 | Save error | `7080:66457` |
| D8 | Already decided | `7080:66657` |
| D9 | No suggested body | `7080:66877` |
| D10 | Loading | `7080:67474` |
| D11 | Record not found | `7080:67649` |
| D12 | Could not load | `7080:67834` |
| D13 | Restricted | `7080:68021` |
| D14 | No access | `7080:68204` |

Notes frame `7080:68387` ("Notes — Suspected illegal imagery admin", x -1200, y 331600): eight notes (six SCOPE OPEN, one DECISION LOG CANDIDATE, one `[COPY PENDING LEGAL REVIEW]`).

Reference PNGs of the built screens: `docs/b206-admin-screens/01..07`.

## 3. Components used

Admin Shell set `6014:12948`, F2 Button, Pill, Field, Callout, Banner, Note. Tokens only, no new colour. `semantic/alert` appears only as an accent bar or border. Destructive and decision buttons are navy.

## 4. Strings

Tagged strings, verbatim:

- "These suggestions are pending counsel. None of them is approved or confirmed. [COPY PENDING LEGAL REVIEW]"
- "A report to a receiving body must be made with that body, outside Soccernity. This page does not send anything. It only records that a report was made, or that it was decided not to make one. [COPY PENDING LEGAL REVIEW]"

All other wording is copied from the built screens, except D13's body text, which is my wording and was not verified against the code. Sample values on D2 to D8 are illustrative.

## 5. Prototype links

43 reactions, all read back. List "Open" buttons go to D1, D2, D3 (`7074:64463`, `7074:64474`, `7074:64485`). Every detail frame's "←" back link goes to L1. "Record that this was filed" goes to D2 and "Record a decision not to file" goes to D3 in D1, D4, D5, D6, D7 and D9.

Not linked: rows on L2 to L7; back links on L2 to L7 ("← Media review" leaves this scope); form buttons on D2, D3, D8 and D10 to D14 (absent by design); "Open the review item" and the signed file link (plain text).

## 6. Adopted defaults (founder-veto-able)

- Card titles are drawn in capitals; the code uses sentence case.
- D6 (saving), D8 (already decided) and D9 (no suggested body) are derived states, not standalone code screens.
- Fields are F2 Field instances; the code uses a native select and `datetime-local`. Open pickers are not drawn.
- The Field instances show an empty Helper row, left as is.
- Profile pictures and covers use the same page and have no separate frames.
- "Open the review item" is plain text, not a link.

## 7. Open points and stale comments

- D13's body wording needs confirming against the code.
- Whether suggestions may ship before counsel answers is a founder call.
- Stale "NO Figma frame exists" comments, not edited (code is out of scope): `apps/admin/src/pages/media-review/MediaReviewItemPage.tsx:24`, `.../media-review/SetAsideDialog.tsx:2`, `.../media-review/suspectedIllegal.css:1`, `.../suspected-illegal/SuspectedIllegalDetailPage.tsx:2`, `.../suspected-illegal/SuspectedIllegalListPage.tsx:1`.

## 8. Standing check

- Top-level nodes: 22 new frames and notes are mine; the count rose from 1,864 to 1,894 because other sessions added eight more. Originals were 1,871 before my work and 1,872 excluding mine (another session added "Notes — Admin change password" `7074:64422`).
- The id-hash function differs from the earlier baseline (3180746466), so the new value 3213786054 is not comparable with it; the comparison rests on id counts and on no existing node being touched.
- Every new frame has exactly one unbound visible solid paint, the inherited Admin Shell `Rectangle 223` (Decision Log #199). The Notes frame has none.
- 0 overlaps against any top-level node; heights are at least 1184 on frames.
- Screenshots: the Notes frame and D2 were compared after linking; the other frames were screenshotted while building but not all individually re-compared afterwards.

## 9. Not done

No code, no tests, no Playwright, no CI read. Nothing merged.
