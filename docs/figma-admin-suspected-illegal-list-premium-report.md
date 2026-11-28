# Figma: Suspected illegal imagery list (L1 to L7) restyled to the shipped code and the premium standard (2026-11-28)

Figma and docs only. No application code or CSS changed. Structure follows `SuspectedIllegalListPage.tsx`.

File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. The D1 to D14 detail frames were not touched.

## Frames

All seven are 1440x1184 with the Admin Shell at 1184. Page title at 301,129. New content box at 301,258, 1098 wide, gap 20. Frame ids are unchanged.

| Frame | Id | New content | Filter value | State | Last block bottom | Archived layer |
| --- | --- | --- | --- | --- | --- | --- |
| L1 | `7074:64435` | `7379:69705` | All | three rows | 686 | `7074:64437` |
| L2 | `7075:65405` | `7379:69815` | All | three rows | 686 | `7075:65407` |
| L3 | `7075:65573` | `7379:69922` | Not filed | empty | 620 | `7075:65575` |
| L4 | `7075:65747` | `7379:69979` | All | loading | 512 | `7075:65749` |
| L5 | `7075:65920` | `7379:70035` | Not filed | load error | 606 | `7075:65922` |
| L6 | `7075:66097` | `7379:70096` | All | restricted (vetting) | 605 | `7075:66099` |
| L7 | `7075:66272` | `7379:70153` | All | no access (role) | 585 | `7075:66274` |

Each archived layer is the old `Content` box, renamed "ARCHIVED - Content", hidden, and moved below its frame (y1224). Nothing was deleted from the old layers.

L1 was renamed from "… L1 List (Not filed)" to "… L1 List (All)".

## What the frames show

- Heading row with "← Media review", the note verbatim, then the filter card (radius 12, padding 20; select 300x44; "Apply filter" 40 high).
- Table: radius 12, header 40, rows 52 with a bottom hairline, column widths 192 / 157 / 261 / 226 / 174, gap 12.
- Status pills follow `RecordStatusPill`: "Not filed" strong navy, "Filed" soft green, "Decided not to file" neutral (icon-inactive fill).
- A "Not filed" row has a 3px navy bar on its left edge. "Open" is 32 high, outline.
- Load error: alert callout (radius 6, padding 12/14, 3px alert bar) with a separate "Retry" button below.
- Restricted and no access: the restricted card cloned from Report Detail (`7356:69943`, radius 12, 1px navy border).

The L1 prototype links moved to the new "Open" buttons (to D1 `7077:65267`, D2 `7080:65413`, D3 `7080:65638`).

## Assumptions and judgement calls

1. **L1 filter.** The old frame showed "Not filed" over three rows of mixed status. The server filters by status, so the code cannot show that. L1 now shows "All" with the three rows. **L1 and L2 are therefore identical.** The alternative is L1 as "Not filed" with the one open row.
2. **L4 filter.** The old frame showed "Not filed". The loading line shows only before the first data arrives, when the filter is still "All". "Apply filter" is drawn disabled, as the code does while loading.
3. **L6 and L7.** The old frames had no filter card. The code renders it above every state, so it is now drawn.
4. **L3 empty card.** Padding is 40/20, as in the code (`.hi-empty`) and the Held Investigations card. The brief also said "padding 20"; the code won.
5. Sample rows and dates are the old frames' own: 2 Nov 2026 / Picture / Not filed / 2 Nov 2027; 1 Nov 2026 / Video / Filed / 1 Nov 2027; 30 Oct 2026 / Profile picture / Decided not to file / 30 Oct 2027.
6. "Load more" and its error line are not drawn: the old frames did not have them and three rows imply no next page.
7. The select chevron is the existing one from the Media queue filter (`7330:70324`).

## In the old frames, not rendered by the code

- The mixed rows under a "Not filed" filter (L1).
- Uppercase table header labels.
- A bold note, and a spacer layer under the title.

## Removed tags

None. No "[COPY PENDING LEGAL REVIEW]" tag was found on the seven list frames. The tag text named in the Notes frame belongs to D1, which was not touched.

The Notes frame `7080:68387` was left unchanged: nothing in it about the list is now wrong.

## Notes for the code PR

1. **Table header case.** The frames use sentence case; `.si-table__row.mod-table__row--head` sets `text-transform: uppercase`.
2. **Full-width columns.** The code fixes 110 / 90 / 150 / 130 / 100px, which leaves the right side of a 1098px table empty. The frames spread the five columns over the full width in the same proportions (110:90:150:130:100).
3. Also differing: `.mod-callout` is radius 8, padding 14/16 (drawn 6, 12/14); `.mod-card` and `.mod-table` are radius 10 (drawn 12).

## Standing check

- Top-level count 2004.
- Id hash (djb2-xor, ids joined with no separator, excluding `7230:71662`) 2327422288.
- Queue content `5794:8710` 1100x620; Report Detail `5796:8635` Content 1098x1282; Appeal Review `5796:8753` Content 1098x1455.
- All seven frames, outside the Admin Shell: no overlapping blocks or top-level frames, no text under 12px, no uppercase labels, one search bar, no unbound solid fills.
- Contrast: text uses the existing primary and 70% secondary navy tokens on white, off-white and green tint, estimated at 4.5:1 or better by hand, not measured with a tool. The disabled button on L4 is exempt.
- 1000px screenshots reviewed for all seven.
