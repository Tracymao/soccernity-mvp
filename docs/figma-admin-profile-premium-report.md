# Figma: admin Profile frames restyled to the premium design (Decision Log #614)

File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only. No code or CSS changed. Source of truth: `AdminProfilePage.tsx`/`.css` and `pages/two-factor/` (card, dialog, backup codes) at `origin/main` `3c39ea4`. Sign-in screens were not touched.

All frames: 1440 wide, at least 1184 high, Admin Shell active item "None" (the code highlights no nav item on `/profile`), title "Admin Profile" at (301,129), content at (301,258), width 1098, gap 20. Every frame draws the whole page as the code renders it: profile card (760) above the two-factor card (560). In restyled frames the old layers are hidden in "ARCHIVED Content" below the frame. Nothing was deleted.

## Group a: two-factor card states

| Frame | State | New content |
| --- | --- | --- |
| `6902:32691` | Status could not be loaded | `7408:69881` |
| `6902:32811` | Regenerate backup codes, password | `7408:69930` |
| `6902:32956` | Regenerate, incorrect password | `7408:69994` |
| `6902:33104` | New backup codes shown once (now a dialog) | `7408:70063` |
| `7408:71262` (new) | Loading two-factor status | `7408:71407` |
| `7408:71409` (new) | Not turned on | `7408:71554` |

"On, required" is drawn by the profile view `5403:7327` (group d).

## Group b: enforcement off

| Frame | State | New content |
| --- | --- | --- |
| `6906:33681` | On, Turn off available | `7408:70138` |
| `6906:33808` | Turn off, password dialog | `7408:70183` |
| `6906:33959` | Turn off, incorrect password | `7408:70247` |
| `6906:34113` | Turned off | `7408:70313` |

## Group c: change password

| Frame | State | New content |
| --- | --- | --- |
| `7073:63591` | Panel, default | `7408:70359` |
| `7073:63765` | New password too short | `7408:70412` |
| `7073:63941` | Passwords don't match | `7408:70465` |
| `7073:64117` | Current password incorrect | `7408:70518` |
| `7073:64293` | Generic error | `7408:70571` |
| `7073:64469` | Saving | `7408:70620` |
| `7073:64643` | Password changed | `7408:70654` |

## Group d: profile view and edit

| Frame | State | New content |
| --- | --- | --- |
| `5403:7327` | View (two-factor on, required) | `7408:69841` |
| `7408:70656` (new) | Edit | `7408:70816` |
| `7408:70818` (new) | Edit, saving | `7408:70978` |
| `7408:70980` (new) | Edit, could not save | `7408:71144` |
| `7408:71146` (new) | Page loading | `7408:71260` |

## Archived frames

| Frame | Reason |
| --- | --- |
| `6902:32565` Two-factor card, 1 On | Once both match the code, it draws the same page as `5403:7327` (view with two-factor on, required). `5403:7327` was kept as the route's main frame. No prototype link from a visible admin frame pointed to `6902:32565`. Hidden, "ARCHIVED " prefix, moved below; its contents were not restyled. |

## Unsure

None. (`1466:15934` "Edit Profile" and `6747:29445` are not Admin Console frames and were not touched.)

## Where the old frames and the code disagreed (the code wins)

- Two-factor frames showed only the two-factor card; the code always draws the profile card above it. Change password frames lacked the two-factor card below.
- New backup codes were drawn inline in the page; the code shows them in a dialog, in one two-column box (the old frames had one box per code).
- The dialogs had a close box; the code has none, so none is drawn.
- "[COPY PENDING LEGAL REVIEW]" tags removed from the two-factor frames; the code renders none (they remain only in hidden layers).
- Title "Admin profile" became "Admin Profile".
- The view frame had 100px value boxes and an avatar without initials; the code has 48px boxes and initials.
- The change password and view frames had background image layers; the code has no background image. Archived.
- Backup codes are not monospace in the code (Inter, tabular figures, letter spacing), so they are drawn in Inter.

