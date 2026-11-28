# Figma: Moderation Queue frames restyled to the premium standard (2026-11-27)

Figma and docs only. No application code changed. Structure, copy, columns and order are unchanged (founder, 2026-11-26).

File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Frames `5794:8635` "Moderation Queue" and `6947:40930` "Moderation Queue - reason category (B-284)". Both got the same changes and measure the same.

## Before and after

| Item | Before | After |
| --- | --- | --- |
| Tabs: type | 14 Semi Bold, line 17 | Inter 14 Medium, line 17 |
| Tabs: colour | active navy, inactive navy 70% | unchanged; 2px navy underline |
| Tabs: geometry | gap 8, 35 high, x 301/410/481/587/723 | unchanged |
| Note | 13, auto line height, 16 high | 13/20, navy 70%, 20 high; the bold word stays bold |
| Table card | radius 10, 364 high | radius 12, white, 380 high; x301, width 1098 unchanged |
| Header band | 43 high, uppercase | 40 high, sentence case, 12 Medium navy 70%, green tint 12% |
| Rows | 49 (76 with minor flag), no hairline | 52 (80 with minor flag), 1px bottom hairline, `color/icon/inactive` |
| Cells | 13 | Type, Reason category, Reporter 14/22; id cell 14 Medium navy |
| Cell colours | Type navy, others navy 70% | unchanged |
| Column left edges | 20/136/242/388/746/872/988 | unchanged, no widening needed |
| Pills | 21 high | 24 high, 12 Medium, full radius, capitalised, same fills and strokes |
| Review link | 13 Semi Bold navy | unchanged |
| Load more | 100x34, radius 6, white fill, 13 | 113x40, radius 8, 9/20 padding, 14 Medium navy, 1px navy stroke, no fill |
| Callouts | radius 8, padding 14/16, 48 and 67 high | radius 6, 3px navy bar flush left, green tint 12%, 13/20 navy, 12/14, 44 and 64 high |
| y positions (tabs, note, table, button, callouts) | 258, 313, 349, 733, 787, 855 | 258, 313, 353, 753, 813, 877 (20 gap throughout) |
| Content bottom | 922 | 941 |
| Frame | 1440x1184 | 1440x1184 (unchanged) |

## Variables and styles used

- Colour: `brand/navy`, `brand/green-tint`, `color/text/primary`, `color/text/secondary`, `color/background/surface`, `color/icon/inactive`.
- Radius: `radius/sm` (callouts), `radius/md` (button), `radius/lg` (table), `radius/full` (pills).
- Spacing: `space/4`, `space/8`, `space/12`, `space/14`, `space/20`.
- Text styles: `Web/Body` (cells), `Web/Body small` (note, callouts), `Admin/Field label` (header), `Admin/Pill` (pills).

## Not matched or worth knowing

- **No Inter 14 Medium text style exists.** Tabs, id cells and "Load more" are Inter 14 Medium with no text style, as the id cells on Incorrect-details `6737:27844` already are. The only local 14 Medium styles (`Community/Body`, `Community/Stat value`) are Montserrat. A follow-up could add an admin 14 Medium style.
- **Load more padding 9** has no spacing variable, so it is a plain number. The 20 sides are bound.
- **References differ from the brief.** Users `917:218` tabs and "Load more" are 14 Semi Bold, and its tabs are 36 high. The brief's values (Medium, 35) were used.
- **Load more** is 113 wide against 98 on Users, because Users uses 12 side padding and the brief asks for 20.
- Tab frame widths were kept fixed so the x positions do not move.
- The content node's layers are absolutely positioned, so the 20 gap was applied by moving each block.
- Bound paints written through the plugin rendered black until the paint also carried the variable's resolved colour and opacity. Fixed before measuring.

## Patterns frame `7230:71662` (not edited)

It already shows a 52 row, a 24 chip and a radius 8 button. It does **not** show the radius 6 callout. The check was by layer name and size, not by eye.

## Standing check

- Top-level nodes on `0:1`: 2004.
- Id hash (djb2-xor, excluding `7230:71662`): 2327422288 (matches baseline).
- Content node `5794:8710`: box 300,45 1100x620 (the second frame's content node `6947:40932` is the same).
- Overlaps: none between visible content blocks, none between either frame and another top-level node.
- Unbound solid paints outside the Admin Shell: 0. Inside the shell: 1 per frame (inherited).
- Lowest text contrast outside the shell: 4.79:1.
- Text under 12px outside the shell: none. Pill text: 12px.
- Both frames screenshot at 1000px.
