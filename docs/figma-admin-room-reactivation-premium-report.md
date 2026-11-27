# Figma: Bants room reactivation frames on Report Detail (premium restyle)

File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma only; no code or CSS changed. Source of truth: `ReportedRoomCard.tsx`, `moderationShared.tsx`, `ReportDetailPage.tsx` and `api/moderation.ts` at origin/main `c4db75c`. Base page cloned from `7041:61631`.

All frame ids are unchanged. Old layers inside each frame are hidden, prefixed `ARCHIVED ` and moved below the frame.

## Group 1

| Frame | State | Height | New Content / title / search | Archived |
|---|---|---|---|---|
| `7115:68271` | G3-1 inactive, button | 1869 | `7359:69716` / `7359:69810` / `7359:69811` | `7115:68273`, `68274` |
| `7115:68463` | G3-2 saving | 1869 | `7359:69815` / `7359:69909` / `7359:69910` | `7115:68465`, `68466` |
| `7115:68655` | G3-3 reactivated | 1857 | `7359:69914` / `7359:70008` / `7359:70009` | `7115:68657`, `68658` |

## Group 2

| Frame | State | Height | New Content / title / search | Archived |
|---|---|---|---|---|
| `7115:68839` | G3-4 already active | 1881 | `7360:69731` / `7360:69800` / `7360:69801` | `7115:68841`, `68842` |
| `7115:69025` | G3-5 not deactivated by staff | 1881 | `7360:69817` / `7360:69886` / `7360:69887` | `7115:69027`, `69028` |
| `7115:69211` | G3-6 role refused | 1925 | `7360:69902` / `7360:69971` / `7360:69972` | `7115:69213`, `69214` |
| `7115:69406` | G3-7 could not reactivate | 1925 | `7360:69987` / `7360:70056` / `7360:70057` | `7115:69408`, `69409` |

## Group 3

| Frame | State | Height | New Content / title / search | Archived |
|---|---|---|---|---|
| `7115:69601` | G3-8 room gone | 1801 | `7360:70072` / `7360:70141` / `7360:70142` | `7115:69603`, `69604` |
| `7115:69783` | G3-9 vetting restricted | 1952 | `7360:70153` / `7360:70222` / `7360:70223` | `7115:69785`, `69786` |

## Page and card

- Order: back link, Reported content, Bants room, Report details, Already reviewed, Case-level actions, Escalate.
- All nine show the report as actioned: Status "Actioned", Action taken "Room deactivated". So "Take action", the Suspend helper line and the notification note are not drawn; Case-level actions has the two hold buttons and the hold callout, and no "Record an appeal" (suspensions only).
- Pill 24 high: "Inactive" is `Pill/Tone=Strong` (the code's `mod-pill--strong`); "Active" has a 1px navy outline and navy text.
- Reactivate Room: 32 high, padding 5/12, radius 8, `Admin/Body small medium`, built as a frame because no Button variant has this size. "Saving…" uses the paints of the Button Disabled variant.

## Choices to check

- **Error lines (G3-4 to G3-7)** use the restyled Error callout (radius 6, green tint, 3px alert bar, no stroke), as the brief says. The shipped `.mod-error` is a 1px navy border, radius 4, padding 10/12, weight 600. The Moderation code PR will need to align it.
- **"Inactive soft strong navy"** in the brief was read as the solid navy Strong tone.
- **"Active" outline** is navy as the brief says; the code's `mod-pill--outline` is a grey border with secondary text.
- **G3-9 restricted notice** is inside the Bants room card: 1px navy border, radius 6.

## Canvas moves

The frames grew from 1184 to 1801–1952, which would have collided with the rows below. All nine now sit in one row at y 339500 (x = 0, 1540, … 12320), and the notes frame `7116:69255` moved to x 13860.

## Notes frame

Three texts in `7116:69255` were wrong and were rewritten: the card's placement (it said after Report details), the saving style (it said reduced opacity) and the restricted card reference, and the "stale code comment" item (the comment has since been updated). The fourth item now records the actioned state and the `.mod-error` difference.

## Dropped extras (not rendered by the code)

- "Room" and "Created by @christine001 (Adeniyi Christiana)" rows.
- The two-column layout and uppercase section labels.
- The open-report "Take action" block (Dismiss Report, Warn User, Suspend helper, notification note) and Status "Open".

## Removed "[COPY PENDING LEGAL REVIEW]" tags (9, all in archived layers)

The tag after the hold callout ("…Both ask for confirmation first."), once on each of `7115:68271`, `68463`, `68655`, `68839`, `69025`, `69211`, `69406`, `69601`, `69783`.

## Assumptions (sample data)

- Report #1055; Type "Bants room"; Target id `a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d`; reporter "Emeka John"; reason "Harassment or bullying"; description "Insults the player each week."; severity Medium; concerns a minor "No".
- Submitted "2 Nov 2026, 09:12"; reviewed "2 Nov 2026, 11:04".
- The code renders no room name, so none is drawn. No active holds, no appeal, Escalate unused.
- The server's vetting rule applies to reports concerning a minor; G3-9 keeps the shared sample ("No") rather than a separate one.
- The title keeps the "Report #1055" sample style; the code prints the first 8 characters of the report id.

## Checks

- Top-level count 2004; id hash (djb2-xor, excluding `7230:71662`) 2327422288. Both match the baseline.
- `5794:8710` at (300,45) 1100x620; `5796:8635` Content 1098x1282; `5796:8753` Content 1098x1455.
- No overlaps between the nine frames, the notes frame and any other top-level node.
- All 9: 1440 wide, Content at x301 y258 and 1098 wide, 20px gaps, 45px below content, one search bar.
- All 9, visible layers outside the Admin Shell: no text under 12px, no uppercase labels, no copy tags, no unbound solid fills, no stroked callouts, no text under 4.5:1 (the disabled "Saving…" label is exempt and not counted).
