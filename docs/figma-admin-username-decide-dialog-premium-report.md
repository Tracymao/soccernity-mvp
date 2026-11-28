# Figma: Admin Username reviews decide dialog, premium restyle

Date: 2026-11-28. Branch `docs/figma-admin-username-decide-dialog-premium`, from `origin/main` `b2c7022`. Register section 182, Decision Log #610. Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only. No code or CSS changed.

Source of truth: `apps/admin/src/pages/username-reviews/DecideDialog.tsx`, `usernameReviews.css` and `moderation.css` at `origin/main`.

## Frames, group (a) (all 1440x1184, frame ids kept)

| Frame | Dialog | Shows |
| --- | --- | --- |
| `6955:44021` | `7391:69549`, 560x545 | Reinstate selected, 35 / 500, "Reinstate username" |
| `6955:44629` | `7391:69636`, 560x573 | Decline selected, "Too short", "Enter at least 10 characters.", 9 / 500, "Decline request" |
| `6955:44829` | `7391:69724`, 560x545 | Saving: radios disabled, Cancel at 55%, "Saving…" in the Disabled variant |

## Frames, group (b)

| Frame | Dialog | Callout (title) |
| --- | --- | --- |
| `6955:45029` | `7391:69812`, 560x645 | "This request can’t be decided any more" |
| `6955:45233` | `7391:69896`, 560x645 | "You can’t decide this request" |
| `6955:45437` | `7391:69980`, 560x625 | "This request was already decided" |
| `6955:45641` | `7391:70064`, 560x625 | "This request was not found" |
| `6955:45845` | `7391:70148`, 560x625 | "Couldn’t save the decision" |

All five keep Reinstate selected, the typed reason, 35 / 500 and "Reinstate username".

**Renamed:** `6955:45641` "… (Error — Child-Safety Vetting Needed)" is now "… (Error — Request Not Found)". The code has no vetting state: a minor's request the admin may not see answers with the same 404 as a missing request.

**Code has them, no frame:** the handle-unavailable error ("This username can’t be restored") and the user-deleted error ("This account has been deleted"). No frames were created.

## How each frame is made

- The existing Admin Shell instance (1184 high, "Username reviews" active) is kept.
- The page behind is a clone of the page title and content of Detail (Pending) `6955:43541`. The cloned back link's prototype reaction was removed.
- The scrim and dialog shell are cloned from the Set-aside dialog (`7368:69948`, `7368:69949`): 560 wide, radius 16, `elevation/overlay`, centred in the 1440x1184 frame.
- The options, radios, textarea, hint row and callout are drawn to the CSS, with existing variables and text styles. The 13/20 callout lines and the 12/20 field error have no text style.
- "Cancel" is the Neutral button with a navy border. In Saving it is at 55% (`.mod-btn:disabled`); the confirm uses the Primary Disabled variant.

## Where Figma follows the code and not the brief

