# Backend report: moderator content removal is enforced (B-289, Decision Log #483)

Branch `backend/b289-content-removal`. `services/api` only; no `apps/web`, `apps/admin`, Figma, `.docx` or `docs/build-register.md` change. The platform is not live.

## 1. What was built

**Schema.** `Post`, `Comment` and `Message` each gain `removedByModerationAt DateTime?` and `removedByReportId String?` (FK to `Report`, `ON DELETE RESTRICT`, indexed). Migration `20261125090000_add_content_removal` (additive; rollback in its header). `Report` gains three reverse relation arrays (named relations `PostRemovedByReport`, `CommentRemovedByReport`, `MessageRemovedByReport`). The purge-reference spec (`anonymized-row-purge.references.spec`) passes unchanged: the new columns point at `Report`, not at `User`, so no classification entry was needed.

**Writing the removal.** `ModerationService.actionReport` with `content_removed`:
- on a `post`, `comment` or `message` target sets both columns on that ONE target, inside the same `$transaction` that records the action (`applyContentRemoval`, `moderation/content-removal.util.ts`). A context message attached to a message report is never touched (only `report.targetId` is).
- if the target is already removed by another report, it is left alone and the response says `contentRemoval: "already_removed"` (`removed` / `already_removed` / `target_not_found`; the key is absent for every other action).
- on any other target type it is a 400 with the new stable code `content_removal_not_applicable`, before anything is written.
- the guardian `content_removed` notice (B-279) still fires after commit, unchanged, and is now true.

**Undoing it.** `decideAppeal` `overturned` on a `content_removed` report clears both columns in the same transaction, only where `removedByReportId` is this report (`restoreContentRemoval`). A restored comment is counted again unless it is hidden.

**Comment counting.** A removed comment does not count toward `Post.commentCount` (decremented, floor-guarded, in the removal transaction); a hidden comment that is then removed is not subtracted twice; deleting a removed comment does not subtract again.

## 2. Read-path inventory

Every file that reads posts, comments or messages (grep of `prisma.post|comment|message`, `tx.*`, and raw SQL) and what was done. "e2e" = `test/content-removal.e2e-spec.ts` (real Postgres); "unit" = the named spec.

| Read path | Result | Covered by |
|---|---|---|
| `GET /posts/feed` (`getFeed`), club feed, Banter room feed | removed post excluded, author included (`visibleToViewer` now ANDs `POST_NOT_REMOVED`) | e2e "is soft-removed ... every read honours it", "a club feed and a Banter room feed leave a removed post out too"; unit `feed.service.content-removal.spec` (visibleToViewer) and `feed.service.spec` (shape) |
| `GET /posts/:id` (`getPostById`) | others: exactly the not-found 404; the author: 200 `{ id, removedByModeration: true }` only | e2e "the AUTHOR alone gets the stub", "is soft-removed ..." (404 sameness); unit `feed.service.content-removal.spec` |
| Comments thread (`getComments`) and every post-scoped action (`assertPostExists`: comment, like, save, view, report, heartbeat) | removed post is a 404 like a missing one | e2e (comments, like, save 404s); unit via `visibleToViewer` |
| Comment in the thread | stays as `{ id, createdAt, removedByModeration: true }`, no text, no author, not counted | e2e "stays in the thread as a text-less stub ..."; unit `feed.service.content-removal.spec` |
| Comment actions (`deleteComment`, `setCommentHidden`) | removed-comment aware: no double count, no re-add | e2e "a hidden comment is not subtracted twice ..." |
| Search posts (signed in and anonymous), trending hashtags | excluded (`search.service` uses `POST_NOT_REMOVED`; `trending.service` raw SQL joins `Post` with `removedByModerationAt IS NULL`) | e2e (search, trending counts) |
| Saved items (`GET /users/:id/saved-posts`), likes | the `SavedPost`/`Like` rows stay; the list leaves the post out (same `visibleToViewer`) | e2e (saved list empty, row count 1) |
| Notifications (`like` / `comment` rows) | the post lookup excludes removed posts, so the row degrades to `data: null` | e2e (like notification becomes `data: null`); unit `notifications.service.spec` |
| Media report (`post-media-report.service`) | removed post's media cannot be reported (`POST_NOT_REMOVED` in the post filter) | unit `post-media-report.service.spec` (5 clauses) |
| Admin dashboard "Latest posts" | removed post left out | code change only; no new test (the existing dashboard specs and the real-Postgres `admin-dashboard-latest-posts` e2e were NOT run) |
| Contest: entry lists, carousel, round reads, final-entry submission (`contest-exposure`, `contest-read-model`, `contest.service`) | a removed contest entry is hidden from entry lists; submitting/pinning a removed post is a 404 | code change only; **no dedicated test** (the contest suites pass but do not assert the new clause); see section 4 |
| User profile post lists / counts | there is no profile-posts endpoint and no post count on any user read | n/a |
| Leaderboard | reads `PointsLedgerEntry`/`LeaderboardEntry` only, never a post | n/a (unchanged) |
| Messages: thread (`getMessages`) | stub `{ id, sentAt, removedByModeration: true }`, no text/original/edit data/sender | e2e "removes ONLY the reported message ... exact stub to both people"; unit `messaging.service.content-removal.spec` |
| Messages: conversation-list preview and unread logic | last message that is removed becomes the stub preview; read-receipt helper ignores removed messages | e2e "is the conversation-list preview stub ..." |
| Messages: edit / delete | the SENDER gets 409 `message_removed` for edit, delete for me and delete for everyone; the other person may still "delete for me" | e2e "the SENDER can no longer edit or delete it ..."; unit `messaging.service.content-removal.spec` |
| Admin reads: `GET /admin/moderation/reports/:id` reported item and context messages | still the FULL item, plus `removedByModerationAt`; a removed message cannot be added as context on a new report | e2e "the admin report detail still returns the FULL message ..."; unit `moderation.message-report*.spec` |
| Data export | **unchanged** (see section 3) | n/a |
| Account hold rules, purge references, retention job | unchanged (they key on `Report`, `Message`, `Post` rows that still exist) | n/a |

