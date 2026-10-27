# Figma pass P — leaderboard patch, nine-finalist carousel, club line, retitled admin frames

Figma and docs only. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. No application code, schema, legal copy, DPIA or `.docx` touched. Nothing archived or deleted.
Before/after screenshots: `docs/figma-pass-p-screens/` (`before-<id>.png`, `after-<id>.png`, node id with `:` as `-`).

## 1. Standing check (Decision Log #404 item 14)

| | Before | After |
|---|---|---|
| Top-level nodes on `0:1` | 948 | 951 |
| djb2 hash of the 948 original ids, in order | 1450662341 | 1450662341 (the first 948 ids of the new list) |

The three new top-level nodes are appended at the end: `6841:29675`, `6843:29675`, `6843:29797`. No node was removed, reordered or archived.

## 2. (a) Mobile leaderboard — white patch and Load more

Frames: `5540:7264` (donor) and `6838:30234` (pass O clone). Screenshots for both.

- **White patch.** Every `cell/score` (10 per frame, 20 total) carried an opaque, unbound `#FFFFFF` fill. It was only visible on the highlighted "You" row (row 7, green tint at 12%). The fill is removed from all 20 cells (`fills = []`), so the row tint shows through and no unbound fill remains. No token was bound, because a cell on a white table needs no fill at all.
- **Load more.** The footer text (239 px, hug) plus the button (107 px) did not fit the 302 px of content width, so the button ended at 370 px in a 350 px card and was clipped. The footer text is now fill-width with wrapping (`textAutoResize = HEIGHT`, `layoutSizingHorizontal = FILL`), gap 12, so it wraps to two lines and the button ends at 326 px (right padding 24). Footer height is unchanged at 72.

## 3. (b) Old impression frames retitled

Layer names only (visible strings untouched). New names, all `Admin — Contest — Finalist Impressions — Pre-week-4 (settings editable)` plus the old state suffix: `6646:22745` (no suffix), `6646:23097` Fewer Than 9 Finalists, `6646:23419` Before Reveal, `6646:23765` No Finalists, `6646:23984` Settings Validation, `6646:24345` Load Error. Settings Locked `6838:29547` is untouched and is the state from day 22. Screenshots taken before; the rename has no visual effect.

## 4. (c) Nine-finalist, three-page carousel

New component sets, placed below the canvas (y 103,600 and 104,100; 0 overlaps), built by cloning the existing two-page sets and the hidden pass-J Page=3 variants (the originals are untouched except for the club line, section 5):

- Desktop `6841:29675`, "...carousel: 3 pages of 3 finalists — 9 finalists, #418 item 4": `Page=1` `6841:29676` ("Showing 1–3 of 9 finalists"), `Page=2` `6841:29713` ("4–6 of 9"), `Page=3` `6841:29750` ("7–9 of 9"). 796 x 323 per page.
- Mobile `6843:29675`: `Page=1` `6843:29676`, `Page=2` `6843:29715`, `Page=3` `6843:29754`. 358 x 438 per page.
- Three dots, the active one follows the page; arrows flip pages with `CHANGE_TO` (page 1 next -> 2, page 2 prev -> 1 and next -> 3, page 3 prev -> 2; read back). No arrow is disabled on the first or last page, matching the existing sets.
- A NOTE frame `6843:29797` records the change.

**Footers elsewhere.** Every carousel footer on the canvas already reads "Showing a–b of N finalists", where N is the number of finalists (6, 5, 2 or 9, not a page size). A page-wide text scan found no footer to reword, so none was changed. If "update the footers" meant something else (for example moving the feed samples from 6 to 9 finalists), say so; the new sets are ready to swap in.

## 5. (d) Tile club line removed

The text layer "Finalist club" is hidden (not deleted) and renamed "Finalist club (hidden — API returns no club, #418 item 5)" on every tile: both original two-page sets (12 layers), the two Contest-page modules `6661:26837` / `6661:26928` (18 layers), and the five standalone carousel frames `6836:29561`, `6836:29600`, `6836:29637`, `6838:29460`, `6838:29502` (12 layers). The feed frames `6661:26929` / `6661:29200` use instances of the sets and follow automatically. Hidden layers do not take space in auto-layout: desktop variants and standalone frames shrink from 340 to 323; `6661:26837` from 667 to 616; mobile frames stay at their fixed 438 / 865 / 362. The original desktop set is resized to 323 to match.

Judgment call: the Contest-page modules are not carousels, but they use the same tile and #418 item 5 says the club line leaves the Figma frames, so they are included. The two hidden pass-J `Page=3` components were left as they were.

## 6. Audit

- Authored/new nodes: 156 solid paints across the two new sets, **0 unbound** (nine inherited opaque-white container fills per set were cleared; they sat on a white card), 0 image fills, 0 `brand/green-tint-28`, 0 new colours. NOTE frame 3 paints, 0 unbound.
- Overlaps of the three new top-level nodes against the 948 originals: 0.
- Not changed, unbound inherited from earlier passes: the same nine white container fills in the two original two-page sets and the existing standalone frames.

## 7. Strings

New visible strings: "Showing 1–3 of 9 finalists", "Showing 4–6 of 9 finalists", "Showing 7–9 of 9 finalists" (each in the desktop and mobile set). Cloned unchanged from existing frames: the transparency copy, which already carries `[COPY PENDING LEGAL REVIEW]`. Per #412 item 5 nothing new is tagged: none of the new strings makes a legal or safety promise. The NOTE frame is a design note, not product copy.

## 8. Open

- The old impression frames still show the "Live from reveal" pill and the "Week 4 final" chip next to editable settings. Only the layer names were retitled; whether the visible chips should change is not decided.
- The new sets are not wired into the feed frames (those keep the 6-finalist sample).
- The hidden club layers should be restored when the API returns a club.
