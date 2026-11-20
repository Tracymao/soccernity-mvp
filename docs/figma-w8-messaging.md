# Figma W8: message actions and privacy-setting states (B-067, B-061)

Figma and docs only. No application code, schema, legal copy, DPIA, Build Plan docx, `docs/build-register.md` or `docs/pending-copy-manifest.md` changed. Date: 2026-11-06. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`, light mode, 390 px mobile and the existing 1440 px desktop width. Founder statement: Decision Log #472 (chat gets delete for me, delete for everyone and edit message; Sensitive media is built; the Direct Messages setting). Build detail in the register notes (Section 80) is an adopted default, veto-able.

Written for: the `figma-to-code` and `backend-api` agents that build B-067 and B-061 next, and the founder who reviews the frames.

## 1. What was built

56 new top-level frames, each with a text label 48 px above it, plus a band title and 5 SCOPE OPEN note frames. They sit in a clear band at y 209700 to about 222000. Top-level nodes on page `0:1` went from 1,316 to 1,434 (56 frames + 56 labels + 5 notes + 1 title = 118). Nothing was deleted, renamed or edited; every new frame is a clone of an existing frame plus additions, or built fresh (row G).

Rows (y of each row; mobile columns are 450 px apart, desktop columns 1540 px apart):

### Row A: message menus and edit mode (mobile 390 x 844, y 210000). Base: clone of `5709:8419`

| Id | Frame | State |
|---|---|---|
| A1 `6977:47071` | Message — Actions Menu — Own Message | long-press on own message within 15 min: Edit (with "You can edit for 15 minutes"), Delete |
| A2 `6977:47136` | Message — Actions Menu — Own Message, Edit Unavailable | own message older than 15 min: Edit disabled, "Sent more than 15 minutes ago" |
| A3 `6977:47201` | Message — Actions Menu — Their Message | Report, Delete for me |
| A4 `6977:47266` | Message — Edit Mode | edit bar replaces the composer: "Editing message", Cancel, pre-filled input, Save |
| A5 `6977:47322` | Message — Edit Mode — Saving | loading: "Saving…", input and Cancel dimmed |
| A6 `6977:47378` | Message — Edit Mode — Save Error | error banner with the alert accent bar |
| A7 `6977:47437` | Message — Edit Mode — Window Closed | "You can only edit a message for 15 minutes…", Save disabled |

### Row B: edited label, delete, placeholder (mobile, y 211000)

| Id | Frame | State |
|---|---|---|
| B1 `6978:47071` | Message — Edited Label | own bubble time reads "08:06 AM · Edited" |
| B2 `6978:47114` | Message — Delete Choice — Own Message | bottom sheet: Delete for me / Delete for everyone / Cancel |
| B3 `6978:47175` | Message — Delete Choice — Their Message | sheet with Delete for me only |
| B4 `6978:47233` | Message — Delete For Everyone — Confirm | dialog, tagged retention line |
| B5 `6978:47286` | Message — Delete For Me — Confirm | dialog |
| B6 `6978:47338` | Message — Delete — Deleting | loading: buttons disabled, "Deleting…" |
| B7 `6978:47391` | Message — Delete — Error | error banner, Try again |
| B8 `6978:47446` | Message — Deleted Placeholder — Seen By The Other Person | "This message was deleted", left-aligned |
| B9 `6978:47489` | Message — Deleted Placeholder — Seen By The Sender | same box, right-aligned |

### Row C: conversation actions (mobile, y 212000). Base: clone of `5709:8419`; menu rebuilt from the frame `5709:8461` / component `5706:8270`

| Id | Frame | State |
|---|---|---|
| C1 `6978:47532` | Message — Conversation Actions Menu — Completed | Mark as Read, View User Profile, Block User, Delete Chat ("Removes the chat for you only") |
| C2 `6978:47608` | Message — Delete Chat — Confirm | dialog, for me only |
| C3 `6978:47660` | Message — Delete Chat — Deleting | loading |
| C4 `6978:47712` | Message — Delete Chat — Error | error |

### Row D: desktop chat (1440 x 1024, y 213000). Base: clone of `5706:8271`

D1 `6979:47071` hover "…" and menu (Edit, Delete) · D2 `6979:47288` edit mode · D3 `6979:47495` edit saving · D4 `6979:47702` edit error · D5 `6979:47912` delete choice · D6 `6979:48119` confirm for everyone · D7 `6979:48323` deleting · D8 `6979:48527` delete error · D9 `6979:48733` deleted placeholder · D10 `6979:48927` conversation actions menu.

### Row E: Settings > Privacy > Direct Messages, "Who can message me" added; Read receipts row kept unchanged

Desktop (1440 x 2517, y 214500, base `2926:8764`): E1 `6981:48879` default (Everyone the rules allow) · E2 `6981:49060` saving ("No one" selected, options dimmed) · E3 `6981:49242` save failed · E4 `6981:49426` initial load (skeleton options).
Mobile (390, y 217300, base `5696:8241`): E5 `6981:49593` default · E6 `6981:49633` saving · E7 `6981:49674` error · E8 `6981:49717` loading.

### Row F: Settings > Your posts, toggle kept

Desktop (base `2926:8996`, y 214500, x 6160 onward): F1 `6983:48741` on · F2 `6983:48904` saving · F3 `6983:49067` save failed (toggle back to Off) · F4 `6983:49228` loading.
Mobile (base `5696:8261`, y 217300, x 1800 onward): F5 `6983:49391` on · F6 `6983:49415` saving · F7 `6983:49439` error · F8 `6983:49461` loading.

### Row G: the viewer's blurred post card (built fresh: `header 4` / `header 4 — mobile` navbar instance and a card of my own, because no reusable Community post-card component exists to instance)

Desktop (1440 x 900, y 218600): G1 `6983:49485` blurred picture · G2 `6983:49621` blurred video (duration chip stays) · G3 `6983:49759` revealed after tap (Hide chip) · G4 `6983:49895` media loading · G5 `6983:50019` media failed to load.
Mobile (390 x 844, y 219900): G6 `6983:50150` · G7 `6983:50197` · G8 `6983:50246` · G9 `6983:50293` · G10 `6983:50328` (same five states).

### Notes and title

Band title `6984:49962`; SCOPE OPEN notes: rows A and B `6984:49963`, row C `6984:49972`, row D `6984:49977`, rows E and F `6984:49981`, row G `6984:49990`.

## 2. Requested item to frames

1. Message actions menu (long-press and hover): A1, A2, A3 (mobile), D1 (desktop hover).
2. Edit mode with Save and Cancel, and the "Edited" label: A4, B1, D2.
3. Delete choice with confirmation: B2, B3, B4, B5, D5, D6.
4. "This message was deleted" placeholder, seen by the other person: B8, D9 (own view B9).
5. Conversation actions menu completed: C1, D10; Delete chat confirmation C2.
6. Direct Messages: Read receipts kept, "Who can message me" added: E1 to E8.
7. Your Posts: toggle kept, viewer's blurred picture and video state: F1 to F8, G1 to G10.
8. Error and loading states: edit A5, A6, A7, D3, D4 · delete B6, B7, D7, D8 · delete chat C3, C4 · setting E2 to E4, E6 to E8 · toggle F2 to F4, F6 to F8 · media G4, G5, G9, G10. The message menu has none: it opens at once and only the choice calls the server.

## 3. Wording tagged `[COPY PENDING LEGAL REVIEW]` (only two strings make a legal or safety promise)

- "We may keep a copy of the original for safety and legal reasons." (under "Delete for everyone": B4, B6, D6, D7).
- "This can only make messaging stricter. Our safety rules for under-18s still apply." (under "Who can message me": E1 to E8).

All other wording is plain and functional (labels, helper lines, errors). The tag appears inline in the string, as on earlier frames.

## 4. Decisions made while drawing (defaults, veto-able)

- "Delete for me" is drawn per message (B2, B3) and "Delete chat" for me only (C1). The register reads "delete for me" as hiding the conversation; #472 lists it beside "delete for everyone". Not decided; see notes.
- Block User in the conversation menu was red text (`semantic/alert`) in the existing component. It is drawn navy here (navy-destructive convention; #408 item 4 allows `semantic/alert` for error accents only). Founder call.
- New icons (pencil, flag, trash, eye-off, play, mail, user, ban, dots) were drawn from line SVGs, bound to `brand/navy`; the file has no shared icon component for these.
- Dialogs use `elevation/overlay`, menus `elevation/menu`, the scrim is `color/overlay/scrim`. No new colour, no `brand/green-tint-28`.

## 5. Undecided points (on the canvas as SCOPE OPEN, not guessed)

Per-message versus per-conversation "delete for me"; report reasons and target type for a message; which clock counts for the 15 minutes; whether the original of an edited message is viewable; the placeholder's wording and time stamp; keyboard access to the hover menu; what "No one" does to existing chats; whether the Sensitive-media toggle changes posts already published; whether "Tap to view" persists after leaving the page; the author's own view of a blurred post; Read receipts (nothing stated, row unchanged); under-16 and restricted-pending states of the setting; whether profile pictures, covers and contest entries are blurred (read as post media only); alt text.

## 6. Standing check (Decision Log #404 item 14, adapted)

- Page `0:1` top-level nodes 1,316 to 1,434. A hash of the original ids was NOT taken before the first write (this pass started without one), but the delta equals exactly the 118 new nodes counted above and no existing node was edited, so the original set is unchanged by construction.
- 2,047 solid paints on new nodes (instance internals excluded): 0 unbound, 0 non-Montserrat text, 0 overlaps between new top-level frames, none overlap existing content (existing content ends at y 208,784).
- Inherited, not counted: the navbar instances (`header 4`, `header 4 — mobile`), the Settings Shell and Top Bar instances keep their own known avatar `IMAGE` fill debt.
- Screenshot comparison with the frame each one extends was done by eye for A1, A6, B2, B3, B4, B8, C1, D1, D4, D6, D10, E3, E7, F5, G3, G6. The other frames come from the same helper code and were not each viewed. Two defects were found and fixed: the highlighted message clone lost its fixed width (A1 to A3), and the new settings group stayed 10 px tall and clipped (E1 to E8).

## 7. Follow-ups for the next docs PR (not edited here)

A status line on B-067 and B-061 (Figma half built, this file); the open points above stay open.
