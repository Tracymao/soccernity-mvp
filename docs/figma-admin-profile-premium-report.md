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

