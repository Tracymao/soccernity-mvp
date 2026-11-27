# Figma: Media review frames brought to shipped structure and premium standard

Date: 2026-11-27. Docs and Figma only; no app code. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`.
Structure follows `apps/admin/src/pages/media-review/` (founder, 2026-11-26); design follows the premium system.

## Group 1: queue (6851:29675, 6851:30038, 6851:30333)

| Item | Before | After |
|---|---|---|
| Header | Title and "27 pending" pill inside content, 117px spacer | Page title "Media review" at (301,129), Web/Title; content starts y258, width 1098, gap 20 |
| Heading row | None | 24 high, space-between: "← Moderation Queue", "Suspected illegal imagery", strong pill "5 pending" / "0 pending" (none on Load Error) |
| Note | Callout (list frame only) | 13/20 secondary note on all three |
| Statistics | Four tinted tiles, 412/18/27/9, helper text | White card, radius 12, padding 20; label above 28px value; 112/9/14/3; "6 decided by a moderator." |
| Filters | None | "Show" and "Source" selects, 220x44, radius 8 |
| Table | Uppercase header, divider rectangles, footer | Header 40, rows 52 with bottom hairline; columns 20/304/587/756/925; soft green source pills; 32px Review buttons |
| Load more | Inside table footer | Outline button 40 high below the table |
| Empty | Centred card with icon | Left-aligned card, 90 high |
| Load error | Banner plus separate button; no statistics | Statistics card plus load-error card with 6px alert left bar and "Try again" |

Frame heights: 1184, 1184, 1184 (shell unchanged).

## Group 2: item (6852:30003 picture, 6852:30323 video, 6852:30658 already decided)

| Item | Before | After |
|---|---|---|
| Header | Title and "Back to queue" button inside content | Page title "Review picture" / "Review video" at (301,129); "← Back to queue" link at y258 |
| Layout | Two columns (media card 660, details card 416) | Single column, width 1098 |
| Viewer | Media card with type pill | Green-tint viewer, radius 12, padding 16; existing preview moved in (620x380 picture, 620x349 video), radius 8 |
| Callout | Video: "Reason given" callout. Decided: neutral banner "approved 3 minutes ago" | Video: code's reported copy. Decided: callout with "Already decided" bold, rejected 12 Aug 2026 copy. Picture: none |
| Details | Label/value rows, divider, label percentage rows | Card with five equal columns (199 each), "Automatic check" soft pills, note |
| Sample values | christine001 / amaka_fc, "Automatic check", 38 min | Soccernity member, User report, Picture or "Video · 42 s", 5 min, "Post 1a2b3c4d…" |
| Actions | Inside the details card | Row below the card: Approve, Reject, Suspected illegal imagery. Decided frame uses the existing Button "Disabled" variants |

Frame heights: 1184 each.

## Group 3: reject dialogs (6852:30985, 6852:31327)

**6852:30985 is the invalid state** (it showed the error); 6852:31327 is the filled state.

| Item | Before | After |
|---|---|---|
| Page behind | Old two-column page | Copy of the new picture item page; old content hidden; scrim kept |
| Dialog | 560 wide, header, divider, footer band | 480 wide, centred, radius 16 (`radius/xl`), padding 24, gap 12, `elevation/overlay`; heights 354 (invalid), 322 |
| Head | Title and 18px icon | Title 18 Semi Bold; 32x32 close box with "×" 24px |
| Note | Layer tagged "[COPY PENDING LEGAL REVIEW]" | Same copy, 13/20, layer renamed "Body text" (founder: not a legal string) |
| Field | Field component, "Up to 300 characters." | "Reason (required)", 432x90 textarea, alert border on invalid; "Up to 500 characters." |
| Error | Inside the Field component | 3x20 alert bar and "Enter a reason to continue." in navy |
| Actions | Cancel, then Reject, right-aligned | "Reject picture", then outline "Cancel", left-aligned |

## Variables and styles used

- Colour: `brand/navy`, `color/text/primary`, `color/text/secondary`, `color/background/surface`, `brand/green-tint`, `color/icon/inactive`, `semantic/alert`, `color/overlay/scrim`.
- Radius: `radius/sm`, `radius/md`, `radius/lg`, `radius/xl`, plus the Pill component's full radius.
- Text styles: `Web/Title`, `Web/Body`, `Web/Body small`, `Admin/Field label`, `Admin/Page title` (28px values), `Admin/Button`, `Admin/Body small medium`, `Admin/Table cell strong` (13 Semi Bold field label).
- Effect: `elevation/overlay`. Components: Pill, Button, Callout.

## Archived (hidden, never deleted; names prefixed "ARCHIVED - ")

- All frames: old "Top Row" (title, count pill, "Back to queue" button) and "Spacer".
- Queue: list "Callout", statistics "Helper", table dividers and "Footer"; Empty "icon"; Load Error banner and "Try again" button.
- Item and dialog pages: old "Review" two-column frame, old Details card rows, divider, "Automatic check" heading, helper and action group; decided banner.
- Dialogs: old page content, header divider, close vector, Field instance.

## Not matched, or worth knowing

1. No text style exists for the card title (Inter Semi Bold 18) or for Inter Medium 14 (links, uploader cells, outline button labels); these are unstyled. The "×" glyph is also unstyled.
2. No chevron component exists; the select chevron is a copy of the "Chevron (select)" vector (from 6752:30140).
3. The select's "2px transparent border" is a 2px stroke weight with no stroke paint.
4. `Admin/Table header` forces uppercase, so column headers use `Admin/Field label`.
5. Heading row uses space-between as the code does. "Suspected illegal imagery" sits about 32px right of true centre; on Load Error (no pill) it sits at the right edge.
6. The invalid dialog draws "Reject picture" enabled, as specified. The code disables it while the reason is empty.
7. Disabled actions use the existing Button "Disabled" variants, not 50% opacity. Disabled "Approve" text is 4.17:1 (disabled controls are exempt from the contrast rule).
8. No "Hidden" pill is drawn: no existing sample row is hidden. List sample ages are unchanged.
9. A third existing label, "Nudity 4%", is kept as a pill.
10. New nodes: page titles, the Load Error statistics card (a copy), and the page behind each dialog (copies).
11. The "User report" pill is the Alert pill instance with the soft green fill and no stroke as overrides.

## Standing checks

- Top-level count 2004; id hash 2327422288 (both equal the baseline).
- Moderation Queue content node 5794:8710 box: 300,45 1100x620.
- Overlaps 0. Unbound solid fills outside the Admin Shell 0. Text under 12px 0. Callout strokes 0. No uppercase labels.
- Exactly one search bar in each of the eight frames.
- Contrast: all enabled text at least 4.5:1 (see item 7; page content dimmed behind the dialog scrim not counted).
- Frame height 1184 for all eight; title at (301,129); content at (301,258), width 1098.
- 1000px screenshots reviewed for all eight. The "Nudity 4%" pill was added afterwards to five frames; 6852:30658 was re-screenshotted, the other four were checked by measurement. Count, hash, unbound fills, text size, search bars and pill overlap were rerun after that pill; the other checks ran before it.
