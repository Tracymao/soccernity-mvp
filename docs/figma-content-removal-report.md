# Figma: content removed by Soccernity (Decision Log #483, build-register B-289)

Figma and docs only. No application code, schema, legal text, Build Plan docx, Decision Log or `docs/build-register.md` changed. No suite run. Date: 2026-11-10. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`, light mode, 390 px mobile and 1440 px desktop.

Written for: the `figma-to-code` agent that builds these next, and the founder who reviews the frames.

## 1. What was drawn

19 new top-level frames, each with a text label 48 px above it, a band title and one SCOPE OPEN note frame. Everything sits in a clear band below the existing canvas (existing content ended at y 306,163): rows at y 310,000 (mobile), 311,300 (desktop), 312,700 and 314,200 (admin). The note frame is at x -1,200, y 310,000. Every frame is a clone of a real frame with the removed treatment applied (nothing existing was edited, archived or deleted).

**The placeholder.** One treatment everywhere, deliberately not the "This message was deleted" look (white bubble, plain secondary-colour text): a `brand/green-tint` fill, no border, a 14 px slashed-circle icon (strokes bound to `brand/navy`) and the label in `color/text/primary`, Montserrat Medium. Nothing is italic.

### Mobile (390 wide)

| Id | Frame | State |
|---|---|---|
| M1 `7034:59391` | Message — Removed By Soccernity — Seen By The Other Person (Mobile) | the message in a thread, left-aligned (clone of B8 `6978:47446`) |
| M2 `7034:59438` | … Seen By The Sender (Mobile) | same, right-aligned (clone of B9 `6978:47489`) |
| M3 `7034:59485` | Message — Inbox — Removed Message Preview (Mobile) | last-message preview of the first conversation (clone of `5709:8354`) |
| M4 `7035:59629` | Community — Post View — Removed Comment (Mobile) | first comment replaced (clone of `5779:8490`) |
| M5 `7035:59686` | Post — Removed By Soccernity — Notice For Its Author (Mobile) | author on a direct visit (clone of `7015:58735`) |

### Desktop (1440 wide)

| Id | Frame | State |
|---|---|---|
| D1 `7034:59555` | Message — Removed By Soccernity — Seen By The Other Person (Desktop) | thread plus the list preview in the left pane (clone of `6979:48733`) |
| D2 `7034:59758` | … Seen By The Sender (Desktop) | right-aligned |
| D3 `7035:59818` | Community — Post View — Removed Comment (Desktop) | post and comments in a 796 px column |
| D4 `7035:59699` | Post — Removed By Soccernity — Notice For Its Author (Desktop) | clone of `7015:58744` |

### Admin (1440 x 1184, clones of `7011:57380`)

| Id | Frame | Actions row |
|---|---|---|
| A1 `7036:59847` | Report detail — post target | Dismiss Report, **Remove Content**, Warn User, Suspend User, Reporter acted in bad faith, Legal hold |
| A2 `7036:60017` | comment target | same six |
| A3 `7036:60187` | message target | same six |
| A4 `7036:60357` | user target | five (no Remove Content) |
| A5 `7036:60527` | Banter room target | five |
| A6 `7036:60697` | team target | five |
| A7 `7036:60867` | fixture target | five |
| A8 `7036:61037` | post, after Remove Content | the two case-level buttons only |
| A9 `7036:61215` | comment, after Remove Content | same |
| A10 `7036:61393` | message, after Remove Content | same |

After the action (A8 to A10) an F2 `Pill` instance (`Tone=Strong`) reads "Content removed" under Type in the Reported content card, Status reads "Actioned" and an "Action taken: Content removed" row is added to Report details. The take-action buttons and the first callout are gone; the heading becomes "CASE-LEVEL ACTIONS" and the bad-faith and legal-hold buttons stay. The removed text stays visible to the admin (as it does today for a message report).

Labels, band title and note: `7034:59956` to `7034:59960`, `7035:59977` to `7035:59980`, `7037:60950` to `7037:60959` (labels), `7037:60960` (band title), `7037:60961` (note).

## 2. New copy and tags

Each is tagged inline, in the same text node, as a smaller "[COPY PENDING LEGAL REVIEW]" segment (9 px; 10 px on the post heading):

* "This message was removed by Soccernity" (M1, M2, M3, D1, D2)
* "This comment was removed by Soccernity" (M4, D3)
* "Soccernity removed this post." (M5, D4)

Admin wording ("Content removed", "Action taken", "Actioned", "CASE-LEVEL ACTIONS") is functional and untagged. The existing tagged callout on the case-level actions is unchanged.

## 3. Standing checks (Decision Log #404 item 14)

* Top-level nodes on page `0:1`: 1,767 before, 1,807 after (+40: 19 frames, 19 labels, 1 band title, 1 note). A concurrent session did not add nodes during the pass.
* Hash (djb2 over the ordered ids) of the first 1,767 top-level nodes before and after: `3356273153`, identical.
* Paints on the 20 authored subtrees: 1,920 solid fills and strokes, 1,910 bound to variables, 10 unbound. All 10 are `Rectangle 223` inside the Admin Shell instance of the ten admin frames (the known literal sidebar wash, Decision Log #199). The icon strokes, the tint fills and the note frame are all bound.
* No new colour, no `brand/green-tint-28`, no new variable or style. Tokens used: `brand/green-tint`, `brand/navy`, `color/text/primary`, `color/text/secondary`, `color/background/surface`, `color/icon/inactive`.
* Overlaps: 0 between the new nodes, 0 against the 1,767 existing top-level nodes.
* Nothing deleted, renamed, hidden or archived.

Screenshots in `docs/figma-content-removal-screens/` (M1 to M5, D1 to D4, A1, A4, A7, A8, A10) were each looked at. A2, A3, A5, A6 and A9 come from the same builder code as A1/A4/A7/A8/A10 and were not viewed individually.

## 4. Decisions made here (default, veto-able) and open points

1. The comment placeholder drops the author name and initials (same as the deleted message). The "Comments · 25" count is drawn unchanged; whether it falls is not decided.
2. The removed-post notice is for the author only. Everyone else keeps the ordinary "Post not found" (`7015:58735`). Not drawn: the author's Posts tab, and any notification that a post was removed.
3. A removed message looks the same to the sender and to the other person.
4. The list preview is drawn on two lines only so the tag is visible; the shipped preview is one truncated line.
5. Assumed, needs backend confirmation: the admin keeps seeing the removed text on post and comment reports, as on message reports today.
6. Whether a removal can be undone is not decided; no undo control is drawn.
7. The first build of M1/M2/D1/D2 collapsed the bubble width (the bubble hugged its content); fixed in the same session to the original 276/358 px widths.
