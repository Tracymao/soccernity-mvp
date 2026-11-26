# Design foundations (Figma only)

Task: define radius, type, elevation and motion scales as Figma variables, styles and one reference frame. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. No existing screen, style effect, code or legal draft was changed. All values are defaults, veto-able.

## What was created
- Collection `Soccernity Motion` (`VariableCollectionId:7188:2`): duration/fast 120, duration/base 200, duration/slow 320 (ms), distance/sm 4, md 8, lg 16 (px), stagger/step 40.
- Radius: `radius/16` renamed `radius/xl` (bindings keep working). Descriptions on sm 6, md 8, lg 12, xl 16, full 999. `radius/2` (accent bars only) and `radius/10` marked legacy. Migration guide: 4 and 5 to sm; 10 to md for controls and lg for containers; 14 to lg; 18 and 20 to xl; 25 and above on pills to full.
- Ten text styles `Web/Caption` 12/16, `Web/Body small` 13/20, `Web/Body` 14/22, `Web/Body large` 16/24, `Web/Lead` 18/28, `Web/Title small` 20/28, `Web/Title` 24/32, `Web/Headline` 32/40, `Web/Display` 44/52, `Web/Hero` 62/68. Inter 400/500/600; Montserrat 600/700 for hero to title small on public web pages. Minimum text size 12. The `Admin/` and `Community/` styles are untouched and the new styles are not applied to any existing frame.
- Effect style `elevation/card` (y1 blur3, shadow-ambient variable). Level 0 flat, 1 card, 2 `elevation/menu`, 3 `elevation/overlay` (descriptions added, effects not edited).
- Reference frame `7188:71447` (1440 wide, page `0:1`, y 357719): radius swatches, type specimens, four elevation cards, motion tables (durations, easings, distances, stagger), a behaviour table (hover, press 0.98, focus ring, tab or chip change, table row hover, card lift, skeleton fade, live dot pulse 1.6 s, score highlight, route change, dialog, toast, list stagger) and the rules including reduced motion. The frame states that Figma cannot play motion and the code PR owns behaviour.

## Standing check (Decision Log #404 item 14)
- Top-level nodes 2,000 before, 2,001 after (the one new frame).
- Hash of the original ids (djb2-xor over joined ids, excluding the new frame): 763113808 before and after.
- Overlaps with other top-level nodes: 0.
- Frame `7188:71447`: 177 nodes, 121 text nodes, 0 unbound solid fills, 0 text under 12 px. Text uses `color/text/primary` on `color/background/surface` (existing tokens, above 4.5:1).
- Reactions on `5204:6728` and `5543:7407`: 5 each, unchanged.
- radius/16 count: only the F2 components frame could be measured (12 bound nodes, 0 whose value is not 16). A whole-file count failed in the plugin API (too many nodes). The rename preserves bindings.
- Screenshots: taken for the elevation and motion sections; the tool returned URLs only, so I did not inspect the images myself. Not verified visually.

## Not done
No prototype links, no code, no adoption of the new styles on existing frames. The code PR for motion and the migration of existing radii are separate.
