# Figma: Moderation Queue frames aligned to the shipped admin code (2026-11-27)

Figma and docs only. No application code, CSS, schema or legal text changed. This is the align step only; nothing was restyled.

Frames (page `0:1`): `5794:8635` "Moderation Queue" and `6947:40930` "Moderation Queue - reason category (B-284)". Source of truth: `ModerationQueuePage.tsx`, `moderationShared.tsx`, `moderation.css`. Founder decision (2026-11-27): match the code, drop the extras.

## Before and after

Before values were measured on `5794:8635`. The second frame got the same structure and keeps its reason categories. Positions are frame-relative.

| Item | Before | After (both frames) |
| --- | --- | --- |
| Title | Inter Semi Bold 28 at 300,45 | page-title style at 301,129 |
| Search bar | shell position | unchanged, 302,182 740x44 |
| Tabs | 2, with counts, beside the title | 5 plain tabs at y258, 35 high, x 301, 410, 481, 587, 723, no counts |
| Note under tabs | none | 13px at 301,313 |
| Table | 300,236 1100x325, rows 47 | 301,349 1098x364, header 43, rows 49 (76 with the minor flag) |
| Columns (table-relative x) | 20, 276, 382, 618, 794, 920 | 20, 136, 242, 388, 746, 872, 988 |
| Cells | preview text, reporter names, Type pill | short ids, plain Type text, Flags pills, "Review ›" link |
| Load more | none | outline button 100x34 at 301,733 |
| Callouts | one "Appeal routing" callout | two callouts, 48 and 67 high, at y787 and y855 |
| Frame | 1440x1184 | 1440x1184 |

## Removed Figma-only items (can return later as a deliberate feature)

- "Button — Export Queue" (`6073:14056`, `6947:40940`)
- "Button — Filter" (`7184:71441`, first frame)
- The Admin Shell's own "Filter" button on the second frame (shell property `Show Action Button` set to false)
- "Callout — Appeal Routing" (`5794:8781`, `6947:41005`) and a 4px spacer frame (`5794:8780`, `6947:41004`)
- Tab counts "(6)" and "(2)"
- Content preview text and reporter names in the rows
- The Type pill (Type is now plain text)

Removed layers are hidden and renamed `ARCHIVED - …`. Nothing was deleted.

Added to match the code: the three missing tabs (Media review, Contact enquiries, Held investigations), the Flags column, the note, Load more and the second callout.

## Differences from the code or the brief

- **Pre-agreed:** pill text is capitalised in Figma ("Low", "Open"). The code still renders lowercase; the code change comes in the M1 code PR (founder, 2026-11-26).
- The code sets the Reported id cell in a monospace face. Figma uses Inter Semi Bold, as the brief asked for a semibold cell.
- The "Held investigations" tab starts at x723; the brief says 724 (within 1px).

## Content node

`5794:8710` keeps its id and its box (300,45 1100x620). Two things inside it changed, because the shipped layout runs past that box (it ends at y665, the second callout ends at y922): `clipsContent` is now false and its children are positioned absolutely. The same was done on `6947:40932` in the second frame.

## Standing check

- Top-level nodes on `0:1`: 2004 (unchanged).
- Id hash (djb2-xor, excluding `7230:71662`): 2327422288 (unchanged).
- Content node box: 300,45 1100x620 (unchanged, see above).
- Overlaps: none between the frames and other canvas nodes, none between visible layers in either content node.
- Unbound solid fills outside the Admin Shell: 0. Inside the shell instance: 1 per frame, the inherited sidebar wash.
- Lowest text contrast outside the shell: 4.79:1.
- Pills: 21 high.
- Both frames were screenshot at 1000px.

Not checked: the live admin app was not re-run for this pass; the code numbers come from the brief's headless Chrome measurements.
