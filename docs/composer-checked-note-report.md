# Composer "checked" note removed (CH-H15)

2026-11-26. Decision Log #583, build register B-336, Section 153. Web only.

## What changed

Two standing pre-upload sentences are gone:

- "Everything you upload is checked before other people can see it." (post composer and Bants room composer)
- "Everything you upload is checked before it can be shown, and your video stays hidden from everyone but you until the reveal." (contest final entry)

Unchanged: the day-25 reveal sentence on an approved final video, the size and deadline note, "You can change your video until you submit.", the "Uploads aren't available right now" notice, rejection and error wording, and every visibility rule.

## Files

- `apps/web/src/pages/community/MediaAttach.tsx` (note, empty-tray branch, header comment)
- `apps/web/src/pages/community/FinalWeekPanel.tsx` (second note paragraph)
- Tests: `PostComposer.media.test.tsx`, `BanterRoomPage.test.tsx`, `FinalWeekPanel.test.tsx` (two new tests: reveal sentence after approval, uploads-off notice)
- Playwright specs `e2e/tests/18-fc10-media-upload.spec.ts` and `62-b042-bants-attachments.spec.ts`: they asserted sentence 1 was visible and now assert it is absent

## Search

After the change, the only places either sentence appears in `apps/web` and `e2e/tests` are the assertions that it is absent. `docs/pending-copy-manifest.md` had no row for either.

## Verification

- `eslint` on the touched web files and `tsc --noEmit`: clean.
- `vitest run`: 2,251 of 2,252 passed (168 of 169 files). The failure was a focus assertion in `settings/ChangePasswordPage.test.tsx`, a file this change does not touch; it passed on rerun with the three touched test files (74 of 74).
- `npm run build:release`: passed, including the pending-copy check.
- Real Chrome against the built app with a mocked API, at 1280 and 390 px: 22 of 22 checks passed (sentences absent, attach buttons enabled and not moving, size and deadline note present, reveal sentence after a mocked approval, no page errors). Chrome was the local Windows install, not `/usr/bin/google-chrome`. Screenshots were kept outside the repository.
- Not run: the Playwright specs.

## Decisions the task did not spell out

- The Decision Log number is #583, not #582. Register Section 152 already names #582, although neither the Decision Log table nor Section 7 has a row for it. #582 still needs its rows from whoever owns it.
- Added a short status note to `CLAUDE.md`, as that file requires.
