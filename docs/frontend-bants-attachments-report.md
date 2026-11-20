# Bants room composer: pictures and video (B-042), and the uploads-off state (B-306 follow-up)

Branch `frontend/bants-attachments`, from `origin/main` `3184de5` (no open PR touched `useMediaUploads.ts`, `MediaUploadTray.tsx`, `BanterRoomPage.tsx` or `api/postMedia.ts`; `origin/main` later moved to `7e234e0` with a Figma-only change). `apps/web`, `e2e/`, `docs/pending-copy-manifest.md` and this report only. No backend, schema, Figma, upload-limit or avatar/cover change. Decisions: founder 2026-11-14 (Bants takes photo and video exactly like Create Post); Decision Log #501 / B-306 (the switch).

## 1. What the four Figma frames draw (read, not changed)

Read with `get_metadata` and `get_screenshot`; file `weZWWqggy9j13eX8bhFgs6`.

| Frame | What it draws |
|---|---|
| `2256:8925` "Bants - create topic with attachment" (desktop, 1440x1820) | The room-list page behind a full-page scrim (`Rectangle 134`) with a "Create a topic" dialog (`Group 404`, 796 wide): title "Create a topic", a **Title** input, a **Description** input, two attached photo thumbnails (180x169) each with a cancel icon, a "+" add tile, and an "Add to your post" row with a **Post** button. In the row only the GIF (`fluent:gif-16-regular`) and emoji (`bi:emoji-smile`) icons are visible; the photo, video and poll icons are **hidden** layers. |
| `2355:2137` "Bants - create topic" (desktop) | The same dialog with no attachments (the three thumbnails and the "+" tile hidden). Same row: only GIF and emoji visible. |
| `5651:8166` "Bants — Create Topic — Mobile" (390x480) | Sheet header "Create a topic" with a close mark, a Composer Card (avatar "AC", Title input, Description input, an "Add to your post" row with "GIF" and a smiley, a Post button) and a "Note — Behaviour" text. |
| `5651:8207` "Bants — Create Topic with Attachment — Mobile" (390x523) | The same sheet with an **Attachment Preview** row: a 56x42 thumbnail slot, a file name ("sunday-league-goal.mp4"), "12.4 MB · Ready to post" and a close mark. |

So all four draw a **create-a-topic surface** (a title, a description and attachments), not the room-page composer.

## 2. What was built

1. **Bants room composer takes pictures and video** (`BanterRoomPage.tsx`). The disabled "attach photo/video" button and its title are gone. The composer uses the same Picture and Video controls and the same tray as Create Post: `MediaUploadTray`, `useMediaUploads` (unchanged limits, polling, Cancel, Remove, Try again, "Checking", "Approved", rejected reason). The one piece of attach markup both composers use moved to a new `community/MediaAttach.tsx` (`MediaAttachButtons`, `MediaUploadStatus`); `PostComposer.tsx` now uses it and behaves as before. Post still needs text (1 to 3000 characters); the media ids are sent as `mediaIds` in `POST /banter-rooms/:id/posts`; the tray is cleared after posting; a rejected or failed file blocks Post until removed, a file still being checked does not. The author's pending and rejected states are drawn by `PostCard` in the room feed (confirmed in Playwright: "Under review"); another member sees the post only once the check approves it.
2. **Uploads-off state** (`api/postMedia.ts`, `useMediaUploads.ts`). New code constant `POST_MEDIA_CODES.uploadsDisabled = "media_uploads_disabled"` and `isUploadsOffError()`, which accepts both `uploads_unavailable` (503, no object store) and `media_uploads_disabled` (403, the switch). The hook uses it at the link request **and** at the confirm step (one `catch`): the file is dropped, `uploadsUnavailable` turns on, and a link already issued is deleted. Both composers then show "Uploads aren't available right now" with Picture and Video disabled and text posts still working. `FinalWeekPanel` (Week 4 final entry) uses the same hook, so it gets the same fix. `ProfileImageControl` (avatar and cover) is untouched.
3. **No new copy.** The one tagged string ("Everything you upload is checked before other people can see it. [COPY PENDING LEGAL REVIEW]") moved from `PostComposer.tsx` to `MediaAttach.tsx`; its manifest row now names the new file. `npm run check:pending-copy` fails by design and prints **246 places on this branch and 246 on a stashed `origin/main` build; none added.**
4. Design tokens only; the unused `.banter-room-composer__attach` CSS rule was removed.

## 3. What was NOT built

The Figma frames draw a **create-a-topic dialog / sheet** (Title, Description, attachment thumbnails or a file row with size, "Ready to post", GIF, emoji, a poll icon). `apps/web` has no such surface: a room is created from a name and scope, and a post in a room is one text box. Only the **room-composer attachment** was built, as briefed. Not built: the Title and Description fields, the attachment thumbnail grid and "+" tile, the "12.4 MB · Ready to post" file row (the existing tray draws its own statuses), GIF, emoji and poll controls, the "Note — Behaviour" text, and the dialog / sheet itself (there is no endpoint that creates a post with a title). The hidden photo/video icons in the desktop frames mean those frames do not draw the controls this PR builds either; the controls follow Create Post as decided.

## 4. The two fixes

1. Bants room composer: photo and video attach (above).
2. The generic "Upload failed" card when uploads are switched off: now Figma pass Q state 11 on every composer that uses the hook.

## 5. Tests

| Run | Result |
|---|---|
| `apps/web` `tsc --noEmit` | clean |
| `eslint` on the touched `apps/web` files | clean |
| `apps/web` Vitest, whole suite | 154 files / 2,002 tests, 0 failures. New: `useMediaUploads.test.tsx` (403 and 503 at the link request and at the confirm step, an ordinary 403 and a network failure stay errors), Bants room page cases (attach, post with `mediaIds`, clear after posting, blocked by a failed file, no attach button, uploads-off state), `PostComposer.media.test.tsx` (503 and 403 at both steps). The old "keeps the photo/video attach button disabled" test was replaced. |
| Playwright, spec 62 (new, 3 tests) | 3 passed: attach, post and see it in the room feed (the other member sees it only after the check approves it); text-only post and removed picture; API restarted with the switch off: both the Bants and the Create Post composer show "Uploads aren't available right now", controls disabled, text-only post goes out (API left on its default in `afterAll`). |
| Playwright, specs 18, 45, 46, 59 | 18: 7 passed; 45: 3 passed; 46: 5 passed; 59: 7 passed. |

Two existing specs changed because the behaviour they pinned changed on purpose: spec **45** asserted the attach button was disabled (now asserts the old button is gone and Picture / Video are enabled); spec **59**'s web-composer test asserted the generic "Upload failed" card and its header comment said the card was expected (now asserts the uploads-off state; its header comment is updated). Nothing else in spec 59 changed.

In the first full run of spec 62 a database read in the test ran before the new row was visible to the test's own connection, although the page already showed the post (seen for the text-only post in two tests); the spec now polls for the row. I did not find the cause; the page shows the post from the API answer.

## 6. Not run

The full Playwright suite, any other spec, the `apps/admin` and `services/api` suites, CI (not readable from here), a real browser check at tablet width, and anything against a real object store or Rekognition (the harness uses stand-ins). The Playwright run rewrote tracked screenshots under `docs/b071-screens` and `docs/b117-screens`; they were restored with `git checkout`. New screenshots are in `docs/b042-screens/`.
