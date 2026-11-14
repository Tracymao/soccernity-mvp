# Figma pass Y: Bants "Create a topic" rebuilt around Title, Description, emoji and Scope

Date: 2026-11-14. Branch `figma/pass-y-bants-create-topic`. Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, legal copy, DPIA, `docs/build-register.md`, `docs/pending-copy-manifest.md` or Build Plan docx changed. Nothing was deleted or archived (superseded layers are hidden, not removed). Founder decision of 2026-11-14.

Screenshots: `docs/figma-pass-y-screens/before-<id>.png` and `after-<id>.png` (id with ":" written as "-"). `before-6999-55292.png` is a copy of its after image because that frame is unchanged. The room-frame "before" images were taken with the new description nodes hidden.

## What the frames now draw

Each of the four Create topic frames draws only: Title (required), a Scope row, an optional multi-line Description, an emoji icon that opens the picker, and a Post button that is disabled until a title is entered. No GIF, no poll, no attachment line is visible in any of them.

### Mobile `5651:8166` (Create Topic, empty)

- Before: Title, description, a GIF control, an "Add to your post" line, an emoji icon, Post.
- Now: Title; new Scope row `7059:63597` (label "Scope", select showing "Topic"); description field `5651:8199` now reads "Description (optional)"; emoji icon `5651:8203` enlarged to 22pt; Post disabled. `5651:8201` ("Add to your post") and `5651:8202` (GIF) are hidden. New popover `7059:63602` shows the open scope list (Club, League, Country, Topic, with Topic highlighted). The mobile note "Post stays disabled until a title is entered." is kept. Frame height 563.

### Mobile `5651:8207` (Create Topic with Attachment, now the filled state)

- Before: title, description, an attachment preview and its two controls.
- Now: filled state with title and description entered, Post enabled, Scope = Club with a club select `7060:63602` showing Chelsea (Scope Row `7060:63597`). The attachment preview `5651:8241` and `5651:8248`, `5651:8249` are hidden. Open emoji picker `7060:63607` is drawn below the Post button. The Composer Card no longer clips (`clipsContent` false) and the frame is 737 high so the picker is inside it.

### Desktop `2355:2137` (create topic, empty)

- Before: Title, description, GIF and "Add to your post" rows, emoji, Post.
- Now: new Scope label `7061:63597`, select `7061:63598` with value `7061:63599` ("Topic") and chevron `7061:63600`; open scope list `7061:63601`. Title, description and Post rows moved down 53; modal rectangle 796x434, Frame 1 `2355:4262` 796x455. `2355:4288` (GIF) and `2355:4297` ("Add to your post") hidden. Description label "Description (optional)". Post shown disabled (button fill navy 15%, label navy 70%).

### Desktop `2256:8925` (with attachment, now the filled state)

- Before: image thumbnails (not an mp4 row) and the attachment controls.
- Now: filled state. Title "Weekend results and reactions"; description "Post your results and thoughts from this weekend. Keep it friendly."; Scope = Club (clones `7061:63610` to `7061:63617`: Scope and Club labels, fields, values, chevrons; Chelsea). Open emoji picker `7061:63618` at (427, 763). Post label white on navy (enabled). Hidden: `2355:2098`, `2355:2099`, `2355:2100`, `2355:2101`, `2355:2103`, `2355:2120`, `2355:2129` (thumbnails, GIF, add-to-post). Modal rectangle `2355:2097` 796x510, Frame 1 `2355:2096` 796x531.

### Emoji picker

One open state on desktop (`7061:63618`) and one on mobile (`7060:63607`). Each is an auto-layout card in the existing popover style (white surface, 1px navy-15% border, `elevation/menu` effect style) with an "Emoji" label and a 3x6 grid of 32px cells, first cell highlighted. No new component set was created: an inline card was enough and the picker is drawn in one state only.

### Room description, four room-page frames

