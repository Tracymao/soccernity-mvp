# CH-H13: media and image checks are silent when they pass

Date: 2026-11-26. Branch: `fix/media-checks-silent`. Decision Log #578. Build register B-334, Section 148.

## What changed

The founder's rule: people are not told that a picture or video is being checked, or that it passed. While it is checked the owner sees a thin progress bar. When it passes, the file simply appears where it was uploaded. Only a rejected file gets an alert, with the wording it already had.

### Web (`apps/web`)

- New `QuietProgress`: a thin bar with `role="progressbar"` and a screen-reader label, no visible text. With reduced motion it is a still, faint green bar.
- Post composer tray (`MediaUploadTray`): the "Checking" chip, both "Checking…" lines, "Videos can take a little longer to check.", the "Approved" chips and the "can be seen with your post" hints are gone. An approved file shows its name and Remove.
- Contest final entry: the same, but the sentence "Your video is hidden from everyone but you until the reveal at 00:00 on day 25." stays.
- The author's own post (`PostMedia`): "Under review" and "Only you can see this post until..." are replaced by the bar. The rejected state is unchanged.
- Profile picture and cover (`ProfileImageControl`, `CoverCropDialog`): the under-review and approved notes and the "checked automatically" notes are gone. Replace and Remove stay.
- Notification Centre: `post_media_approved` rows are not rendered.
- The upload phases in `useMediaUploads` were not renamed. Polling is unchanged.

### API (`services/api`)

- `writeDecisionNotification` writes nothing for an approval, automatic or by a moderator. Rejections are written as before.
- `NotificationsService` leaves older `post_media_approved` rows out of the list, the unread count and mark-all-read. Nothing is deleted. The code that resolves that type is kept, because it is harmless and the type still exists in the data.
- `post-media/README.md` updated.

## Safeguarding

No visibility, status or review-queue logic changed. Pending and rejected files are still visible to their owner only, and a post is still hidden from other people until every file is approved (Decision Log #411). Only what the owner is told changed.

## Kept on purpose

- The contest final-entry reveal sentence.
- "Your username review was approved" notification.
- The guardian "Approved" status on privacy settings.
- Button-press confirmations ("Saved", "Copied", "Profile updated").
- Upload percentage, "Keep this window open until it finishes.", Cancel.
- Every error and rejection message.

## Other wording found and left alone

| Place | Text | Why left |
|---|---|---|
| `community/MediaAttach.tsx` | "Everything you upload is checked before other people can see it." | Shown before any upload; it is a safety notice, not a status of the user's file. |
| `community/FinalWeekPanel.tsx` | "Everything you upload is checked before it can be shown, and your video stays hidden from everyone but you until the reveal." and the day 25 sentences | Pre-upload information about the contest. |
| `PrivacySettingsPage.tsx` | guardian "Approved" | Guardian consent, not media. |
| `CreateTopicDialog`, `DataExportPage`, `TwoFactorAuthPage`, `TwoFactorCodePrompt` | "Checking…" | Not about media. |
| `apps/admin` (including "The picture under review") | review wording | The admin console is where files are reviewed. |
| `moderation/report-retention.service.ts` | lists both media notification types | Retention cleanup; it should still remove old approved rows. |
| `test/contest-entry-retention.e2e-spec.ts` | excludes both types | Still correct. |

## Privacy wording check (read only, nothing edited)

`docs/legal-copy-draft-tos-privacy-policy.md` already says files are checked automatically: it names Amazon Rekognition, including for avatars and covers, says a file is not shown to other users until it has passed, and says no hash-matching is in place. Removing the in-app notes does not remove the disclosure from the draft policy. That draft is not approved.

## Push and email

The only side effect of an approval was the notification row. The push sweep sends rows, so with no row there is no push. No email is sent on approval. Rejection still notifies the uploader and, for a minor, the guardian.

## Decisions the brief did not spell out

1. The progress bar keeps a screen-reader label, "Checking picture" (or video, cover photo). Without a label a progress bar is unusable with a screen reader. Veto if the word must not appear there either.
2. The "checked automatically" notes on the profile picture and cover controls were removed, while the two pre-upload sentences in the post composer and the contest panel were left. This is inconsistent; say which way to settle it.
3. Old approved notifications are hidden, not deleted.
4. Decision Log #578 was used. The build register already cites #574, #575 and #577, none of which has a row in the docx table, so those numbers were left to that work.
5. At 600px and below, the contest reveal sentence takes the full width under the file row. A real browser check showed it squeezed into a column about 50px wide beside Remove.

## Files touched

- `apps/web/src/api/notifications.ts`, `pages/NotificationCentrePage.tsx`
- `apps/web/src/pages/community/`: `QuietProgress.tsx` (new), `MediaUploadTray.tsx`, `PostMedia.tsx`, `MediaUpload.css`
- `apps/web/src/pages/profile/`: `ProfileImageControl.tsx` and `.css`, `CoverCropDialog.tsx` and `.css`
- Web tests: `NotificationCentrePage`, `BanterRoomPage`, `FinalWeekPanel`, `PostComposer.media`, `PostMedia`, `SensitiveMedia`, `CoverCropDialog`, `ProfileImageControl`
- `services/api/src/modules/notifications/notifications.service.ts` and its spec
- `services/api/src/modules/post-media/`: `post-media-decision.service.ts` and its spec, `media-check.service.spec.ts`, `README.md`
- `services/api/test/media-review.e2e-spec.ts`, `removed-post-media.e2e-spec.ts`
- Playwright specs 15, 17, 18, 59 and 62 (updated for the new text)
- `docs/Soccernity_MVP_Build_Plan_v1.7.docx`, `docs/build-register.md`, this report, `CLAUDE.md`

## Verification

All runs were local. CI results are not part of this report.

- Web: `tsc` and eslint clean. Full Vitest, 2,228 tests in 166 files: 2,225 passed and 3 failed under load (`GuardianConsentConfirmPage`, `EditProfileModal`, `messageActions`). Those three files, which this work does not touch, passed alone, 156 of 156. The mobile CSS fix came after that run; `tsc`, eslint on the tray and the `FinalWeekPanel` and `PostComposer` specs (24 tests) passed after it. The full suite was not run again.
- API: `tsc`, eslint and `nest build` clean. Full unit suite: 340 suites passed and 1 skipped, 6,693 tests passed and 8 skipped, 0 failed.
- API e2e (real Postgres): `media-review`, `contest-entry-retention`, `removed-post-media`, 64 of 64 passed. The error log lines in that run come from tests that simulate a failed copy.
- `npm run build:release`: passes with no pending-copy tag in the production builds. No removed line carried a tag and the manifest is unchanged. The count on `origin/main` before this change was not measured separately.
- Real Chrome with a mocked API, desktop and 390px: composer picture and video, contest final entry, rejected file, the author's own post, Edit and Create Profile picture and cover, notification centre. 68 checks passed, 0 failed.
- Layout on approval: the final-entry tray stays 78px on desktop. On mobile it grows from 78px to 144px, because the reveal sentence that is kept appears then.
- Playwright (real API, Postgres, Redis):
  - Specs 18, 59 and 62: 18 passed.
  - Spec 15: 27 passed, 1 skipped.
  - Spec 17: 12 passed, 2 skipped.

Screenshots rewritten by the Playwright runs were restored and none is committed.

## Records

Decision Log #578, build register B-334 and Section 148. A python-docx comparison with `origin/main` shows every earlier Decision Log row identical and `word/document.xml` as the only zip part that differs. A line-by-line comparison of the register shows only the new and updated lines for this entry.
