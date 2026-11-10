# Backend: media of a post removed by moderation (B-290, Decision Log #484)

Branch `backend/b290-removed-post-media`, built on the content-removal columns of #483 (`Post.removedByModerationAt` /
`removedByReportId`, PR #714). `services/api` only. One additive migration. `apps/web`, `apps/admin`, the `.docx` and
`docs/build-register.md` are not touched.

## 1. The question the brief asked first

> "State whether an approved file keeps its private copy after publishing (it should: published by copy); if not, stop and report."

**It does not.** `PostMediaObjectsService.finishPublish` deletes the private original after publishing and sets `privateKey` to
`NULL`; reconcile step 3 removes any private copy that is left. An approved, published file therefore has only a public object.
I stopped and reported two options; **Temi chose B**:

* **B (built):** create the private copy **at removal time**, with the existing `withdraw()` (copy public to private, verify the
  size, claim with a guarded `updateMany`, only then delete the public object). Approved files keep their normal state; nothing
  about B-257 changes for a post that is never removed.
* A (not built): keep a private copy of every approved file for ever.

Consequence of B: if the copy cannot be made at removal time, the public object is **left in place** (the post is already hidden by
the database read gate, so nothing is visible) and the reconciler retries every 5 minutes. A public object is never deleted without a
verified private copy.

## 2. What was built

| Step | Where | Behaviour |
|---|---|---|
| Invariant | `PostMediaObjectsService.shouldBePublic`, reconcile queries | A public object exists iff the file is approved, not held by reports **and its post is not removed by moderation**. |
| Withdraw | `ModerationService.actionReport` -> `withdrawForPost(postId)` | After commit, best effort, in the background, for `content_removed` on a **post** only. Reconciler is the repair. |
| Keep | - | The private copy stays until closure. |
| Republish | `ModerationService.decideAppeal` -> `republishForPost(postId)` | Only when an overturned appeal really restored the post (`restoreContentRemoval` returned true). Copies private to public, then `finishPublish` drops the private copy again. Reconciler repairs a miss. |
| Confirm | `RejectedMediaSweepService.confirmModerationRemovals`, step 4 of `runDaily` | When the removing report is **closed** (`reportClosedAt`: appeal window lapsed or appeal upheld) the private object is deleted, `privateKey` becomes `NULL` and `PostMedia.deletedByModerationAt` is set. **The row and the post stay.** |

* Contest-entry videos are `PostMedia` of the entry's post and follow the same path (e2e covers it).
* **One function decides deletion:** `removedMediaDeletableNow` in `rejected-media-evidence.util.ts`. It requires the removing report
  to be closed and then applies the existing protection rule (`partitionEvidence`) **unchanged**: an uploader with an active admin
  hold keeps the file (retry next run), a post with another unclosed report keeps it. **The later B-206 evidence set-aside hooks
  into this function and nowhere else** (documented in the README and in the function).
* The sweep step is capped like its other steps (`POST_MEDIA_STRAY_SWEEP_MAX_DELETES`, deletions plus failures), pages candidates by
  `sequence` so waiting rows never starve later ones, logs **counts only**, and retries a failed delete next run (object deleted
  first, then the row, so a failure between the two is harmless).
* **Gap I closed that the brief did not name:** if the author deletes the removed post (or the account is anonymised) **before
  closure**, `deletableKeys` would have deleted the evidence copy with the row. `evidenceKeyOf` now treats the private copy of a
  removed post's media like a rejected file's private object, so it is deferred through `PostMediaDeferredDeletion` and deleted by
  `processDeferred` after closure (e2e covers it).

Migration `20261126090000_add_post_media_deleted_by_moderation`: `ALTER TABLE "PostMedia" ADD COLUMN "deletedByModerationAt"
TIMESTAMP(3);` (additive, rollback in its header). A genuine addition beyond Section 3: flag as a Decision Log candidate.

## 3. Defaults (founder-veto-able)

* Only a **post** removal is handled (a removed comment or message has no media).
* Closure uses the existing 30-day `REPORT_APPEAL_WINDOW_DAYS`; the hold rule is the existing one.
* A file still published when the sweep runs waits (the reconciler withdraws it first).
* The withdraw and the republish are fire-and-forget after the commit; a failure never fails or delays the moderator action.

## 4. Known gap

The automatic-approval and moderator-approve publish paths do not check whether the post is removed. If a file is approved while
its post is removed, it is published and the reconciler withdraws it on its next pass (about 5 minutes); the post is hidden by the
database read gate in the meantime.

## 5. Verification (measured)

* `tsc --noEmit` clean. `eslint src/modules/post-media src/modules/moderation` clean.
* Unit: `post-media`, `moderation`, `account-deletion`, `env-completeness`, `write-route-guards`: **35 suites passed (1 skipped), 958
  tests passed (8 skipped, the real-ffmpeg ones), 0 failures.** New or changed specs: `post-media-objects.service.spec.ts`,
  `post-media-cleanup.util.spec.ts`, `removed-media-evidence.util.spec.ts` (new), `removed-media-sweep.service.spec.ts` (new),
  `moderation.content-removal.spec.ts`.
* API e2e (real Postgres, private database `soccernity_test_b290`, `--runInBand`), ONLY the new `test/removed-post-media.e2e-spec.ts`:
  **15 tests, 0 failures**: withdraw keeps a private copy, contest-entry video, all files of the post, failed withdraw repaired,
  never republished while removed, overturn republishes, missed republish repaired, no deletion before closure (now, +29d, appeal
  pending), deletion after the window with row and post staying, deletion on an upheld appeal, held uploader keeps then deletes
  after lift, another open report keeps it, failed delete retried, still-published file waits, author deletes the removed post.
  A first run hit a Postgres deadlock (40P01) between the next test's `TRUNCATE` and the previous test's background withdraw; fixed
  with an `afterEach` settle in the spec (test isolation only).
* **Not run:** the full mocked suite, the full e2e suite, every other e2e file, Playwright `e2e/`, `apps/web`, `apps/admin`.
  Before-figures were not taken on a clean `main`.

## 6. Forward-pointer notes (not applied; for the next docs PR)

* Decision Log #484: status line "BUILT by `backend/b290-removed-post-media`" with the two-sentence answer to section 1 (approved
  files have no private copy; B creates it at removal).
* `docs/build-register.md` B-290: BUILT status line; B-206: "the evidence set-aside hooks into `removedMediaDeletableNow`".
* Decision Log #283 / #430 item 2 / the "a rejected file is never deleted" wording: add that a removed post's private copy is
  deleted at closure of the removing report (this one is not the rejected-file rule).
* Decision Log candidate: `PostMedia.deletedByModerationAt` (schema addition beyond Section 3).

Housekeeping: the worktree shares a `node_modules` junction with the b289 worktree, so `prisma generate` for the new column also
updated that shared client. The private test database `soccernity_test_b290` was left behind.
