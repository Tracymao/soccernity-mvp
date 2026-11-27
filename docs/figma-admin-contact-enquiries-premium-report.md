# Contact enquiries frames: premium standard restyle (Figma + docs only)

Structure follows the shipped admin code. Design follows the premium frames (Moderation Queue, Report Detail, Held Investigations, Media review).

## Group 1: list frames (6876:30850, 6876:31297, 6876:31513)

| Item | Before | After |
| --- | --- | --- |
| Page title | "Moderation Queue" 28px inside the Top Row | Web/Title at (301,129) |
| Tabs | Filled pills with counts, in the Top Row | Underline text tabs at y258, 35 high, no counts: Open Reports, Appeals, Contact enquiries |
| Filter card | Field component instances, no chevron | 1098x132 at y313; two 300x44 selects with chevron and help line; Apply filter 115x40 |
| Table (list) | "Table — Held investigations", uppercase header, 62px rows, dividers | "Table — Contact enquiries", 1098x352 at y465; 40px tint header; 52px rows; column edges 20,128,270,437,579,722,814,906,1008; 6 sample rows kept; no Load more (the old frame had none) |
| Empty | Empty card 138 high | 1098x130 empty card at y465 |
| Load error | Banner instance | Alert-bar callout 1098x64 at y465 with inline Retry |

Frame heights: 1440x1184 (all three).
Archived (hidden): Top Row, Spacer, old Filter row (with the Field instances), old Header Row, Divider rectangles, Banner (load error).
