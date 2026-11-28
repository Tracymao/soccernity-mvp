# Figma: profile-picture and cover-photo Media review frames to the premium standard

Date: 2026-11-28. Figma and docs only; no app code or CSS changed. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`.
Source of truth: `apps/admin/src/pages/media-review/` on origin/main `ae84142`.

## Group 1: queue (6972:46142)

- New layers: clones of the restyled queue 6851:29675 (title `7363:69872`, content `7363:69777`). Only the rows changed.
- Rows (source / uploader / type / age): User report / Soccernity member / Video / 12 min; Automatic check / christine001 / Profile picture / 38 min; Automatic check / nelson_iheagwam / Cover photo / 2 h; User report / amaka_fc / Picture / 5 h; Automatic check / Soccernity member / Profile picture / —.
- The heading pill ("5 pending"), the statistics (112 / 9 / 14 / 3, "6 decided by a moderator") and the filters are the restyled queue's sample values. They replace 27 pending and 412 / 18 / 27 / 9.
- Archived: `6972:46144` (old Content).

## Group 2: items (6972:46346 profile picture, 6972:46516 cover photo, 6972:46686 already decided)

- Header, back link, card and callout styling cloned from 6852:30003 and 6852:30658. New content: `7363:69988`, `7363:70127`, `7363:70266`.
- Layout follows `.media-profile-grid`: columns 661 and 413 (1.6fr / 1fr), gap 24.
- Preview card: type pill, then the image placeholder (`brand/green-tint`, radius 8). Picture 380x380, cover 620x150 (796:192), left-aligned.
- Details card: "Details", rows Uploader / Source / Type / Age / Used in (110px label, gap 10), the 1px divider from `.media-details--stacked`, the "automatic check was unsure" callout, then Approve, Reject and "Suspected illegal imagery". The third button wraps to a second line at 413.
- Already decided: callout above the grid; Approve and Reject use the shipped Disabled variants; "Suspected illegal imagery" is not drawn.
- **Copy change:** the old frame said "Another moderator approved this profile picture 3 minutes ago. There is nothing more to do here." That sentence is not in the code. The frame now shows the `conflict` wording: "Another moderator already decided this profile picture, or it is no longer waiting for review. There is nothing more to do here."
- Archived: `6972:46348`, `6972:46518`, `6972:46688` (old Content).

## Group 3: reject dialogs (6972:46863 invalid, 6972:47057 and 6972:47248 entered)

- Page behind is a copy of the new item frame. Scrim and dialog cloned from 6852:30985 / 6852:31327: 480 wide, radius 16, centred in the whole frame, Reject then Cancel, left-aligned. Dialogs `7363:70438`, `7363:70491`, `7363:70542`.
- Copy from `RejectDialog`: "Reject this {noun}?", "Say why this {noun} is being rejected. The uploader sees this reason.", "Reason (required)", "Up to 300 characters.", "Enter a reason to continue.", "Reject {noun}", "Cancel".
- Invalid state: alert border, inline message, and the submit button **disabled**, because the code disables it while the reason is empty.
- Sample reason: "It does not meet our community guidelines."
- Archived: `6972:46865`, `6972:46908`, `6972:46909`; `6972:47059`, `6972:47102`, `6972:47103`; `6972:47250`, `6972:47293`, `6972:47294`.

All archived layers are hidden, prefixed "ARCHIVED ", and moved to y 1224 inside their frame. Nothing was deleted from the old frames.

## Removed tags

`[COPY PENDING LEGAL REVIEW]` was on the layer "Body text" in the three old dialogs (`6972:46909`, `6972:47103`, `6972:47294`). The new dialogs carry no tag. The tag remains only on the archived copies.

## In the old frames but not rendered by the code (dropped)

- "Showing 5 of 27" (the list endpoint returns no total).
- The "approved 3 minutes ago" sentence (see group 2).
- Uppercase table headers and field labels (now sentence case).

## Assumptions and places where the code differs from the brief

- Sample uploader "christine001", age "38 min", source "Automatic check" on the item frames, as in the old frames.
- **The profile picture is square with radius 8, not round.** `.media-profile-viewer--avatar` sets a 1:1 ratio and radius 8; no rule makes it a circle.
- Buttons are the shipped Button component (40 high, radius 6), not the brief's 32/8 row-button size, which applies to the queue's Review buttons.
- Preview and Details cards use the shipped Figma card (radius 12); the CSS card radius is 10.

## Noticed, not changed

- The shipped picture reject dialogs 6852:30985 and 6852:31327 say "Up to 500 characters."; the code's limit is 300.
- Those same shipped frames show the submit button enabled in the empty state; the code disables it.
- The restyled queue shows "5 pending" with Load more visible; the code shows "5+ pending" when there is another page.

## Checks

- Top-level count 2004; id hash (djb2-xor, excluding `7230:71662`) 2327422288. Both match the baseline.
- `5794:8710` 1100x620; `5796:8635` Content 1098x1282; `5796:8753` Content 1098x1455.
- No overlaps. All 7 frames are 1440x1184 with Content at x301 y258, 1098 wide, and one search bar.
- Visible layers outside the Admin Shell: no text under 12px, no uppercase labels, no copy tags, no unbound solid fills.
- Contrast: all text 4.5:1 or better except the two disabled button labels (4.35, "Approve" on 6972:46686 and "Reject profile picture" on 6972:46863), which WCAG exempts.
