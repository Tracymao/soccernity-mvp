# Figma: admin Activity frames restyled (Decision Log #611)

File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only. Source: `AuditLogPage.tsx`, `activity.css`, `adminActionLog.ts` and `moderation.css` on `977a221`.

## Frames

All stay 1440x1184, Admin Shell active item "Activity". Title at (301,129), content at (301,258), width 1098, gap 20.

| Frame | State | New content |
| --- | --- | --- |
| `6939:39109` | Audit log, list | `7394:76159` |
| `6940:38937` | Audit log, empty | `7394:76414` |
| `6940:39127` | Audit log, loading | `7394:76496` |
| `6940:39356` | Audit log, load error | `7394:76708` |
| `6939:39539` | My activity, list | `7394:76792` |
| `6940:39550` | My activity, empty | `7394:77014` |
| `6940:39724` | My activity, loading | `7394:77097` |
| `6940:39925` | My activity, load error | `7394:77304` |

Layouts are cloned from the restyled Username reviews list (`6955:42228`) and the Suspected illegal states (`7075:65573`, `7075:65920`). In each frame the old content layer is hidden, renamed "ARCHIVED …" and moved below the frame. Nothing was deleted from the old layers.

No "[COPY PENDING LEGAL REVIEW]" tags were found in the 8 frames, so none were removed.

## Where the old frames differed (the code wins)

- Date fields show the browser's empty date input ("dd/mm/yyyy"), not "Any date". The calendar icon is not drawn.
- Targets read "<Type> #<8 characters>" instead of names ("Dayo Adeleke", "nelson_k") or short numbers ("#1042"). "Email search" is plain text; other targets are 600 and underlined.
- Time has a comma: "2 Nov 2026, 14:05".
- Loading is a skeleton table (header and five rows, 6 or 5 columns).
- Load error is the alert callout with an inline "Retry" link, no button.
- Sample rows are fewer than 20, so no "Load more" is drawn.

## Where these frames differ from the shipped CSS (notes for a code PR)

| Item | Frames | Code |
| --- | --- | --- |
| Table header | sentence case | `.al-row.mod-table__row--head` sets `text-transform: uppercase` |
| Row text | 14/22, rows at least 52 | `.al-row` is 13px with no minimum height |
| Filter field gap | 12 | `.hi-filter__row` gap is 16 (superadmin row then has about 1px to spare and may wrap the button) |
| Skeleton rows | 40 high (as code) | same |

## Code has them, no frame

- Filtered empty: "No matching activity" / "Try a different filter."
- Date errors: "The end date can’t be before the start date." and "Check the dates and try again."
- "Load more" / "Loading…" and "Couldn’t load more activity. Try again."

## Follow-ups

- The Admin Shell on the "My activity" frames still shows the role "Superadmin" (shell sample data, unchanged here). My activity is the non-superadmin view.
- The task brief as received ended mid-sentence after "Skeleton: bars 12 high radius 4". Empty, error and docs work followed the code and the previous passes.

## Before/after check

- Top-level nodes: 2004 before and after, same ids in the same order.
- 8 target frames, descendants before → after: 203→273, 143→159, 203→259, 145→159, 183→237, 138→152, 183→231, 140→152.
- Other top-level nodes, by index range: 700–1400 (51,471) and 1400–end (48,553) are identical. **0–200 fell from 81,867 to 76,842 and 200–700 from 52,666 to 51,207. The cause is not established.** The scripts wrote only inside the 8 frames. The Admin Shell instance measured 128 descendants in the target frames before and 111 after, and an untouched frame's shell (`6955:42228`) also measures 111, so the shift may be in Admin Shell instances generally. It has no per-node baseline, so this is not proven. Worth a look in Figma version history before merge.
