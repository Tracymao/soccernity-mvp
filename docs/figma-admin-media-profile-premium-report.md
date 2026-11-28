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
