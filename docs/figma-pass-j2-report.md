# Figma pass J2 - Contest notification rows in the Notification Centre

Agent: figma-design-system. Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, legal copy, DPIA or `.docx`. Existing notification-list frames only; no new screens.

Source: `docs/contest-spec.md` section 14e (Decision Log #404 item 16, the eight Contest notification events a-h) and the existing Notification Centre feed frames (Decision Log #279, #290, #291). Register row touched (status line added): B-121 (partly done, see section 5). No B-ID added or removed.

Routing note: build-register B-121 lists the agent as SB (figma-screen-builder). This pass was dispatched to figma-design-system and only adds rows to existing lists, so it fits the retouch boundary. Flagged, not silently followed.

## 1. Canvas audit (standing check, Decision Log #404 item 14)

No whole-canvas `get_metadata` was run. Top-level `findAll` counts and a hash of the top-level ids, before and after.

| Check | Before | After |
|---|---|---|
| Top-level nodes on `0:1` | 844 | 846 |
| Hash of the 844 original top-level ids (new ids excluded; hash = djb2 over the comma-joined ids, 32-bit signed) | -473125444 | -473125444 (identical, same order) |
| `findAll` nodes in `5640:7815` (desktop feed) | 211 (derived: after minus the 8 new subtrees, 133 nodes) | 344 |
| `findAll` nodes in `5643:8003` (mobile feed) | 125 (derived the same way, 133 nodes) | 258 |

Limits of the before figures: the per-frame counts were not taken before the first write, so they are derived by subtraction. The top-level hash and count were taken before. Every write script of this pass touched only the new rows, the two list frames they were appended to, and two new note frames; nothing else on the page was written. Nothing was deleted from the canvas. Two throwaway row clones made while sizing the mobile rows (first try on the one-line template) were removed in the same script; top-level count (846 = 844 + 2 notes) shows nothing stray was left.

## 2. What was built

Eight Contest rows were added to each of the four existing lists, desktop and mobile:

- `5640:7918` List - Unread, `5640:7941` List - Read (desktop feed `5640:7815`)
- `5643:8040` List - Unread, `5643:8063` List - Read (mobile feed `5643:8003`)

The rows are appended after the existing rows (the Decision Log #279 pattern). The list frames and `Content` are auto-layout, so the feed frames grew by themselves: desktop 1426 to 2130, mobile 1286 to 1970. Nothing below them moved (the strip under each frame was checked: no node within 500 px).

There is no Notification Row component in the file (the rows are plain auto-layout frames), so each row is a clone of an existing row of the same state, which inherits every variable binding. Unread rows are clones of the "fixture scheduled [unread]" and "new message [unread]" rows; read rows are clones of "contest win [read]" and "result logged [read]". The icon disc is the existing `carbon:trophy` frame, cloned from "contest win [read]" (desktop `6438:16`, mobile `6443:40`) onto the unread templates. On mobile the one-line or two-line template is chosen by measuring the wrapped text.

| Event (spec 14e) | State | Row text (functional wording, [COPY PENDING LEGAL REVIEW]) | Desktop row | Mobile row | Tap target (desktop / mobile) |
|---|---|---|---|---|---|
| e. Reveal | unread | Contest - The final is live | `6729:27844` | `6729:27990` | Community feed, Final week showcase `6661:26929` / `6661:29200` |
| b. Votes-closing reminder | unread | Contest - voting for week 1 closes at 20:00 today | `6729:27863` | `6729:28032` | Contest Voting `2094:994` / `5802:8726` |
| a. Week opens | unread | Contest - week 1 is now open for entries | `6729:27882` | `6729:28066` | Contest details `2155:1062` / `5801:8635` |
| c. Week result | unread | Contest - week 1 results are in | `6729:27901` | `6729:28085` | Leaderboard Contest tab, Week 1 winners in `5556:7426` / `5561:7483` |
| d. Final qualification | unread | Contest - you are a finalist; your entry stays hidden until the reveal | `6729:27920` | `6729:28127` | Create Post > Contest, Upload Open `6660:28736` / `6660:35662` |
| f. Final result (winners) | read | Contest - final result: the winners are announced | `6729:27939` | `6729:28162` | Leaderboard Contest tab, Crowned `5524:7836` / `5541:7750` |
| f. Final result (no winner) | read | Contest - No winner this month | `6729:27956` | `6729:28181` | Leaderboard Contest tab, No Winner This Month `6659:26636` / `6659:27348` |
| h. Finalist upload reminder | read | Contest - upload your final entry before the window closes | `6729:27973` | `6729:28214` | Create Post > Contest, Upload Open `6660:28736` / `6660:35662` |

(The canvas text uses the existing em dash, as in "Contest - you placed 1st this week"; shown as a hyphen here only to keep this file ASCII.) "The final is live" and "No winner this month" are quoted from `docs/contest-spec.md` section 14e; "your entry stays hidden until the reveal" restates the spec table row d. The other lines are new functional wording and carry the tag in the notes below. The text is styled like the existing contest row: the lead word "Contest" Inter Semi Bold, the rest Inter Regular, fill bound to `color/text/primary`.

Tap targets: each row frame has one `ON_CLICK` reaction, `NAVIGATE` to a visible top-level frame. All 16 were read back from fresh handles (trigger, navigation type, destination id, destination top-level and visible). The first write left the cloned row text all Semi Bold; that was fixed in place (lead word Semi Bold, rest Regular) and the segments were read back.

On-canvas notes (clones of the Pass E note frame `6664:27227`, bound to the same tokens):

- `6730:27844` NOTE - Contest notification rows (B-121) (W0 pass J2), under the desktop feed at y 16630: the COPY PENDING LEGAL REVIEW tag, the tap-target map, three SCOPE OPEN points (final-is-live destination; personal winner row and the "1st" wording; trophy-only icon, illustrative times, unverified-email accounts).
- `6730:27853` NOTE - Contest notification rows Mobile (B-121) (W0 pass J2), under the mobile feed at y 16470.

## 3. Copy

New guardian-/minor-facing wording is tagged `[COPY PENDING LEGAL REVIEW]` on the note frames (the frame-level convention of earlier passes), not inside the row text. Of the eight lines, five are new wording (voting closing, week opens, week result, final result winners, upload reminder), one restates the spec (finalist), and two are quoted from it; the note tags all eight because every one reaches minors. No new tone was invented; the wording is the shortest functional phrasing of the event in the spec. Row times ("Just now", "1 hour ago", ...) are illustrative sample values, matching the existing rows, and do not describe one contest cycle.

## 4. Audit of authored nodes

- 16 rows + 2 notes: 288 solid paints counted. 144 are unbound, and all 144 are inside the cloned `carbon:trophy` frame (9 internal boolean-operation input shapes x 16 rows, checked by node id: 144 inside, 0 outside). This is the inherited debt Decision Log #279 already disclosed: the outer boolean-operation node carries the bound `brand/navy` fill and is what renders; the inputs are non-rendering remnants. Not force-bound.
- 0 unbound paints anywhere else on the new rows or notes (disc fill `brand/green-tint`, row fills `brand/green-tint` / `color/background/surface`, dot `brand/green`, text `color/text/primary` / `color/text/secondary`).
- 0 `brand/green-tint-28`, 0 new colours, Light mode only, no black, no red.
- 0 overlaps of the grown feed frames or the two notes with any visible top-level node.
- Screenshots of both feed frames and the desktop note were checked: rows align with the existing rows, mobile rows wrap to at most two lines (a three-line variant of the upload reminder was shortened first), icon discs match.

## 5. Not done, and the B-121 difference

B-121 as written is wider than this brief. Left for a later pass (the register row stays open):

- Read and unread versions of every event. Each event is drawn in one state (five unread, three read).
- A separate personal "week winner" row (spec event c, second sentence). The existing row "Contest - you placed 1st this week" is the only one.
- An icon-disc treatment per type. All eight use the trophy.
- The Design Notes frame `5644:8023` (the DL #279 note) was not edited; the new notes are separate frames.
- The page subtitle ("Follows, likes, comments, messages, fixtures, results and Contest wins.") and the Unread badge count (3) were not changed.
- The empty-state frames `5642:7898`, `5642:7997` are unchanged.

## 6. Decision Log candidates

1. Destination of "The final is live": the carousel in the Community feed (chosen) or the leaderboard Contest tab live ranking (`5524:7512`). The spec names no destination per event.
2. B-123 describes link targets (reveal and final to the leaderboard Contest tab, winners to the finalist's profile; week opens and result to /contest or /leaderboard?tab=contest) that differ from the targets drawn here (final result to the Crowned / No Winner leaderboard frames, no profile link). Which set is final, and whether the week-result and final-result rows may open a profile.
3. Personal winner notification (spec event c): a separate row, or the existing "Contest - you placed 1st this week" row. The existing text says "1st" while the backend keys contest_win to the cycle only (Decision Log #291).
4. Whether the finalist upload reminder (spec h, a default added by Claude) and the qualification row (d, timing ASSUMED) open the same destination, the Upload Open frame. Both do here.
5. Per-event icon discs. The register asks for an icon-disc treatment per type reusing existing file icons; all eight rows share the trophy, which makes the eight rows differ by text only.
6. Whether the rows should be a real Notification Row component with state variants (read/unread, type) instead of cloned frames. No Notification Row component exists; B-123's one row component per type would benefit.
7. Whether an account with an unverified email receives these (spec item 16 open point, not stated).
8. Whether "Contest" as the lead word is right for events that are about the Contest weeks (all eight rows lead with it, matching the existing contest row).
9. Subtitle and Unread badge text of the page are stale against ten unread rows (the badge already read 3 over five unread rows before this pass).
10. The register routes B-121 to figma-screen-builder; this pass ran under figma-design-system (see the routing note).
