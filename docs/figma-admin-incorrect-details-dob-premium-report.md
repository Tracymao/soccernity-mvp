# Figma: admin Incorrect-details reports and Correct date of birth frames restyled to the premium design (Decision Log #617)

File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only. No code or CSS changed. Source of truth: `IncorrectDetailsReportsPage.tsx`, `CorrectDobPage.tsx`, `usersShared.tsx` and `users.css` at `origin/main` `afe0337`.

All frames: 1440 wide, at least 1184 high, Admin Shell active item "Users", title row at x301 y128, search bar at (302,182) 740x44, content at (301,258), width 1098, gap 20. Every existing frame was rebuilt: the old layers are hidden in "ARCHIVED Content" inside the frame, moved below it. Nothing was deleted.

## Group a: Incorrect-details reports

| Frame | State | New content | Dialog |
| --- | --- | --- | --- |
| `6737:27844` | List | `7423:70516` | |
| `6738:27962` | Truncated | `7423:70628` | |
| `6738:28144` | Empty | `7423:70743` | |
| `6738:28328` | Load error | `7423:70774` | |
| `6738:28510` | Already resolved (404) | `7423:70790` | |
| `6738:28693` | Resolve failed | `7423:70884` | |
| `6738:29952` | Loading | `7423:70999` | |
| `6738:30173` | Resolve confirm | `7423:71029` | `7423:71136` |

The three existing prototype links were copied to the new elements: Resolve (first row) to `6738:30173`, Retry to `6738:29952`, Cancel to `6737:27844`.

The task wrote the already-resolved case as 409. The code treats **404** as already resolved, and the frame is drawn that way.

