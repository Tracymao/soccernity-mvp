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

## Group 2: detail frames (6878:31198, 6878:31438, 6878:31683)

| Item | Before | After |
| --- | --- | --- |
| Page title | Inside Content, under the back link | Web/Title at (301,129) |
| Back link | Small, above the title | 14 Medium, 20 high, at y258 |
| Pills | Mixed heights | 24 high, gap 8, at y298; Escalated and From Contact Us are navy outline |
| Cards | Uppercase titles (ENQUIRY, MESSAGE, REPORTED ENQUIRY, REPORT DETAILS) | Two 541 cards at y342, gap 16, sentence-case 18 Semi Bold titles, 110px label column, 8 row gap |
| Report details | Escalated by, Reason, Severity as text, "2 hours ago" | Severity pill, Concerns a minor, Submitted "29 Oct 2026, 14:32" (sample value), Status |
| Actions | "ACTIONS" / "TAKE ACTION" labels | "Actions" / "Take action" card title, 40 high buttons, 12 gap; note on the two enquiry frames |
| Callout | Previous callout | 1098x44, radius 6, green tint, 3px bar, 13/20, no stroke |

Card heights: 245/141 (31198), 275/141 (31438), 325/209 (31683). Callout y: 732, 762, 780. Frame heights 1440x1184.
Archived (hidden): old in-content title, Spacer, "Escalated by" and "Reason" rows, the old plain-text "Medium" severity value.
Notes: the old retention callout on 6878:31198 carried a "[COPY PENDING LEGAL REVIEW]" tag. The new copy (from the brief, matching the shipped code) has no tag. "Concerns a minor" wraps to two lines in the 110px label column.