New text "Room description": `7061:63659` in Room Header `6998:54694` (mobile `6998:54688`), `7061:63660` in `6999:54774` (mobile `6999:54768`), `7061:63661` in Room info `7002:55184` (desktop `7002:55068`). Inserted directly under the title, 13pt, secondary text colour (navy 70%), wrapping, three lines or fewer. Text: "A room for match-day reactions, results and friendly banter. Keep it respectful and on topic." `6999:55292` (inactive room) is unchanged and shows nothing extra, as the brief allows for a frame with no description.

### Stale carousel notes (text only)

- `6664:27292` and `6664:27303`: the "PASS K NOTE" bullet replaced with a "PASS Y NOTE" bullet saying the live carousel samples nine finalists in three pages of three (pass X; component sets `6841:29675` desktop, `6843:29675` mobile).
- `6698:26188`: now "3 pages of 3 finalists (nine-finalist component sets 6841:29675 desktop, 6843:29675 mobile, wired in pass X ...)".
- `6698:26192`: now "Sample data: 9 finalists (3 pages of 3). The feed frames show page 1, "Showing 1–3 of 9 finalists", with three dots. Updated in pass Y ...".
Only the text of those four text nodes changed.

## New strings

- "Scope" and the four scope options "Club", "League", "Country", "Topic" (copied from the built form `BanterPage.tsx` / `banterFilters.ts`), the club select value "Chelsea" (sample).
- "Emoji" (picker label; the only new word not copied from the built form).
- "Description (optional)" (replaces the old description label).
- Sample values: title "Weekend results and reactions"; description "Post your results and thoughts from this weekend. Keep it friendly."; room description as above.
None is a legal or safety promise, so nothing is tagged `[COPY PENDING LEGAL REVIEW]` and `docs/pending-copy-manifest.md` is untouched.

## Audit

Standing check (Decision Log #404 item 14, no whole-page `get_metadata`):

| | before | after |
|---|---|---|
| top-level nodes on `0:1` | 1,864 | 1,864 |
| djb2 hash of the ordered top-level ids | 1604224858 | 1604224858 |

All new nodes sit inside existing frames, so the top-level list is unchanged.

Paints: 85 visible solid fills and strokes scanned on new nodes: 0 unbound, 0 `brand/green-tint-28`, 0 new colours. Touched existing nodes: 0 unbound. Every new fill is bound to an existing `Soccernity Theme` variable (navy, green tint 12%, surface, primary and secondary text, icon/inactive 15%, text on navy). Light mode only. Desktop frames use Montserrat, mobile frames Inter, as before.

Overlaps (a geometry check of new nodes against visible original nodes, run once):
- Mobile filled `5651:8207`: none.
- Mobile empty `5651:8166`: the open scope popover covers the description field. Intentional; it is an open dropdown.
- Desktop empty `2355:2137`: the open scope popover covers part of the form. Intentional, same reason. The check also lists the original background page content (room list rows) that sits under the modal scrim in every desktop frame; that is the page behind the modal, not a layout collision.
- Desktop filled `2256:8925`: the emoji picker extends below the modal rectangle onto the scrim. Intentional; the frame is 1820 high, so it stays inside the frame.
New nodes do not overlap each other except as listed.

## Judgment calls

- Superseded controls are hidden, not deleted, per the standing rule.
- The desktop "with attachment" frame had image thumbnails, not an mp4 row; they are hidden.
- Emoji cells are colour text characters, not vector icons.
- The empty frames show the scope list open so the four options are visible; the filled frames show Club chosen so the club select is visible (the brief asked for the club select in one state).
- Room description is filled on three of the four room frames (two mobile, one desktop); the inactive-room frame is left without one.

## Not done

- No application code, no prototype links for the picker or the select, no new component set, no archiving or deletion.
- The disabled Post button in the empty frames is a static state; no variable-driven enabled/disabled prototype was added.
- Open emoji picker only drawn once per breakpoint; no search, skin-tone or category tabs.
- The web build (Title, Description, emoji, scope) and any backend change to accept a title or description are separate work; no endpoint creates a post with a title today.
- No whole-page metadata pull; no suite run.
