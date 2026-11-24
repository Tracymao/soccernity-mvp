# Figma gaps B: own-post menu (G2) and admin article composer (G4)

Figma only. Page `0:1`, file `weZWWqggy9j13eX8bhFgs6`. No code, tests, strings, docx, register or legal draft changed. Frames are additions; no existing frame was edited. Nothing is tagged `[COPY PENDING LEGAL REVIEW]` (no code string carries it).

## G2 Own post "Post options" menu (OwnPostMenu.tsx)
Row at y 343700. Notes frame `7120:69293` at y 344400.

| Frame | Id |
|---|---|
| G2-1 trigger closed | `7119:69271` |
| G2-2 menu open | `7119:69321` |
| G2-3 comment settings | `7119:69378` |
| G2-4 settings error | `7119:69439` |
| G2-5 confirm delete | `7119:69503` |
| G2-6 deleting | `7119:69560` |
| G2-7 delete error | `7119:69617` |
| G2-8 mobile menu | `7119:69677` |
| G2-9 mobile confirm | `7119:69734` |

11 links read back: G2-1 Post options to G2-2; G2-2 Manage comment settings to G2-3, Delete post to G2-5, Close to G2-1; G2-3 and G2-4 Done to G2-1; G2-5, G2-6, G2-7 Cancel to G2-2; G2-8 Delete post to G2-9; G2-9 Cancel to G2-8. G2-8 Close has no link (a frame cannot link to itself).

## G4 Admin article composer (CreateArticlePage.tsx, CoverImagePicker.tsx)
Row at y 345000, 1440 x 1184 each, clones of `124:313` with a new auto-layout form column. Notes frame `7123:70217` at x 0, y 346500. Original card children are hidden inside the clones, not deleted.

| Frame | Id |
|---|---|
| G4-1 default | `7122:69271` |
| G4-2 picker loading | `7122:69435` |
| G4-3 picker with images | `7122:69602` |
| G4-4 cover chosen | `7122:69786` |
| G4-5 picker load error | `7122:69954` |
| G4-6 saving | `7122:70123` |
| G4-7 publishing | `7122:70291` |
| G4-8 submit error | `7122:70459` |

Links (G4 frames only): G1 Choose cover image to G2 and Publish to G8; G2, G3, G5 Close to G1; G3 image tile to G4; G4 Remove to G1, Change to G3, Save as Draft to G6, Publish to G7.

## Reused
Admin Shell instance, F2 button/field styles, Soccernity Theme Light variables, `elevation/menu`. No raw hex.

## Defaults (veto-able)
- Delete post button is navy (no destructive token exists).
- Disabled Upload Images drawn at 50% opacity.
- Sample filename "stadium-night.jpg" and placeholder image tiles.
- Trigger glyph on G2 is a placeholder.
- Menu labels follow the code ("Manage comment settings", "Delete post", "Close"), not the brief's wording.

## Open points
- Save as Draft and Publish saving/publishing states disable the other button in both (as coded).
- Back arrow and page title come from the cloned frame.

## Stale code comments (not edited)
OwnPostMenu.tsx line 2; CoverImagePicker.tsx line 3; coverImagePicker.css line 2; CreateArticlePage.tsx lines 11, 17, 23.

## Standing check
- Top-level nodes: 1,921 before, 1,940 after (+9 G2, +1 G2 Notes, +8 G4, +1 G4 Notes).
- Hash of the 1,921 original ids (djb2): 1356659678 before and after, unchanged.
- Overlaps among the 19 new frames and with existing top-level nodes: 0.
- Prototype reactions: 21 (G2 11, G4 10 incl. tile), every destination exists.
- Unbound solid fills in G4 frames: 8 each of `Create New Post`, `Rectangle 35`, `Vector` x2, `Rectangle 223`, all inherited from the cloned page and Admin Shell (Decision Log #199), none authored.
- Screenshots in `docs/figma-gaps-b-screens/` (g2-4, g4-3, g4-8). Not every frame was screenshot-compared; G4-1, 2, 4 to 7 and G2 frames other than G2-4 were checked by structure only.
