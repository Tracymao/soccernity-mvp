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
