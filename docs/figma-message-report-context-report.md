# Figma: optional "Add messages for context" step in Report a message, and the admin "Messages around the reported one" section (Decision Log #477, B-286)

Figma and docs only. No application code, schema, legal text, DPIA, Build Plan docx, `docs/build-register.md` or `docs/pending-copy-manifest.md` changed. Date: 2026-11-09. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`, light mode, 390 px mobile, 560 px desktop dialog, 1440 px admin.

Written for: the `figma-to-code` agent that builds this next, and the founder who reviews the frames.

Source of the rule: Decision Log #477 (a reporter may add up to 10 messages before and 10 after the reported message when filing a message report; the 10 and 20 are an adopted default). I read it from `docs/build-register.md` (B-286, Section 82); I did not read any API route or field, because none is on `origin/main` for this yet. The frames follow the brief.

## 1. Node map

All new nodes sit in a clear band below every existing node (existing content ended at y 299,611; the new band starts at y 300,650). Each frame has a `Label — …` text 48 px above it, wrapped to the frame width.

### Report flow, user side (clones of the report dialog frames `7011:56982` mobile and `7011:57155` desktop, so the scrim, the dialog fill, radius and shadow are inherited)

| Id | Frame | State |
|---|---|---|
| `7025:59162` | Context step — Mobile — 01 Default — none selected | 0 of 20 selected, "Include the messages shown" available |
| `7025:59413` | … Mobile — 02 Some selected | 6 of 20 selected, "Clear selection", button reads "Submit with 6 messages" |
| `7025:59671` | … Mobile — 03 Limit reached — 20 of 20 | every shown message chosen, "That's the most we can include.", include button disabled ("All shown messages included") |
| `7025:59944` | … Mobile — 04 Loading the messages | skeleton rows, counter "Loading…", include button disabled |
| `7025:60050` | … Mobile — 05 Could not load the messages | error callout with a `semantic/alert` accent bar, "Try again", and "You can still send your report without them." Submit report stays available |
| `7027:59162` | … Mobile — 06 Sent, with messages included | "Reported — thanks / Our team will review it." plus "6 messages from the chat were included with your report." |
| `7025:60129`, `7025:60379`, `7025:60636`, `7025:60908`, `7025:61013` | … Desktop — 01 to 05 | the same five states, dialog 440 wide |
| `7027:59171` | … Desktop — 06 Sent, with messages included | the same confirmation |

Positions: mobile y 301,100, x 0 to 2,550, pitch 510; desktop y 302,300, x 0 to 3,400, pitch 680.

What each step frame contains, top to bottom: title "Add messages for context"; subtitle; a callout (navy accent bar on `brand/green-tint`) holding the tagged sentence; a row with the counter (and "Clear selection" once something is chosen) on the left and the outline "Include the messages shown" button on the right; the scrolling message list; the "Submit report" / "Back" buttons pinned at the bottom.

The list is all 21 rows: 10 before, the reported message, 10 after, oldest first, inside a clipped region scrolled so the reported message is in view (a thin scroll bar marks it). Each row: a checkbox (empty or checked, navy), a sender label ("You" pill on green tint for the reporter's own messages, "@matthew_amuloko" for the other person), the time, and the text. A selected row is on `brand/green-tint`. The reported message is on `brand/off-white` with a navy outline, carries a "Reported message" pill, has no checkbox (its slot is empty) and is therefore not selectable. On mobile the pill sits above the name so it does not clip.

"Include the messages shown" selects every shown message (the 20 around the reported one) in one tap. It is disabled once all 20 are chosen. Nothing is selected by default.

### Admin side (clones of `7011:57380`, the report detail for a message target)

| Id | Frame | What it shows |
|---|---|---|
| `7027:59180` | Admin — Report Detail — Message target, messages included | new card "MESSAGES AROUND THE REPORTED ONE" under the two top cards: 12 message rows oldest first plus three "not included" gap rows; frame and Admin Shell instance resized to 1,503 px |
| `7027:59472` | Admin — Report Detail — Message target, no messages included | the same card with one sentence: "The reporter did not add any messages from the chat. Only the reported message is shown above." (1,184 px) |

In the card: the reporter's own messages (Emeka John) carry a "Reporter" pill; the reported message is highlighted with a "Reported message" pill; one message shows an "Edited" pill and an "Original: …" line; one shows a "Deleted by the sender" pill with its text kept for review; gaps are text rows ("5 earlier messages were not included", "2 messages in between were not included", "3 later messages were not included"). These are the same markers the reported message already has on the neighbouring frames R12 and R13 of `docs/figma-w8-privacy-reporting.md`. Pills are instances of the existing F2 `Pill` component set `6671:27397` (Neutral, Positive, Strong, Outline).

### Other

Band title `7027:59661`. Notes frame `7027:59662` (SCOPE OPEN points). Label texts: `7025:59412`, `7025:59670`, `7025:59943`, `7025:60049`, `7025:60128`, `7025:60378`, `7025:60635`, `7025:60907`, `7025:61012`, `7025:61090`, `7027:59170`, `7027:59179`, `7027:59471`, `7027:59660`.

Screenshots: `docs/figma-message-report-context-screens/` (mobile 01 to 06, desktop 01 to 06, both admin frames, notes).

## 2. Existing components and tokens used

* Dialog shell, scrim (`color/overlay/scrim`) and shadow: inherited by cloning the report dialog frames.
* Variables (all bound, Light mode): `brand/navy`, `brand/green-tint`, `brand/off-white`, `color/background/surface`, `color/text/primary`, `color/text/secondary`, `color/text/on-navy`, `color/icon/inactive`, `semantic/alert` (only the accent bar of the load error, per Decision Log #408 item 4). No new colour, no `brand/green-tint-28`.
* Admin: the existing `Admin Shell` instance, `Admin Search Bar`, the card style of `Card — REPORT DETAILS`, and the F2 `Pill` component. The user-side frames use local frames in Montserrat (user-facing screens, as in Decision Log #403 item 14); the admin card uses Inter, matching the admin frames.
* No new text styles or components were created.

## 3. Wording

New, tagged `[COPY PENDING LEGAL REVIEW]` inline (it says who sees what): "Our safeguarding team will see the messages you choose, and the message you are reporting."

New, plain functional wording (untagged): "Add messages for context"; "Optional. Pick messages from this chat that help our team understand what happened."; "N of 20 selected"; "Clear selection"; "Include the messages shown"; "All shown messages included"; "That's the most we can include."; "Submit with N messages"; "Back"; "Loading…"; "Couldn't load the messages. Try again."; "You can still send your report without them."; "Try again"; "N messages from the chat were included with your report."; admin: "MESSAGES AROUND THE REPORTED ONE", the description line, "Reporter", "Reported message", the gap rows, "The reporter did not add any messages from the chat. Only the reported message is shown above."

Reused unchanged: "Reported — thanks", "Our team will review it.", "Edited", "Original text", "Deleted by the sender". The sample messages and names are placeholders.

## 4. SCOPE OPEN (also on the canvas, notes frame `7027:59662`)

1. The step is drawn for every reason category. Whether it is skipped for "Child safety concern" is not decided.
2. Messages the reporter cannot see (deleted for everyone, hidden by them, before a chat they deleted) are not listed; no frame draws them.
3. "20 of 20" means every shown message is chosen. When fewer than 20 are shown, the denominator (20) is the maximum, not the list length; that wording is not drawn.
4. Whether the choice is kept if the person goes Back and forward is not drawn.
5. The "none included" confirmation is the same frame without the extra line (not drawn separately).
6. Admin: messages the reporter did not choose appear only as a count. Whether staff can ask for the rest of the thread is not decided.
7. Admin: the section is shown to whoever can open the report; the child-safety rules that apply to a report about a minor apply to it too. No restricted version is drawn.
8. No API field or endpoint was read. The mobile list is drawn at a scrolled position so the reported message is in view; real scrolling is for the build.

Also noticed, not changed: the F2 `Dialog` and button components were not used for the user-side dialog because the existing report dialog frames (which this extends) are built as local Montserrat frames; they were cloned as they are.

## 5. Standing check (Decision Log #404 item 14)

* Top-level nodes on page `0:1`: 1,737 before, 1,767 after (+30: 14 frames, 14 labels, 1 band title, 1 notes frame). The id hash of the 1,737 original top-level nodes, computed with the same djb2 loop, is `1272411226` before and after (identical, original nodes untouched). Nothing deleted, renamed, moved or archived.
* Paints on the new nodes (instance internals excluded): 1,131 solid fills and strokes, 0 unbound.
* Overlaps among the new top-level nodes: 0; none with existing content (nearest existing content ends at y 299,611, the new band starts at y 300,650).
* Prototype flow starting points: 78 before and after (cloning did not add any).
* Problems found and fixed during the pass: the first admin card collapsed to 1 px (cloned with a fill vertical sizing; set to hug); marker pills in the admin rows were clipped (markers column set to hug); on mobile the "Reported message" pill clipped (pill moved above the name); the loading and error counters kept an old text width and pushed the include button off the frame (width set to hug); labels overlapped their neighbours (wrapped to frame width). All were re-checked by screenshot.
* Screenshots viewed by eye: mobile 01 and 05 (final), mobile 02 and desktop 03 (before the later pill and counter fixes), desktop 04, mobile 06, both admin frames (final). Mobile 03, 04 and desktop 01, 02, 05, 06 and the notes frame were saved but not studied; they come from the same builder code.
