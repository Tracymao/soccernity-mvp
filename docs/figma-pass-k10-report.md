# Figma pass K10 — cover crop states, withdrawal 400 errors, Block rebase

Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, legal copy, DPIA, Decision Log docx or build register changed. Source: Decision Log #415 items 2–5 (K10 scope), #414 item 2. Screenshots, before and after for every changed frame, are in `docs/figma-pass-k10-screens/`.

## 1. What changed

### (a) Cover crop: "image too small" and the zoom relabel
- **Zoom control** on desktop `6812:29354` and mobile `6812:29396`: value text `140%` is now `1.4x`; "1x" and "3x" labels sit under the ends of the track; the fill and thumb are scaled to the 1x to 3x range (1.4x is 20% along the track).

| Frame | Fill width (old to new) | Thumb x (old to new) |
|---|---|---|
| Desktop (track 300) | 120 to 60 | 110 to 50 |
| Mobile (track 170) | 68 to 34 | 58 to 24 |

  The control is an auto-layout row, so the labels are absolute children and the frame has 16 px bottom padding for them. Parent frames are auto-layout and reflowed: desktop crop frame height 655 to 687, mobile 584 to 751 (this includes (b)).
- **New states** (cloned from the crop frames, stage, zoom, preview and image-check hint removed): `6826:29317` desktop and `6826:29358` mobile, below the crop row at y 96750. Wording is the built wording from `CoverCropDialog.tsx`: title "This image is too small", alert "A cover photo needs to be at least 796 pixels wide. This one is 640 pixels wide. Choose a larger image." with a `semantic/alert` accent bar (bar only, text stays navy), primary "Choose another image", secondary "Cancel". 640 is a sample width. No legal-review tag (functional wording, #412 item 5).

### (b) Mobile crop preview
- The preview was a 280 × 68 block (not the slot's shape). It is now a clipped 350 × 107.69 slot (390:120 scaled to the 350 px column) holding the 796:192 crop scaled to cover the slot: 446.47 px wide, so about 48.24 px is trimmed from each side. The stand-in picture is flat `brand/green`, so the trim is documented in the layer names (`Preview slot (cover 390:120, ...)`, `Cropped result (...)`), not visible as a feature in the picture.
- Caption: old "This is how your cover will look on your profile." New "This is how your cover will look on a phone. The sides are trimmed to fit." The desktop caption is unchanged.

### (c) Guardian Withdrawal inline 400 error
Four new frames, cloned from the originals, with an alert (3 px `semantic/alert` bar + 14 px Inter semibold navy text) between the field and the actions, as in the built page (`GuardianWithdrawalPage.tsx`, `.gw__alert`):

| Frame | New id | Text |
|---|---|---|
| 1 Request, desktop | `6827:29312` | Enter the email address of the Soccernity account. |
| 3 Confirm, desktop | `6827:29343` | Paste the withdrawal code from the email. |
| 1 Request, mobile | `6827:29380` | (same as request) |
| 3 Confirm, mobile | `6827:29411` | (same as confirm) |

Wording is untagged. The input border is not recoloured (the built page does not recolour it either). Placed at x 17504 onward, y 5950 and 7050, clear of every existing node.

### (d) Block confirmation rebase and Blocked users rows
- `6655:27355`: the legacy `Profile (cloned, menu open)` layer `6655:27356` is hidden and renamed `ARCHIVED — ...` (not deleted). A clone of `6747:28894` (Navbar + `Body` with the three columns) is the new bottom layer, clipped by the 1440 × 900 frame, under the unchanged scrim and dialog.
- Old values replaced in the clone, all post authors set to the profile owner (`Adeniyi Christiana`, `@christine001`):

| Node | Old name | Old handle |
|---|---|---|
| `6828:29552` / `6828:29554` | Emeka John | @mekusa |
| `6828:29668` / `6828:29670` | Eleanor Pena | @mekusa |
| `6828:29705` / `6828:29707` | Emeka John | @mekusa |
| `6828:29740` / `6828:29742` | Emeka John | @mekusa |

- **Blocked users rows** (list `6705:26172` desktop / `6706:26580` mobile, and both unblock-confirmation frames `6705:26659` / `6706:26697`): each row now shows the public name once, as `BlockedUsersPage.tsx` does. Old to new: `Adeniyi Christiana` + `@christine001` to `christine001`; `Emeka John` + `@emeka_john` to `emeka_john`; `Tunde Bakare` + `@tunde_b` to `tunde_b`. The handle lines are hidden, not deleted. Avatar initials `AC` / `EJ` / `TB` to `C` / `E` / `T` (first letter of one word, as `initialsFor` gives). The mobile list frame hugged from 561 to 543.

### (e) Blocked-profile notice tag
The `Copy Tag` frame (text `[COPY PENDING LEGAL REVIEW]`) is hidden on `6706:26750` (tag `6706:26838`; the frame hugged 526 to 493) and `6707:26595` (tag `6707:26725`; frame stays 690). Hidden, not deleted.

## 2. Counts and checks (standing check, Decision Log #404 item 14)
- Top-level nodes on `0:1`: 927 to 934. Seven new: two too-small frames, four withdrawal 400 frames, one note (`6830:29312`).
- Hash of the 927 original top-level ids: before `1378743177`, after `1378743177` (same ids, same order).
- Total nodes on the page: 143,854 to 144,686 (the clone of the other-user frame accounts for most of it).
- Paint audit of the seven new top-level nodes: 0 unbound visible solid fills or strokes. 0 overlaps of the new frames with any other top-level node.
- Nothing deleted. Hidden: the legacy profile layer, the 12 handle text nodes (three per Blocked users frame, four frames), two tag frames.

## 3. Open and not done
- The rebased Block frame keeps the left-rail "Suggested" row `Emeka John @mekusa`. It is a suggestion, not an author, so it was left. Say so if you want it renamed too.
- `Eleanor Pena` (`6828:29668`) may have been a comment author, not a post author. It is below the visible area (y 1416) and was set to the owner with the others for consistency.
- The "menu open" detail of the legacy frame (Copy Profile Link / Block menu) is not reproduced; the dialog covers that area.
- The crop preview stand-in is flat, so the trimmed sides cannot be seen in the picture, only read from the layer names and the caption.
- Code is not changed: `CoverCropDialog.tsx` still shows the zoom value as a percentage (`140%`), the Figma now says `1.4x`. That is an FC7 point if the percentage is to go.
- Decision Log #415 forward-pointers and register status lines are not appended by this pass.
