# Figma: Held Investigations restyled to the shipped code and the premium standard (2026-11-27)

Figma and docs only. No application code or CSS changed. Structure follows `HeldInvestigationsPage.tsx` (founder, 2026-11-26: code is the truth).

File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Frames: list `6647:23351`, Empty `6647:23603`, Validation `6647:23831`, Load Error `6647:24060`. No other frame was touched.

## Before and after

| # | Item | Before | After |
| --- | --- | --- | --- |
| 1 | Page title | 28 Semi Bold inside the content at 300,45 | page-title style (Montserrat 24) at 301,129 |
| 1 | Search bar | shell, 302,182 740x44 | unchanged, one per frame |
| 1 | Content box | 300,45, 1100 wide | 301,258, 1098 wide, gap 20 |
| 2 | Title row | pill and button beside the title | new row at y258, 40 high, gap 16 |
| 2 | Pill "Held more than 90 days" | 21 high | 24 high, 12 Medium, full radius, navy |
| 2 | "Back to moderation" | 34 high, radius 6, white fill, 13 Semi Bold | 40 high, radius 8, padding 9/20, 14 Medium, 1px navy stroke, no fill |
| 3 | Filter card | radius 10, padding 24 | radius 12, padding 20, no stroke, no shadow |
| 3 | Field label / help | 15 high | 16 high, 12 Medium / 12 Regular, navy 70% |
| 3 | Input | 43 high, radius 6 | 300x44, radius 8, padding 0/14, 2px border (no paint unless invalid) |
| 3 | "Apply filter" | 37 high, radius 6 | 40 high, radius 8, padding 10/20, 16 right of the input, bottom-aligned with it |
| 3 | Note | 13/16 | 13/20, navy 70% |
| 4 | Table card | square, 1100 wide, y445 | radius 12, 1098 wide, y530 |
| 4 | Header | 43 high, uppercase | 40 high, sentence case, 12 Medium |
| 4 | Rows | 49 high, divider rectangles | 52 high, 1px bottom hairline on the row, cells 14/22 (name 14 Medium) |
| 4 | Column left edges | same | 20, 186, 402, 568, 684, 770, 968 (measured) |
| 4 | Hold-type pill | 21 high | 24 high |
| 4 | "Lift hold" | larger button | 32 high, radius 8, padding 5/12, 13 Medium |
| 5 | Empty card | radius 10, padding 40/24, gap 20 | radius 12, padding 40/20, gap 8, title 18 Semi Bold, note 13/20 |
| 6 | Validation | input border and error 12 Medium | 2px alert border, help line kept above, 3x14 alert bar, 8 gap, 12 Semi Bold |
| 7 | Load Error | 44-high banner and a separate Retry button | 1098x60 card, radius 12, padding 20, 6px alert left bar, 14 text with an inline 13 Semi Bold "Retry" link |
| 7 | Load Error copy | "The held investigations could not be loaded. …" | "Couldn’t load the held investigations. Check the connection and try again. Retry" |

The sample rows are unchanged: three rows, one with "—" and two with "Lift hold".

## Heights

All four frames and their Admin Shell are 1184 (the minimum). Last block bottom: list 726, Empty 660, Validation 534, Load Error 590.

Filter card: 192 high at y318 (216 in Validation). List card 196, empty card 130, error card 60, all at y530.

## Variables and styles used

- Colour: `brand/navy`, `brand/green-tint`, `brand/off-white`, `color/background/surface`, `color/text/primary`, `color/text/secondary`, `color/text/on-navy`, `color/icon/inactive`, `semantic/alert` (error bars and invalid border only).
- Radius: `radius/md`, `radius/lg`, `radius/full`.
- Spacing: `space/*` where a variable exists for the value.
- Text styles: `Web/Title`, `Web/Body`, `Web/Body small`, `Admin/Field label`, `Admin/Helper`, `Admin/Table header`, `Admin/Pill`, `Admin/Button`.

## Archived (hidden, not deleted)

| Frame | Layers |
| --- | --- |
| List | `6647:23562` Top Row, `6647:23564` Spacer, `6647:23589` and `6647:23596` Divider |
| Empty | `6647:23814` Top Row, `6647:23816` Spacer |
| Validation | `6647:24042` Top Row, `6647:24044` Spacer, `6647:24059` Pad |
| Load Error | `6647:24271` Top Row, `6647:24273` Spacer, `6647:24288` Actions (old Retry button) |

All are renamed "ARCHIVED - …". Each archived Top Row holds the old 28px title. Older "ARCHIVED —" layers from earlier passes are untouched. The `Bar` rectangle inside the error banner instance `6724:29031` is hidden but keeps its name (layers inside an instance cannot be renamed).

New layers: one "Title row" frame and one page-title text per frame. The existing pill and button instances were moved into the Title row, so their ids are unchanged.

## Not bound or not matched

- **Text with no style:** the user name (14 Medium), the "Back to moderation" label (14 Medium), the empty title (18 Semi Bold), the validation error (12 Semi Bold) and the banner text. No matching style was applied; size and bound colour are set directly.
- **Plain numbers:** padding 5, 9 and 40, and stroke widths, have no variable.
- **"Apply filter" position:** it is absolutely positioned inside the filter row (x316, y28) so it aligns with the input and not with the help line.
- **Input radius** is 8 as briefed; the shipped CSS `.hi-field__box` uses 6.
- **Header and cell type** follow the brief; the shipped CSS `.hi-table__row` still uses 13px cells and `text-transform: uppercase` on the header. Code was not changed.
- **Dates** keep the existing sample values (for example "12 Jun 2026").
- **Load-error card** has a left stroke: it is the alert accent bar from `6738:28328`, not a callout outline.
- **Button widths** hug the label ("Back to moderation" is 173 wide, was 157).

## Standing check

- Top-level nodes on `0:1`: 2004.
- Id hash (djb2-xor, excluding `7230:71662`): 2327422288 (matches baseline).
- Queue content node `5794:8710`: 300,45 1100x620.
- Overlaps in content: 0 on all four frames.
- Unbound solid fills or strokes outside the Admin Shell: 0.
- Lowest text contrast: 4.79:1.
- Text under 12px: 0. Uppercase labels: 0.
- Callout strokes: no callouts on these frames.
- Search bars: exactly one per frame.
- Screenshots at 1000px taken and checked for all four frames.
