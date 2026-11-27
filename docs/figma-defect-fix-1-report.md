# Figma defect fixes 1 (hero card tabs, pillar cards, Moderation Queue)

Role: figma-screen-builder. Figma and docs only. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`.

## Handshake
- origin/main at start: `7860a3e` (branch `design/figma-defect-fix-1` cut from it).
- No open PRs touching `docs/build-register.md` or `CLAUDE.md`.
- Last register section was 137, so this is section 138.

## FIX 1: hero card league tabs
Rows `7172:8` (HC-1 card `5206:6805`) and `7173:99` (HC-2 `7173:145`), 400 px wide. Chips relabelled (sample text only): "Premier League", "La Liga", "Serie A". Chip names updated to match. Height, font size and More link untouched; Premier League still active; HC-3 untouched.
Chip extents after the edit (x start to end), identical in both rows: Premier League 0 to 126, La Liga 134 to 207, Serie A 215 to 288, More 296 to 356. Row is 400, so nothing extends past it.
Mobile (350 wide cards, horizontal scroll by design) left alone. Report only: in `5543:7407` the League Tabs row `7172:60` is 310 wide and the "La Liga" chip (290 to 363) is cut mid-word at the edge.

## FIX 2: pillar cards
Row `5209:6809`: each card set to fill the row height. Cards were 276 / 251 / 251, now all 276. Padding 32, radius 18, fills and text unchanged. Row and pillar frame `5209:6804` heights unchanged. Mobile (stacked) pillar cards in `5543:7407` unchanged at 451 each.

## FIX 3: Moderation Queue `5794:8635` (Content `5794:8710`)
- (a) Header Row `5794:8719` and all six rows now fill the table: 1100 wide, same as the card.
- (b) Reporter, Status and Review are separate columns. Twelve wrapper frames ("Col — Type" 90, "Col — Status" 110) fix the pill columns. Column x in header and every row: 20, 276, 382, 618, 794, 920. No text changed.
- (c) The shell's Filter button is nested in the Admin Shell instance and ignores resize overrides, so its width could not be changed. Instead the shell action button is hidden (`Show Action Button` = false) and a standalone navy "Button — Filter" (`7184:71441`, cloned from the shell button, 95 x 41, same height) sits in Content with its right edge on the table card edge (x 1100 of 1100). It is on the same row as the shell search bar. Label "Filter" unchanged. **Judgment call:** a standalone button replaces the instance button, as "Button — Export Queue" already does.
- (d) Callout accent bar `5794:8782` now bound to the navy token `VariableID:5096:4`, the one the active tab uses. No new colour.

## Standing check (Decision Log #404 item 14)
- Top-level nodes on `0:1`: 2000 before, 2000 after. Id hash (djb2-xor, ordered) `763113808` before and after.
- New unbound solid fills: 0. The two unbound fills in the Moderation content are the existing "Export Queue" button (`6073:14056`, `6073:14057`), not touched.
- Text under 11 px: 0 in HC-1, pillar frame and Moderation content.
- Contrast: label text unchanged; navy fill with the existing white label on the Filter button as before (about 12:1).
- Prototype reactions: the 5 reactions in each of `5204:6728` and `5543:7407` still present (4 Sports Hub links among them).
- Overlaps: none introduced (chips inside the row, Filter button sits right of the search bar at x 45852 vs search end 45566).

## Not verified
The three screenshots returned URLs only, so I could not look at them; checks rest on node data. The shell Filter button's own size cannot be changed from a screen frame; it is hidden, not resized. Admin Shell and other admin frames not touched.
