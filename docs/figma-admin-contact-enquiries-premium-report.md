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

## Group 3: escalate dialogs (6879:31526, 6879:31599)

| Item | Before | After |
| --- | --- | --- |
| Page behind the scrim | Old detail layout | Same as 6878:31198 (page header, back link, pills, cards, actions, callout) |
| Dialog | 560x556 | 560x579 at (440,303); radius 16; elevation/overlay effect style; header 76 |
| Intro, fields | Field instance for Severity, no chevron | 13 Medium intro; 44 high select with chevron; boxed minor option (radius 8, 1px stroke, padding 12); 96 high textarea |
| Reason help | Ended "[COPY PENDING LEGAL REVIEW]" | "The reason is saved to the audit record." |
| Actions | Cancel and primary, unequal heights | Right-aligned, both 40 high, gap 12 |
| Restricted dialog | 560x300, old restricted copy | 560x301 at (440,442); copy matches VettingRestrictedNotice; outline Close only |

The scrim layer was already bound to color/overlay/scrim and is unchanged.
Archived (hidden): the Severity Field instance, plus on both frames the old title and Spacer behind the scrim. Previously archived footer layers were left as they were.

## Variables and styles used

Variables: color/background/surface, color/text/primary, color/text/secondary, color/text/on-navy, color/icon/inactive, color/overlay/scrim, brand/navy, brand/green-tint, semantic/alert, radius/sm, radius/md, radius/lg, radius/xl, radius/full.
Text styles: Web/Title, Web/Body, Web/Body small, Admin/Dialog title, Admin/Body small medium, Admin/Body strong, Admin/Button, Admin/Button small, Admin/Field label, Admin/Helper. Effect style: elevation/overlay.

## Standing checks

- Page 0:1 top-level count 2004; id hash 2327422288 (unchanged).
- Moderation Queue content node 5794:8710: 300,45 1100x620 (not touched).
- All eight frames: 1440x1184, shell 1184, one search bar (inside the Admin Shell), no overlaps found, no unbound solid fills outside the Admin Shell, no text under 12px, no text below 4.5:1, no stroke on callouts, no uppercase labels, no "PENDING" text.
- 1000px screenshots were taken of the eight frames. The restricted dialog's last copy change was re-checked with a half-scale screenshot.

## Not matched, or choices to note

- Checkbox: no checkbox component was found in the file, so the existing "Checkbox (off)" layer was kept.
- Restricted dialog: the existing restricted callout instance (short alert bar variant) was kept.
- The filter selects are copies of the Media review select (2px border width with no stroke paint, which renders as the transparent border).
- Section titles with no text style on Report Detail (18 Semi Bold card titles) are copied the same way here, so they carry no text style.
- "Retry" is underlined, to read as a link.
- Sample values: Severity "Medium", Submitted "29 Oct 2026, 14:32".
- Legal: the old retention callout carried a "[COPY PENDING LEGAL REVIEW]" tag. The new copy matches the shipped code, which has no tag. This does not mean the retention wording has had legal review.