## Choices to check

- The "turned off" banner spans the full 1098 content width: the code renders it outside both cards with no width cap. This looks unintended in code.
- Inputs have no 2px transparent border (it is invisible), and no field has an alert border because the code never marks a field invalid.

## Code has them, no frame

- Edit: a server-supplied save error message.
- Change password: a server-supplied error message.
- Regenerate: "Working…", "Couldn’t regenerate your backup codes. Please try again.", enabled button before submit.
- Turn off: "Working…", "Couldn’t turn off two-factor. Please try again.", enabled button before submit.
- Backup codes: "Copied", ticked checkbox with Done enabled.

## Notes for a code PR

"Code" sizes are from a throwaway headless-Chrome harness (real `foundations.css`, `global.css`, these two CSS files, hand-copied markup, runtime colour variables not set) or read from the CSS. Not measured in a built app. "Scope" says whether a `twoFactor.css` rule is also used by the sign-in screens.

| File | Item | Code | Frames | Scope |
| --- | --- | --- | --- | --- |
| AdminProfilePage.css | Card | padding 36, gap 24, radius 12 | padding 20, gap 12 | profile |
| AdminProfilePage.css | Name / role | 22/600, 15 | 20/600, 14 | profile |
| AdminProfilePage.css | Field label | 14/500 secondary | 13 Semi Bold primary | profile |
| AdminProfilePage.css | Value box | 48 high, radius 6, 15px | 44, radius 8, 14px | profile |
| AdminProfilePage.css | Input | 44 high, radius 6, bordered, white | 44, radius 8, green tint 12% | profile |
| AdminProfilePage.css | `.admin-btn` | 47 high, radius 6, 16/500 | 40, radius 8, 14 Semi Bold | check other users first |
| AdminProfilePage.css | Error | bordered box, radius 4, 37 high | alert callout with alert bar | profile |
| AdminProfilePage.css | Panel gap | 16 | 12 | profile |
| twoFactor.css | `.tf-profile-card` | radius 10, `margin-top: 20px` | radius 12, 20 gap | profile and Roles |
| twoFactor.css | `.tf-pill` | 20 high, 12/600 | 24 high, 12/500 | profile and Roles |
| twoFactor.css | `.tf-btn` | 42 high, radius 4 | 40, radius 8 | **shared with sign-in** |
| twoFactor.css | `.tf-banner` | radius 8, 1px border | radius 6, no stroke, green tint | **shared with sign-in** |
| twoFactor.css | `.tf-field input` | 40 high, radius 4, bordered | 44, radius 8, green tint 12% | **shared with sign-in** |
| twoFactor.css | `.tf-codes__item` | 15/600 | 14/600 | **shared with sign-in** |
| twoFactor.css | `.tf-check input` | 16px native | 16, radius 6, navy outline | **shared with sign-in** |
| twoFactor.css | `.tf-text` in dialogs | 13px | 14/22 | scope to `.tf-dialog` |
| twoFactor.css | `.tf-dialog` | 460, radius 10, padding 24, no header band | 560, radius 16, header band and divider | in-session dialogs |

## Standing check (passed)

- Top-level count **2023** = 2017 + 6 new frames.
- Id hash of the first 2017 ids (excluding `7230:71662`): **4020296636**. First 2004: **2327422288**.
- Queue content `5794:8710` 1100x620; Report Detail `5796:8635` content 1098x1282; Appeal Review `5796:8753` content 1098x1455.
- 22 restyled and new frames: 1440 wide, at least 1184 high, no overlap with another visible top-level frame, no unbound solid fill or stroke outside the Admin Shell, no text under 12px, no uppercase text case, no "[COPY PENDING" text, one search bar. 0 issues.
- Screenshots (1000px) checked in all four groups and compared with the harness structure. Contrast and dark mode were not checked. Sample data is reused from the old frames.
