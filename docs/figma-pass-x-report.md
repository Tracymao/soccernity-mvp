# Figma pass X: feed frames wired to the nine-finalist carousel

Branch `figma/pass-x-feed-nine-finalists`, cut from `origin/main` `3184de5`. Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Routed to figma-design-system (existing frames). Figma and docs only: no application code, schema, legal copy, DPIA, `docs/build-register.md`, `docs/pending-copy-manifest.md` or Build Plan docx changed. No suite run. At the start, `gh pr list --state open` returned no open PR.

Founder decision (2026-11-14): a small Figma pass for the three open points of `docs/figma-pass-p-report.md` section 8.

## 1. The frames found

A live scan of every instance on page `0:1` whose component or set name mentions "carousel" or "final week" found exactly two feed frames, each with one carousel instance:

| Feed frame | Instance | Parent | Used before |
|---|---|---|---|
| `6661:26929` Community — Home Feed — Final Week Showcase — Desktop (1440 x 2172) | `6661:29097` | `Frame 5802` (`6661:27088`, vertical auto-layout), index 0, FILL x HUG, 796 x 323 | set `6697:26234`, variant `Page=1` (`6661:26780`), "Showing 1–3 of 6 finalists" |
| `6661:29200` Community — Home Feed — Final Week Showcase — Mobile (390 x 1014) | `6661:29294` | `Content` (`6661:29202`, vertical auto-layout), index 1, FILL x HUG, 358 x 438 | set `6697:27448`, variant `Page=1` (`6661:26865`), "Showing 1–3 of 6 finalists" |

The other carousel-like nodes were left alone on purpose: the two Contest-page modules (`6661:29143`, `6661:29354`, inside archived frames, not carousels), the standalone state frames of pass O (`6836:29561` and others), the archived Page=3 components, and one older promo banner instance inside an archived frame (`5802:9051`).

## 2. What changed

Only these two nodes were edited:

- `6661:29097`: `swapComponent` to `6841:29676` (set `6841:29675`, desktop, `Page=1`). Footer now reads "Showing 1–3 of 9 finalists".
- `6661:29294`: `swapComponent` to `6843:29676` (set `6843:29675`, mobile, `Page=1`). Footer now reads "Showing 1–3 of 9 finalists".

Position, index, FILL x HUG sizing and size are unchanged: 796 x 323 and 358 x 438 before and after, parent heights unchanged (`Frame 5802` 1749, `Content` 950, frames 2172 and 1014). Nothing else moved and no frame grew. The instances sit in vertical auto-layout parents, so no overlap is possible; the sibling check found none.

One addition beyond the brief: the two instances' layer names still read "2 pages of 3 finalists", which would be false after the swap, so they were renamed to the names of the new sets ("... 3 pages of 3 finalists — 9 finalists, #418 item 4"). Layer names only.

Nothing was deleted or archived. The old sets `6697:26234` and `6697:27448` stay, as do the new sets and every other frame.

Visible strings come from the new sets ("Showing 1–3 of 9 finalists", the dots, the arrows). No new words, so nothing new to tag `[COPY PENDING LEGAL REVIEW]`. The one tagged sentence already inside the module is unchanged.

Screenshots in `docs/figma-pass-x-screens/`: `before-6661-26929.png`, `after-6661-26929.png`, `before-6661-29200.png`, `after-6661-29200.png`. Compared by eye: only the footer count changed and the third dot now exists (three dots instead of two).

## 3. Standing check (Decision Log #404 item 14)

Taken on the live file before and after the pass: 1,864 top-level nodes on page `0:1`, djb2 hash of the ordered top-level ids `1604224858` both times. No node was added, removed or reordered at the top level.

## 4. Audit

Of the two changed instances: 16 visible solid paints in each, 0 unbound; 0 paints bound to `brand/green-tint-28` (variable `5098:7071`); 0 new colours (nothing was authored, only a component swap); 0 overlaps with the originals.

## 5. Point (i): "Live from reveal" and "Week 4 final" chips: already done in pass R

Nothing changed. Live evidence from the file today: the six old Finalist impressions frames `6646:22745`, `6646:23097`, `6646:23419`, `6646:23765`, `6646:23984`, `6646:24345` (names start "Pre-week-4 (settings editable)") carry the chip "October 2026 · Before week 4" on five of them and the pill "Settings editable" on three; no frame still reads "Live from reveal" or "Week 4 final". This is what `docs/figma-pass-r-report.md` section 4 recorded. `6646:24345` has neither chip text; it was not part of pass R's change list and was not changed here.

## 6. Point (iii): tile club layers stay hidden

Nothing changed, and they should not be restored. Verified in the new sets: the "Finalist club (hidden — API returns no club, #418 item 5)" text layer is hidden (`visible = false`) on the three tiles of `6841:29676` and of `6843:29676`, so the swapped instances show no club line. The reason has not changed: no API returns a club for a finalist (the feed post carries only `clubPageId`; the contest read model has no club field).

## 7. Not done and open

- Two on-canvas notes are now stale and were not edited (the brief says not to edit other frames): `6664:27284` and `6664:27301` (the Pass K note says the Community-feed carousel samples 6 finalists in 2 pages) and `6698:26187` (says 2 pages of 3). The feed frames now show 9 finalists in 3 pages; the 6-finalist sets stay as the sample for a month with a forfeited week (pass P note `6843:29797`).
- The standalone pass O state frames (hover, press, single page, last page) still use the six- and five-finalist samples; they were not feed frames.
- Prototype behaviour of the new sets (arrows flipping pages) was drawn in pass P and not re-tested on the swapped instances here.
- Nothing about the other open points of pass P section 8 was touched.
