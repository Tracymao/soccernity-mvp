# Figma pass S — media wording aligned with the built web code

Date: 2026-10-28. Branch `figma/pass-s-media-wording-alignment`. Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`.
Figma and docs only. No application code, schema, legal copy, DPIA, `docs/build-register.md` or Build Plan docx changed. No unit or e2e suite was run (the brief excludes them).
Source: `docs/figma-pass-r-report.md` (its open points), the web code as the source of truth (founder-veto-able default), Decision Log #430 item 5, #412 item 5, and the founder decision of 2026-10-28 on the limit sheet (to be Decision Log #436 once the docs PR merges; it is not in the docx on this branch, so it is cited by date only).
Screenshots: `docs/figma-pass-s-screens/` (`before-<id>.png`, `after-<id>.png`, node id with `:` as `-`). Before shots exist for the frames that already existed and show the main change of each item; the two new frames have after shots only. Frames that received only a text change are covered by a representative before/after (listed per item).

## 1. Standing check (Decision Log #404 item 14)

| | Before | After |
|---|---|---|
| Top-level nodes on `0:1` | 1,019 | 1,021 (2 new: the two Submitted frames) |
| djb2 hash of the 1,019 original ids, in order | 4037906214 | 4037906214 (the first 1,019 children are unchanged and in the same order; the two new ids are last) |

`findAll` counts on touched frames (whole-page `get_metadata` is not usable on this file):

| Frame | Pass R after | Now | Why |
|---|---|---|---|
| `6850:29769`, `6850:30027`, `6850:29871`, `6850:30141` | 50, 56, 49, 55 | 50, 56, 49, 55 | text edits only |
| `6849:30010`, `6858:30609`, `6858:30622`, `6849:30169`, `6858:30685`, `6858:30698` | 12 each | 13 each | hint line added |
| `6858:30635`, `6858:30711` (send error) | 18 | 19 | hint line added |
| `6858:30671`, `6858:30747` (daily limit) | 6 | 9 | urgent line (1) + secondary button (frame and label, 2) |
| `6646:22745`, `6646:23097`, `6646:23984` | 244, 214, 253 (pass R after-counts; the validation frame is 253) | 254, 221, 263 | one dash text per finalist row (9, 6, 9) plus one "Counting starts at the reveal" line each |
| `6646:23419`, `6646:23765`, `6646:24345` | 238, 111, 110 | not touched | already pre-reveal or no figures |
| New `6862:30628` (desktop), `6862:30679` (mobile) | n/a | 50, 56 | clones of the Being-checked frames |

Overlaps of the two new frames and of every touched frame with all 1,021 top-level nodes: **0**. Nothing deleted, archived or renamed except the two new frame names and the layer renames listed below.
Paints: 0 unbound solid paints on every touched report, limit, final-entry and Submitted frame (12 to 41 solid paints each, hidden layers skipped). The three old impression frames each show **1** unbound paint: `Rectangle 223` inside the `Admin Shell` instance (the sidebar wash, a literal paint by design, Decision Log #199, unchanged and inherited). No `brand/green-tint-28`, no new colour, light mode only.

## 2. Item 1 — final-entry wording

Edited in place (text only). The first sentence of the rejection copy is kept.

| Node | Frame | Before | After |
|---|---|---|---|
| `6850:29819` | `6850:29769` Desktop 03 Being checked | You can replace it until you submit. | You can change your video until you submit. |
| `6850:30083` | `6850:30027` Mobile 03 Being checked | same | same |
| `6850:29918` | `6850:29871` Desktop 05 Rejected | It didn’t meet our community guidelines. Remove it and upload another, then submit before the window closes at 23:59:59 on day 24. | It didn’t meet our community guidelines. Remove it and upload another before you submit. |
| `6850:30194` | `6850:30141` Mobile 05 Rejected | same | same |

The header banners (they state the upload window, days 22–24, deadline 23:59:59 on day 24) are untouched. Screenshots: `before/after-6850-29769`, `before/after-6850-29871`.

## 3. Item 2 — tagged sentence under the reason field

The web report form (`apps/web/src/pages/community/PostMedia.tsx`) shows, between the reason field and the counter, "Only our moderators see your reason, not the person who posted this. [COPY PENDING LEGAL REVIEW]". Added as a new text layer, a clone of the form's own Subtitle text (12 px, same colour token), inserted **between the Reason field and the Counter** (the order in the code), width fill, height hugging (two lines at both widths):

| State | Desktop | Mobile |
|---|---|---|
| 01 Empty | `6849:30010` (hint `6862:30614`) | `6849:30169` (`6862:30618`) |
| 02 Reason entered | `6858:30609` (`6862:30615`) | `6858:30685` (`6862:30619`) |
| 03 At 500-character limit | `6858:30622` (`6862:30616`) | `6858:30698` (`6862:30620`) |
| 04 Send error | `6858:30635` (`6862:30617`) | `6858:30711` (`6862:30621`) |

Tag convention: the layer is named `[COPY PENDING LEGAL REVIEW] Hint`; the characters do not contain the tag (as for the other tagged Figma lines, for example `[COPY PENDING LEGAL REVIEW] Line` on the Being-checked frames). Frames are auto-layout and grew by 44 px each (451 to 495, 558 to 602, 539 to 583; mobile 363 to 407, 521 to 565, 451 to 495); no overlap. Screenshots: `before/after-6849-30010`, `before/after-6858-30622`, `before/after-6858-30698`.
The Already-reported and Daily-limit sheets and the confirmation frames have no reason field and were not changed by this item.

## 4. Item 3 — neutral sample reason text

The old sample described "the inside of someone’s home and a young person". Replaced with filler that describes nothing about a person, same length so the counters stay true:

| Frames | Nodes | Length | Text |
|---|---|---|---|
| 02 Reason entered and 04 Send error, desktop and mobile | `6858:30615`, `6858:30641`, `6858:30691`, `6858:30717` | 98 | This picture seems wrong because the caption does not match what it shows, so please check it out. |
| 03 At 500-character limit, desktop and mobile | `6858:30628`, `6858:30704` | 500 | The same opening sentence, then the filler "This picture seems wrong because it does not look right to me, and I would like someone on the team to take a closer look at it." repeated and cut at exactly 500 characters (it ends mid-word, as a text that hit the limit would) |

The brief names the Reason-entered and At-limit frames; the two Send-error frames carried the same 98-character sample, so they are updated too (list above). Lengths were read back from the nodes (98 and 500).

## 5. Item 4 — Submitted state

Two new top-level frames, cloned from the Being-checked frames so components, text styles and bindings are inherited. Free band: to the right of the 05 Rejected frames in the same rows; no existing frame moved.

| Frame | Id | Position | Size |
|---|---|---|---|
| Create Post — Desktop — Final Week — Upload — 06 Submitted | `6862:30628` | x 4980, y 111600 | 876 x 719 |
| Create Post — Mobile — Final Week — Upload — 06 Submitted | `6862:30679` | x 2500, y 112800 | 390 x 688 |

Changes from the clone: tile chip "Checking" becomes "Submitted" (chip layer renamed `Chip — Submitted`, tile renamed `Tile — vid — submitted`); the status line reads "Your entry is submitted. It can’t be changed now."; the tagged "Checking… only you can see this" line is hidden (not deleted; the banner above still says the video is hidden until the reveal); the tile's Remove control is hidden; the Upload file control and the Post button are hidden (desktop: the whole Toolbar; mobile: the POST button and the Upload row), because nothing can be changed or submitted again. The caption box and the video poster are kept. The wording is functional and untagged. Screenshots: `after-6862-30628`, `after-6862-30679`.

## 6. Item 5 — Daily limit sheet, urgent route

Founder decision 2026-10-28: the limit sheets keep their wording and show **no number**. Added under the existing sentence (both sheets): one line "If this is urgent or involves a child, report the post or the person instead." (clone of the sheet's own Subtitle, layer `Urgent route line`) and one secondary button "Report the post or person" in the Buttons row after Close (clone of the form's outlined Cancel button, same style and tokens, layer `Report the post or person`).

| Sheet | Frame | New line | New button | Size before → after |
|---|---|---|---|---|
| Desktop | `6858:30671` | `6862:30622` | `6862:30623` | 560 x 285 → 560 x 331 |
| Mobile | `6858:30747` | `6862:30625` | `6862:30626` | 390 x 236 → 390 x 282 |

The button leads to the existing general report flow (the web's `ReportAction`, `POST /reports`); no new report flow is drawn and **no prototype link was added** (no destination frame for that flow exists in this file; `ReportAction` has no Figma frame, see section 10). The line points to an existing route and makes no promise, so it is untagged. Screenshots: `before/after-6858-30671`, `before/after-6858-30747`.

## 7. Item 6 — old Finalist impressions frames

Impressions only start at the reveal. Three of the six frames showed figures; the other three need no change:

| Frame | Result |
|---|---|
| `6646:22745` default, `6646:23097` Fewer than 9, `6646:23984` Settings validation | figures replaced (below) |
| `6646:23419` Before reveal | already shows "—" everywhere and "No impressions yet" pills; unchanged |
| `6646:23765` No finalists, `6646:24345` Load error | contain no figures; unchanged |

On the three frames:

- Stat cards "Mean impressions", "Tolerance band", "Outside tolerance" show "—" (`6646:22967`, `6646:22970`, `6646:22973`; `6646:23319`, `6646:23322`, `6646:23325`; `6646:24209`, `6646:24212`, `6646:24215`). The "Finalists" count (9 or 6) is the number of qualified finalists, not an impression figure, and stays.
- Every finalist row: the IMPRESSIONS figure and the VS MEAN figure become "—" (text nodes `6646:23019`/`23021`, `23026`/`23028`, `23033`/`23035`, `23040`/`23042`, `23047`/`23049`, `23054`/`23056`, `23061`/`23063`, `23068`/`23070`, `23075`/`23077` on the default frame; `6646:23362`/`23364`, `23369`/`23371`, `23376`/`23378`, `23383`/`23385`, `23390`/`23392`, `23397`/`23399` on Fewer than 9; `6646:24261`/`24263`, `24268`/`24270`, `24275`/`24277`, `24282`/`24284`, `24289`/`24291`, `24296`/`24298`, `24303`/`24305`, `24310`/`24312`, `24317`/`24319` on Settings validation).
- The DISTRIBUTION bars (the chart values) are hidden (the `Track` frame in each row, kept, not deleted) and replaced by a "—" text in that cell (a clone of the dash on the Before-reveal frame, layer `Dash — pre-reveal`, 24 new text nodes in total).
- One line "Counting starts at the reveal" (clone of the stat-label text, 12 px) is added after the summary row on each of the three frames (layer `Pre-reveal note`: `6862:30745`, `6862:30752`, `6862:30762`).
- **Judgment call beyond the literal brief:** the STATUS pills ("Within tolerance" / "Outside tolerance") are statuses of impressions that do not exist yet, so they would contradict the dashes. They are now "No impressions yet", with the fill, stroke and text fill copied from the existing pill on the Before-reveal frame (layer `Pill — No impressions yet`). The three "Outside tolerance" frames' navy pill therefore became the neutral pill. If the founder wants the original statuses kept, only the pill text and fills need reverting.
- Kept exactly: layout, the top row chips ("October 2026 · Before week 4", "Settings editable"), the "Back to overview" button, the callout on Fewer than 9, the validation banner and both errors on Settings validation, the tolerance and daily-cap fields (their 10 and 3 are settings, not impression figures), Save settings, and the Admin Shell instance.

Table rows lost about 2 px of height each (the dash is a 16 px text where the bar cell was 10 px), so the frames stay at 1,184 px (the validation frame 1,256 px). Screenshot: `before/after-6646-22745`.

## 8. Strings and tags (Decision Log #412 item 5)

**Newly tagged `[COPY PENDING LEGAL REVIEW]`: none.** The one tagged string drawn in this pass, "Only our moderators see your reason, not the person who posted this." (a promise about who sees a reporter’s reason), was already a tagged code string with a manifest row; this pass only adds it to the Figma frames (layer tag, section 3).
Untagged and functional: "You can change your video until you submit.", the rewritten rejection ending, "Your entry is submitted. It can’t be changed now.", "Submitted", "If this is urgent or involves a child, report the post or the person instead.", "Report the post or person", "Counting starts at the reveal", "No impressions yet", the neutral sample text, and the dashes. The urgent-route line mentions a child but only points to an existing route and promises no outcome, no visibility rule and no timeline (founder decision of 2026-10-28).

`docs/pending-copy-manifest.md`: the row for `PostMedia.tsx` "Only our moderators see your reason…" no longer says "no frame yet": its note now says the frames exist (pass R and pass S) and lists the eight Figma layers (section 3); the tagged string is unchanged. One prose bullet records that this pass tagged nothing new.

## 9. Open points carried from pass R (not decided here)

Nothing else from pass R's open list is decided by this pass:

1. The API status codes behind "already reported" and "daily limit" (pass R point 1).
2. Whether the limit sheet may ever show the number (pass R point 2): the founder decision of 2026-10-28 is that it shows none; this pass drew exactly that. The number stays a configuration value.
3. The sample reason text (pass R point 4) is now neutral; no further decision.
4. What a finalist can do after submitting (pass R point 5): this pass draws the Submitted state only; it does not draw any way back (the build refuses it with a 409).
5. Impression numbers on the pre-week-4 admin frames (pass R point 6): closed by section 7; the status pills judgment call there is the one point to confirm.
6. One sheet per type only for pictures (pass R point 7): unchanged; no video form is drawn.

## 10. New observations (not decided)

- `ReportAction` (post, comment, user report) has no Figma frame in this file, so the new "Report the post or person" button has no prototype destination to link to. A screen-builder pass could draw it, then the button can be wired.
- The urgent-route button is drawn on the picture sheet only; the video sheet is the same sheet with the title "Report this video" (as in pass Q), no separate frame exists.
- The 500-character sample ends in "This picture se", which is intentional (it is exactly the limit).
- The Submitted frames do not show how the entry looks to others after the reveal; the pinned-entry frames of pass H cover that.

## 11. Register

`docs/build-register.md` and the Build Plan docx are not edited here (brief). The next docs PR can add a status line to B-261 and B-240, and add the Decision Log #436 entry for the limit-sheet urgent route.
