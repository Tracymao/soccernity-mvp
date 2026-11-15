# Figma: "Finalist club" layers removed from Final week tiles

Branch `figma/final-week-club-layers-removed`, cut from `origin/main` `a31dec6`. Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma only: no application code, schema, legal copy, register or docx change.

Founder decision (2026-11-14): no one's club appears on a contest tile. Pass X (`docs/figma-pass-x-report.md` section 6) had left hidden text layers named "Finalist club (hidden — API returns no club, #418 item 5)" on the Final week finalist tiles. The name gave a wrong reason and invited someone to switch the layer on.

## 1. What was found (before any change)

A scan of every TEXT node on page `0:1` (40,301 of them) for a name starting with "Finalist club" found **66 layers** (my first count of "about 72" was an over-estimate by eye; the script's count is 66). No non-text node carries that name. The cover page and the dump page were not scanned (neither holds contest tiles).

- **60 hidden layers** named "Finalist club (hidden — API returns no club, #418 item 5)".
- **6 visible layers** named plain "Finalist club", all inside the two ARCHIVED, hidden components `6697:26197` and `6697:27409` ("ARCHIVED — Page=3 (carousel is 6 finalists = 2 pages, pass J, #404 item 9)"): `6697:26217`, `6697:26222`, `6697:26227`, `6697:27429`, `6697:27435`, `6697:27441`.

They sat in these places (every one inside `Finalist cards > Row > Finalist card > Finalist meta`):

| Where | Node |
|---|---|
| Contest-page module, desktop (9 finalists) | component `6661:26837` (9 layers) |
| Contest-page module, mobile (9 finalists) | component `6661:26928` (9 layers) |
| Feed carousel, 2 pages, desktop | set `6697:26234`: Page=1 `6661:26780` (3), Page=2 `6697:26160` (3) |
| Feed carousel, 2 pages, mobile | set `6697:27448`: Page=1 `6661:26865` (3), Page=2 `6697:27370` (3) |
| Feed carousel, 3 pages (9 finalists), desktop | set `6841:29675`: Page=1 `6841:29676` (3), Page=2 `6841:29713` (3), Page=3 `6841:29750` (3) |
| Feed carousel, 3 pages (9 finalists), mobile | set `6843:29675`: Page=1 `6843:29676` (3), Page=2 `6843:29715` (3), Page=3 `6843:29754` (3) |
| Archived 6-finalist Page=3 (visible club lines) | `6697:26197` (3), `6697:27409` (3) |
| Standalone carousel state frames (pass O) | `6836:29561`, `6836:29600`, `6836:29637` (desktop), `6838:29460`, `6838:29502` (mobile) |

The two Community-feed frames (`6661:26929`, `6661:29200`) hold an instance each of the 3-page sets (`6661:29097` of `6841:29676`, `6661:29294` of `6843:29676`). The two archived Contest-page frames hold instances of `6661:26837` and `6661:26928`. No instance carried an override of these layers, so editing the main components was enough.

## 2. What was changed

1. **Deleted all 66 layers** (ids in the PR description's list below). Decision, founder-veto-able default: delete rather than leave hidden and renamed. The 6 visible ones inside the archived components were deleted too, because the brief says every layer with that name and because they were the only visible club lines on any Final week tile.
   Deleted ids: 6661:26794, 6661:26799, 6661:26804, 6661:26810, 6661:26815, 6661:26820, 6661:26826, 6661:26831, 6661:26836, 6661:26879, 6661:26885, 6661:26891, 6661:26897, 6661:26903, 6661:26909, 6661:26915, 6661:26921, 6661:26927, 6661:26768, 6661:26773, 6661:26778, 6697:26180, 6697:26185, 6697:26190, 6661:26851, 6661:26857, 6661:26863, 6697:27390, 6697:27396, 6697:27402, 6697:26217, 6697:26222, 6697:26227, 6697:27429, 6697:27435, 6697:27441, 6836:29581, 6836:29586, 6836:29591, 6836:29620, 6836:29625, 6836:29657, 6836:29662, 6838:29480, 6838:29486, 6838:29492, 6838:29522, 6838:29528, 6841:29696, 6841:29701, 6841:29706, 6841:29733, 6841:29738, 6841:29743, 6841:29770, 6841:29775, 6841:29780, 6843:29696, 6843:29702, 6843:29708, 6843:29735, 6843:29741, 6843:29747, 6843:29774, 6843:29780, 6843:29786.
2. **Rewrote one line of one canvas note**: text node `6843:29798` (in the Pass P note frame `6843:29797`). Old line: "• The tile club line is hidden (not deleted) on every carousel tile and on the Contest-page module: the API returns no club (#418 item 5). Restore the hidden layer when a club is returned." New line: "• Contest tiles never show a club (founder decision 2026-11-14). The hidden club layers are deleted from every carousel tile and from the Contest-page module." Done with `insertCharacters` / `deleteCharacters` on that range only, so the single text style is unchanged (one styled segment before and after; the node's other three bullets and heading are byte-identical).

## 3. Layout shift

- The 60 hidden layers were hidden, so Figma's auto-layout already ignored them: the 60 `Finalist meta` frames and their top-level frames kept the same size and the same number of visible children. No tile was redrawn.
- **The 6 visible layers in the two archived components did change layout** (their `Finalist meta` frames lost a visible line, so those 6 meta frames are smaller or shorter). That is the only layout change; both components are archived and hidden, so nothing visible on the canvas moved. Meta frame ids: `6697:26215`, `6697:26220`, `6697:26225`, `6697:27427`, `6697:27433`, `6697:27439`.

## 4. Notes checked and left alone

- A search of all TEXT on page `0:1` for "no club", "API returns" and "#418 item 5" found one note that gave the old reason (`6843:29798`, edited above). Other hits for "no club" were unrelated ("No clubs match that filter", the Club — Fan Page "no club-post-creation endpoint", Grassroots "no club feed").
- **Not edited, reads slightly stale:** the pass R note `I6859:30619;6671:27526` (an instance override of the shared Note component) says "Pass P's other open points (feed samples keep six finalists, hidden club layers) are not changed here". It records what pass R did and gives no reason, so I left it; it now refers to layers that no longer exist. Say if you want it reworded.
- **Not edited:** the pass X report (`docs/figma-pass-x-report.md` section 6) and the pass P report still describe the layers as hidden; they are history.
- **Leaderboard table rows were not touched**: the Contest-tab leaderboard frames (for example `5524:7512`, `5524:7836`, `5556:7426`, `5556:7529`, `5556:7632`, `6659:25987`, `6659:26310`, `6659:26636`) have a CLUB column with club names in every row. They are table rows, not Final week tiles, and the brief says not to touch the leaderboard. Whether the Contest tab of the leaderboard should also show no club is a separate question for the founder (the board does carry a club column per register B-053, with a minor's club always null).
- Not touched: the represented-club UI, club pages, Club Picker, Home page fixtures.

## 5. Checks (Decision Log #404 item 14)

- Top-level nodes on page `0:1`: **1,864 before and 1,864 after**, hash of the ordered ids **3392401638 before and after** (the same djb2 hash used by pass X's neighbours; pass X's own recorded hash `1604224858` is for a different set of ids and is not comparable).
- 0 layers with a name starting "Finalist club" remain (re-scanned after deletion).
- No new paint, no new text style, no new node: this pass only deleted nodes and edited one text range.
- Screenshots in `docs/figma-final-week-club-layers-screens/`:
  - `before-tile-6841-29676.png` and `after-tile-6841-29676.png`: the 9-finalist feed carousel Page=1. **Byte-identical** (`cmp`), as expected because the deleted layers were hidden. I looked at the image: three tiles with names, no club line.
  - `before-note-6843-29797.png` and `after-note-6843-29797.png`: the Pass P note. I looked at the after image: the club bullet now reads the founder decision, the other bullets and the heading are unchanged and nothing is clipped.

## 6. Not verified

- The cover page and the dump page were not scanned for a "Finalist club" layer.
- I did not screenshot the two archived components whose meta frames resized.
- The `apps/web` Final week carousel code was not read or changed (the club line was never built there; the API does return a club on the tile since B-234, and the web does not draw it).
