# Frontend: content removed by Soccernity (B-289, Decision Log #483)

Branch `frontend/fc-content-removal`. `apps/web`, `apps/admin`, `e2e/`, `docs/pending-copy-manifest.md` and this report only. `services/api`, Figma, every `.docx` and `docs/build-register.md` are untouched. Built on the merged backend (`services/api/src/modules/moderation/README.md`, `messaging/README.md`) and the frames in `docs/figma-content-removal-report.md` (M1 to M5, D1 to D4, A1 to A10).

## What was built

### apps/web
- **Types and clients.** `api/messaging.ts`: `RemovedMessage` (`{ id, sentAt, removedByModeration: true }`), `RemovedMessagePreview`, `LastMessage`, `ThreadMessage` now also includes the stub, guards `isRemovedMessage` / `isRemovedPreview`, `isDeletedMessage` can no longer match a stub, and `MESSAGE_REMOVED_CODE`. `api/feed.ts`: `RemovedFeedComment`, `CommentThreadItem`, `isRemovedComment`, `RemovedPostStub`, `isRemovedPost`; `getPostById` returns `FeedPost | RemovedPostStub`.
- **One shared component** `components/removed/RemovedPlaceholder.tsx` (variants bubble, row, heading), with the three sentences in `removedContent.ts`. It is a status line: no button, no link, no italic, icon hidden from assistive technology, icon stroke in the brand navy. The legal-review tag is split into its own small span so it can be removed later without touching the sentence.
- **Chat thread** (mobile page `ConversationPage`, Community pop-up `ChatWindow`): a removed message is the placeholder bubble with its time; no text, no menu, no Edit, Delete or Report. The "Seen" label and the report-context rows step over a stub (it has no sender and no read time).
- **Conversation lists** (`MessagesPage`, `MessagesSidebar`, `CommunityMessages`): the preview line is the same sentence, never prefixed with "You:".
- **Comment thread** (`PostCard`): a removed comment is the placeholder row in its place: no author, text, time, Hide or Report. A thread of only removed comments no longer says "No comments yet".
- **Post page** (`PostPage`): when the API answers `{ id, removedByModeration: true }` (author only) the page shows the notice and a "Back to home" link and never requests the comments. Anyone else still gets the one generic "Post not found". `PinnedEntry` draws nothing for the stub.
- **409 `message_removed`** on edit or delete of a message the moderator removed meanwhile: the thread turns that message into the placeholder in place (`useMessageActions.markRemoved`). Chosen by `code`, never by message text.

### apps/admin
- Remove Content is offered only for post, comment and message reports (`canRemoveContent`, `actionsForTarget`); Warn, Suspend and Dismiss are unchanged; Deactivate Room still only for a Banter room.
- The report detail shows a "Content removed" pill on the Content row and an "Action taken" row. For a message the pill comes from the server's `reportedMessage.removedByModerationAt`; the admin still reads the removed text (it stays as evidence).
- `content_removal_not_applicable` is handled by its code: "Content can only be removed for a post, a comment or a message." The old "Moderators can't delete a message yet" note is replaced by a sentence saying what Remove Content now does.

## Frame vs server, and judgment calls (veto-able)
1. **Whose removed message is it?** The stub carries no `senderId`, so the client cannot tell the sender's from the recipient's. Frames M2/D2 draw a right-aligned sender variant; it cannot be built. Every removed message is drawn left-aligned and neutral.
2. **Post and comment reports expose no `removedByModerationAt`**, so the admin indicator for those is derived from the report's decision (`status === "actioned"` and `actionTaken === "content_removed"`). An overturned appeal reopens the report and clears it, so the pill goes too. A message report uses the real server field.
3. The removed-post notice keeps the heading style of the frame and adds a "Back to home" link; the frame draws no link target, home was chosen.
4. Frame text colours are mapped to the nearest brand tokens; no new colour.

## Tags and manifest
Three new strings carry `[COPY PENDING LEGAL REVIEW]` and have rows in `docs/pending-copy-manifest.md` (file `apps/web/src/components/removed/removedContent.ts`): the message sentence, the comment sentence, the post notice. The inventory test passes (15/15). `npm run check:pending-copy` still fails by design (B-124).

## Verification (measured)
- `apps/web`: `tsc --noEmit`, `npm run lint`, `npm run build` clean; vitest **152 files / 1,958 tests, 0 failures** (this PR adds 3 test files with 42 tests: `RemovedPlaceholder.test.tsx` 12, `removedContent.test.tsx` 11, `removedByModeration.test.tsx` 19).
- `apps/admin`: `tsc --noEmit`, lint, build clean; vitest **54 files / 880 tests, 0 failures** (adds `contentRemoval.test.tsx`; `messageReport.test.tsx` has one assertion changed on purpose because the old "can't delete a message yet" note is gone).
- Playwright (real Chrome, real API, Postgres, Redis): new `e2e/tests/51-b289-content-removal-web.spec.ts`, **8 passed / 0 failed** (stub shape for both people, pop-up and mobile placeholder with no menu, 409 `message_removed` on edit and delete, inbox preview, comment placeholder mobile and desktop, post notice for the author and "Post not found" for others, removed post absent from the feed). `e2e/tests/47-b284-admin-message-report.spec.ts` had one line changed (it expected the old note) and was re-run with spec 47 of the web leg: 10 passed. Screenshots in `docs/fc-content-removal-screens/` (M1, M3, M4, D1, D3, M5) were compared by eye.
- **Not run:** every other Playwright spec, the `services/api` suites. Screenshots rewritten by the spec 47 run under `docs/b284-*-screens/` were reverted.

## Forward-pointer notes (docx and register not edited)
- `docs/build-register.md` B-289: status line, frontend leg BUILT in `apps/web` and `apps/admin` (this PR); open: sender-aligned removed-message variant needs `senderId` or an `isMine` flag in the stub.
- Decision Log #483: pointer that the three strings are tagged and listed in the manifest; the admin indicator for post and comment reports is derived, not read from a field.
- B-124 / pending-copy list: three new tagged rows.
