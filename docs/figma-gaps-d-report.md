# Figma gaps D: report

Figma only. No code, tests, strings elsewhere, docx or register were touched. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Follows the merged gap passes #875, #876 and #877.

## 1. G2: stray media-report menu hidden in nine frames

Each of these frames still showed the open media-report menu ("Report this picture / Report post / Cancel") cloned from `6849:29863`. In every frame, inside the child frame "Media — img", I set `visible = false` on two children, the same approach G6-1 (`7116:69268`) used:

- "Report menu" (the open menu)
- "Report control — more" (its trigger state)

Nothing was deleted. The frame ids are unchanged:
`7119:69271`, `7119:69321`, `7119:69378`, `7119:69439`, `7119:69503`, `7119:69560`, `7119:69617`, `7119:69677`, `7119:69734`.

Screenshots checked (in `docs/figma-gaps-d-screens/`):

- `G2-1.png` (7119:69271): only the closed "Post options" trigger.
- `G2-2.png` (7119:69321): only the own-post menu (Manage comment settings, Delete post, Close).
- `G2-5.png` (7119:69503): only the delete confirmation.
- `G2-8.png` (7119:69677, mobile): only the own-post menu.

Popover positions: none is clipped. The desktop menu sits at the top right and the mobile menu at the left, and both overlay part of the post text. That is how a popover reads, and I did not move them. The mobile menu covers the lower edge of the text block but not the avatar or the author line.

## 2. G4: "Choose a cover image" text

Frames `7122:69435` (G4-2), `7122:69602` (G4-3) and `7122:69954` (G4-5) drew "Choose a cover image" as visible text inside the "Picker panel" frame. In `apps/admin/src/pages/articles/CoverImagePicker.tsx` line 104 it is only `aria-label="Choose a cover image"` on a `div role="group"`, so it is not visible in the built page.

I hid the three text nodes (`7122:69587`, `7122:69754`, `7122:70106`; `visible = false`, not deleted). The visible label "Cover image (optional)" above the panel stays, as it matches the built page. G4-3 screenshot: `G4-3.png`; the panel shows the thumbnails with no extra heading.

## 3. G5-10: new frame

`Edit Profile — Change Password — Too short (G5-10)`, id `7132:70207`, 560 x 544, at x 6000, y 347000 (clear of the G5 Notes frame `7128:70207` at x 5770). Cloned from G5-5 (`7127:70284`) with the message changed to the code string "New password must be at least 8 characters." (EditProfileModal.tsx). Same styling and tokens as G5-5.

Links (read back after cloning): "Button — Change Password" goes to G5-4 (`7127:70241`) and "Button — Save new password" goes to G5-6 (`7127:70330`). Screenshot: `G5-10.png`.

Note: I first placed it at x 5770, which overlapped the Notes frame; I moved it before the final check.

## Standing check

- Top-level nodes on page `0:1`: 1,950 before, 1,951 after (+1, the new G5-10).
- Hash of the ordered top-level ids excluding the new frame: `2070104470` before and after (the same function was used both times). All nine G2 ids, three G4 ids and every other id still present.
- Overlaps for G5-10: 0. Unbound visible solid paints in G5-10: 0.
- Nothing deleted; hidden layers only.

## Not done / limits

- Screenshots of G2-3, G2-4, G2-6, G2-7 and G2-9 were not taken; the same hide operation was applied, but only G2-1, G2-2, G2-5, G2-8, G4-3 and G5-10 were compared by eye.
- G4-2 and G4-5 were not screenshotted (same edit as G4-3).
- No per-node property snapshot of the whole canvas was taken, only counts and the id hash.