## 3. Things I left unchanged and what they do

- **Data export** (`data-export-file.builder.ts`): still exports the account holder's OWN posts, comments and sent messages with full text, including rows a moderator has removed. The brief said leave it unchanged. It is the person's own data, so this is probably right, but it means a removed item's text is still downloadable by its author. Decision for the founder.
- **Contest ranking and points**: not changed (per the brief). Findings: a removed entry is hidden from entry lists, but a `ContestEntry`, its votes, its `ContestEngagement`/impression rows and any `PointsLedgerEntry` it already earned remain; the entry can still be counted in the round ranking and in a vote tally. Whether a removed entry should stop competing, and whether points it earned should be revoked, is not decided.
- **Engagement points**: a like/comment/view point already earned on a post stays when the post is later removed (only author-initiated deletion paths revoke today).
- **Author management routes on a removed post** (delete own post, comment settings): the author can still call `DELETE /posts/:id` on their removed post (the row is theirs; a hard delete then removes the evidence the removal rests on; `removedByReportId` is `RESTRICT` toward `Report`, not toward `Post`). Not changed.
- **Media files** of a removed post stay in storage and keep their status; only the post is hidden.
- **Notification policy lookups** (`shouldCreateNotification`) read interactions without a removal filter.

## 4. Open questions / findings

1. **Message stub has no `senderId`/`conversationId`.** The brief says `{ id, sentAt, removedByModeration: true }` and "no text, no original and no edit data", so I followed it literally. The web client therefore cannot tell whose bubble a removed message was (mine or theirs) from the stub. If the UI needs that, adding `senderId` is a one-line change; flagging it rather than guessing.
2. **Contest entry tests**: the hidden-entry clauses are covered by no new test. A unit test per contest read service would be cheap; not done within the "new and changed specs only" scope.
3. **Removed comment shown to its own author**: the thread stub has no author, so the commenter also just sees the stub.
4. **Recipient "delete for me" on a removed message** is allowed by design (the removal is not theirs); only the sender is blocked.

## 5. Verification (measured)

- `tsc --noEmit` clean; `eslint` clean on `moderation`, `feed`, `messaging`, `search`, `notifications`, `admin-dashboard`, `post-media`, `contest`.
- New unit specs: `content-removal.util.spec.ts`, `moderation.content-removal.spec.ts` (29 tests, 0 failures together), `messaging.service.content-removal.spec.ts` (5), `feed.service.content-removal.spec.ts` (5). All pass.
- Existing specs updated because their pinned shapes necessarily grew (no assertion weakened or removed): `feed.service.spec` (visibility helper, extra `removedByModerationAt` clause, result casts), `feed.service.media-sensitive.spec` (casts), `moderation.service.spec`, `moderation-guardian-notice.spec` (mocks), `moderation.message-report.spec` and `moderation.message-report-context.spec` (admin read gained `removedByModerationAt`), `notifications.service.spec`, `post-media-report.service.spec` (clause count 4 to 5), `messaging.service.edit-delete.spec` (the edit/delete `where` gained the removal guard). One enquiry email test no longer includes `content_removed` in its action loop (that action is now a 400 on an enquiry target).
- Affected module unit suites re-run: `moderation`, `feed`, `messaging`, `notifications`, `post-media`, `search`, `admin-dashboard`, `contest`, `account-deletion` all pass (the last combined runs: 17 suites / 589 tests for moderation + feed; 49 suites / 1,002 tests for the rest; 0 failures).
- API e2e (real Postgres, private database `soccernity_test_b289`, `--runInBand`), ONLY the new `test/content-removal.e2e-spec.ts`: **15 tests, 0 failures**.
- **Not run:** the full mocked suite, the full e2e suite, the other e2e files that touch posts/messages/reports (`moderation`, `moderation-holds`, `messaging`, `feed-*`, `admin-dashboard-latest-posts`, `contest*`, `account-hold`), Playwright, `apps/*`. Before-figures were not measured on a clean `main`.

## 6. Forward-pointer notes (not applied: no `.docx` or `docs/build-register.md` edited)

- Decision Log **#483**: Status cell: built by branch `backend/b289-content-removal`; `content_removed` enforced for post, comment and message; `user_suspended` still not enforced.
- Build register **B-289**: status line: schema, enforcement, read paths, appeal restore built; open items = section 3 and 4 above (data export, contest ranking/points, message stub shape, contest tests).
- Decision Log #138 / #403 item 8 / B-279: no change, but the B-279 guardian `content_removed` notice is now literally true.
- A Decision Log candidate for the new columns (genuine additions beyond Section 3's `Post`/`Comment`/`Message` field lists).
