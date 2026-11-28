# Figma: Report Detail and Appeal Review restyled to the premium standard (2026-11-27)

Figma and docs only. No application code changed. Cards, fields, order, copy and buttons are unchanged (founder, 2026-11-26). The one text edit is letter case: "ESCALATION NOTES" is now "Escalation notes".

File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Frames: Report Detail `5796:8635`, `6947:41119`, `6947:41276`; Appeal Review `5796:8753`. No other frame was touched.

## Before and after

| # | Item | Before | After |
| --- | --- | --- | --- |
| 1 | Cards | radius 10, white, padding 20 | radius 12, white, padding 20, no stroke, no shadow; title 18 Semi Bold navy unchanged; gap 20 |
| 2 | Field label | 12 Semi Bold, uppercase, navy 70% | sentence case, 12 Medium, line 16, navy 70% |
| 2 | Field value | 14, line 16 | 14/22 Regular navy |
| 2 | Gaps | label to value 4 (3 on Severity), fields 12 | 4 and 12 |
| 2 | Field height | 36 (Severity 40) | 42 (Severity 44) |
| 3 | Pill | 21 high | 24 high, 12 Medium, full radius, same fill |
| 4 | Buttons | 39 high, radius 6, 14 Semi Bold | 40 high, radius 8, padding 10/20, 14; primary navy fill, white, Semi Bold |
| 4 | Outline buttons | white fill, navy stroke, Semi Bold | no fill, 1px navy stroke, navy, Medium |
| 4 | Button gap | 12 | 12 |
| 5 | Notes and helper | 12 or 13, line 15 to 16 | 13/20, navy 70% |
| 6 | Callout | radius 10, white, bar inset, padding 14/16, 67 high | radius 6, green tint 12%, 3px alert bar flush left, 13/20 navy, 12/14, no stroke, 44 high |
| 7 | Back link, page title | | unchanged |
| 8 | Textarea | radius 8, `color/icon/inactive` border, white, placeholder navy 70% | unchanged (already matched Add Category `138:93`) |
| 8 | Escalation label | uppercase 12 Semi Bold, gap 8 | sentence case, 12 Medium, gap 4 |
| 8 | Checkbox | 18x18, 1.5px `color/icon/inactive` | 16x16, radius 4, 1px navy 40% |
| 8 | Checkbox label | 13 | 13/20 navy |
| 9 | Appeal intro note | 13, line 16 | 13/20, navy 70% |

Primary and outline buttons are the same ones as before.

## Heights

| Frames | Card heights before | Card heights after | Content box | Frame height |
| --- | --- | --- | --- | --- |
| Report Detail (all three) | 157 / 401 / 262 / 315 | 169 / 441 / 253 / 323 | 301,258 1098x1282 | 1534 to 1585 |
| Appeal Review | 401 / 185 / 140 / 191 / 315 | 441 / 201 / 145 / 169 / 323 | 301,258 1098x1455 | 1703 to 1758 |

Content nodes keep their ids. Each frame ends 45 below the last card and the Admin Shell matches the frame height.

## Variables and styles used

- Colour: `brand/navy`, `brand/green-tint`, `color/text/primary`, `color/text/secondary`, `color/text/on-navy`, `color/background/surface`, `color/icon/inactive`, `semantic/alert` (callout bar only).
- Radius: `radius/sm` (callout), `radius/md` (buttons, textarea), `radius/lg` (cards), `radius/full` (pills).
- Spacing: `space/4`, `space/10`, `space/12`, `space/14`, `space/20`.
- Text styles: `Admin/Field label`, `Web/Body` (values), `Web/Body small` (notes, callout, checkbox label), `Admin/Button` (primary), `Admin/Pill`.

## Not bound or not matched

- **Outline button text** is Inter 14 Medium with no text style. No such style exists (same gap as the Moderation Queue report).
- **Notes with a bold word** (the Escalate intro on all four frames and the Appeal intro) have no text style, so the bold word survives. Size 13, line 20 and the bound colour are set directly.
- **Checkbox radius 4** is a plain number: there is no `radius/4` variable. No checkbox pattern was found in the frames named "Settings", so the brief's values were used.
- **Callout bar width 3 and the zero paddings** are plain numbers.
- **Button widths** now hug the label, so they can differ from before by about 1px (more on outline buttons, whose text is lighter).
- **"Concerns a minor"** shows the text "No" on all four frames, not a pill. It stays text because structure is unchanged.

## Standing check

- Top-level nodes on `0:1`: 2004.
- Id hash (djb2-xor, excluding `7230:71662`): 2327422288 (matches baseline).
- Queue content node `5794:8710`: 300,45 1100x620.
- Overlaps: none between content blocks, none between these frames and another top-level node.
- Unbound solid paints outside the Admin Shell: 0. Inside the shell: 1 per frame (inherited).
- Lowest text contrast outside the shell: 5.01:1 (Report Detail), 4.80:1 (Appeal Review).
- Text under 12px outside the shell: none.
- Callout strokes: none. Search bars: exactly one per frame.
- All four frames screenshot at 1000px.