- **Selected option:** `.ur-option--selected` only changes the border to navy. The background stays the surface colour, so no green tint was drawn.
- **Disabled textarea:** the shipped textarea looks the same when disabled (author colour and background win over the browser's), so it is drawn unchanged. The close box has no disabled style either. Only the radios, Cancel and the confirm look disabled.

## Archived layers

In each frame the old `Content`, `Scrim` and dialog are hidden, prefixed `ARCHIVED ` and moved below the frame. Nothing was deleted.

| Frame | Content, Scrim, Dialog |
| --- | --- |
| `6955:44021` | `6955:44023`, `44064`, `44065` |
| `6955:44629` | `6955:44631`, `44672`, `44673` |
| `6955:44829` | `6955:44831`, `44872`, `44873` |
| `6955:45029` | `6955:45031`, `45072`, `45073` |
| `6955:45233` | `6955:45235`, `45276`, `45277` |
| `6955:45437` | `6955:45439`, `45480`, `45481` |
| `6955:45641` | `6955:45643`, `45684`, `45685` |
| `6955:45845` | `6955:45847`, `45888`, `45889` |

## Prototype links

- On all eight old frames, Close and Cancel pointed at `6878:31198` (Contact enquiry detail), the confirm at `6878:31438`, and the old header at `6876:30850`. None of these makes sense, so none was carried to the new layers. The new dialogs have no links. The old links remain on the archived layers.
- The brief expected the Detail page buttons to open the dialog frames. `6955:43541` has no such links (only its back link), and none were added.

## Removed copy tags

None. No layer or string on the eight frames carried "[COPY PENDING LEGAL REVIEW]".

## Dropped: the old frames showed it, the code does not render it

- The page behind: the "Review request #214" title, uppercase "REMOVAL", "REQUEST" and "ACTIONS", "Reason recorded at removal" ("Impersonation concern") and "New username chosen" ("No").
- `6955:45641`: the "Child-safety vetting needed" callout and its text.

Also changed: the counter read "36 / 500" for a 35-character reason. The Decline frame showed an empty box with "0 / 500" next to its too-short error; it now shows "Too short" and "9 / 500".

## Assumptions

- Sample person "Ada Bello", username "@adab", request `#3f8a21c4`, as on the restyled Detail frame.
- Reasons: "Second review found no rule broken." (reused from the old frames) and "Too short" (9 characters).
- The Saving frame has Reinstate selected.
- No frame has an empty textarea, so the placeholder "Enter the reason for this decision." does not appear.
- No focus ring is drawn, although the shipped dialog focuses the reason field on open.

## Notes for the code PR

Measured in headless Chrome on a throwaway harness (real `foundations.css`, `global.css`, `moderation.css`, `usernameReviews.css` and Inter; markup copied by hand from the TSX; the colour variables set by hand). Differences over 1px:

| Item | Shipped | Figma | Cause / fix |
| --- | --- | --- | --- |
| Textarea | 108 high | 96 | `rows={4}` beats the 96 min-height. Scoped `height: 96px` in `usernameReviews.css` (it needs a class on the textarea or a scoped selector) |
| Option row | 60 high | 64 | No line-height: `.ur-option__title` 17 against 20, `.ur-option__help` 15 against 16. Set 20px and 16px |
| Both options with gap | 132 | 140 | As above |
| Field error | 15 high | 20 | `.mod-dialog__field-error` has no line-height (shared; scope it, or change all dialogs) |
| Dialog, valid and Saving | 560x549 | 560x545 | Net of textarea +12, options -8 |
| Dialog, error callout | 560x649 / 629 | 645 / 625 | Same cause |
| "Saving…" button | 101.5 wide | 98 | Text rendering or the Disabled variant; check |

With all three fixes the heights should match within 1px (calculated, not re-measured).

Matching within 1px or exactly: dialog width 560, header 77 against 76, title, close box 32x32, lead sentence 32, label-to-textarea 8, hint row 20, callout 84 and 64, actions row 64, buttons 40 high, other button widths, dialog height in the too-short state (572 against 573, because the textarea and field error differences nearly cancel).

Not measured: a real built app, dark mode, hover and focus.

**Possible correction to the list and detail report (#609):** it measured with the colour variables unset, on the assumption that they do not change sizes. They do: an unset variable voids a whole `border` shorthand, so 1px borders disappear. Its "Pending pill 67 against 69" row is probably this. Re-measure before the code PR.

## Checks

- Top-level count **2004**; id hash (excluding `7230:71662`) **2327422288**.
- Queue content `5794:8710` 1100x620; Report Detail `5796:8635` content 1098x1282; Appeal Review `5796:8753` content 1098x1455.
- The eight frames overlap no other top-level node.
- On all 8 frames, outside the Admin Shell: no text under 12px, no uppercase labels, no unbound solid fills or strokes, one search bar. Lowest enabled text contrast in the dialogs 5.01:1; disabled text in Saving is 3.28:1 (disabled controls are exempt).
- Screenshots reviewed: `6955:44629`, `44829`, `45029`, `45641`. The other four use the same build script and were checked by their sizes and the rule checks.
