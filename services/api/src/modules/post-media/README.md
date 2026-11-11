# post-media — user post and contest-entry media (B-041, B-036)

`backend/w14-post-media-pipeline`. Decision Log #419 (reverses the links-only launch of #418 item 7).
Backend only: no frontend, no Figma, no Decision Log docx edit.

> **Updated by `backend/media-privacy-vetting-followups`** (Decision Log #430 items 2, 3 and 4; build register B-257,
> B-258, B-259). Where this README describes a file in the *public* prefix before approval, that is superseded: see
> "Private and public prefixes" below. The decision of record is **automatic check first, plus report-and-review**
> (#430 item 1, correcting #419 item 4 "every upload is approved by a person").

> **Updated by `backend/b283-delete-rejected-media`** (build register B-283; Decision Log #462 (g), #464). A
> **rejected file's private object is now deleted** on every path that removes its row, and by a daily sweep.
> Everywhere below that says a rejected file is "never deleted" is superseded: see "Deleting a rejected file
> (B-283)". The rule from #430 item 2 that kept it is gone; evidence handling beyond an active hold and the
> statutory-reporting question stay OPEN under counsel (B-206).

> **Updated by `backend/b290-removed-post-media`** (build register B-290; Decision Log #484, on the content-removal
> columns of #483). When a moderator records **Remove Content on a post**, the **public** copy of every file attached to
> it is withdrawn at once and the **private** copy is kept as evidence until the removing report closes; see "Media of a
> post removed by moderation (B-290)". The reconciler invariant is now: a public object exists iff the file is approved,
> not held by reports **and its post is not removed by moderation**.

A user's photo or video reaches a post (or a contest final entry) only through this pipeline. A free URL
is no longer accepted from a user on any route.

## The flow

```
POST /media/uploads                a one-time link into the QUARANTINE prefix  (JwtAuthGuard + GuardianConsentGuard + EmailVerifiedGuard + ProfileCompleteGuard, the POST /posts set)
browser PUTs the file to the link  (type and exact length are part of the signature)
POST /media/uploads/:id/confirm    verify -> strip metadata -> PRIVATE prefix -> delete the original -> queue the check
(background sweep, every minute)   Amazon Rekognition check -> approved (copied to PUBLIC) | rejected (stays private until its post/upload/account is deleted) | left pending (stays private)
POST /posts  { mediaIds: [...] }   attaches the caller's own uploads
GET    /media/uploads/:id          the uploader's own view (status, reason, url, viewUrl)
DELETE /media/uploads/:id          remove an upload and its files
```

### Confirm, step by step (`PostMediaService.confirmUpload`)

1. The row is claimed (`awaiting_upload -> processing`) so two simultaneous confirms process the file once.
2. `HEAD` the quarantined object: missing -> 409 `upload_not_received` (nothing is lost, the client can retry);
   size is not the declared size, or over the limit -> 400 `file_too_large`, original and row deleted.
3. Download to a temp file. **Magic bytes** (`media-signature.util.ts`) must agree with the declared type
   (JPEG, PNG, WebP, MP4, QuickTime, WebM; no GIF) -> else 400 `unsupported_file`, original and row deleted. **HEIC/HEIF** (the
   default photo format on many iPhones) is refused with its own plain message and code `heic_not_supported`, whether declared
   (`image/heic`, `image/heif`, and the two `-sequence` types, at the link step) or sent under another type (detected by its
   `ftyp` brand on confirm; the file is discarded). **There is no conversion** (OPEN: needs a real-device QA run).
4. **Image**: re-encoded by `sharp` with all metadata removed (EXIF orientation is applied to the pixels first),
   decoded under a 100-megapixel guard. **Video**: `ffprobe` (duration, has a video stream; over the limit ->
   400 `video_too_long`), then `ffmpeg` **remux, no transcoding**: first video and first audio stream only,
   global/stream/chapter metadata dropped. **If ffmpeg/ffprobe are missing a video FAILS CLOSED: 503, nothing
   stored** (checked when the link is requested and again here).
5. Write to the **private prefix** `private-media/<uploaderId>/<uploadId>.<ext>` (`privateKey`), mark the row `ready`
   (`status: pending`, `checkState: queued`), then delete the quarantined original (on failure the key stays on the
   row and the purge finishes the job). The row also records the file's *future* public key and URL
   (`post-media/<uploaderId>/<uploadId>.<ext>`, from `DirectUploadStorageService.publicUrlFor`, no network call) so a post
   can point at it; **nothing exists there until the file is approved**.

Nothing in this flow approves anything.

### Private and public prefixes (B-257; `post-media-objects.service.ts`)

The rule: **a file is in the public prefix (`post-media/`) only while it is approved and not held by reports.** Anything
awaiting a decision (uncertain, gave up, never checked), anything held by reports, and anything rejected lives in the private
prefix (`private-media/`). The private prefix name deliberately does **not** start with `post-media`, so a path rule such as
`post-media*` cannot match it.

| Move | When | Behaviour |
|---|---|---|
| **publish** private -> public | an automatic approval, or a moderator Approve / Keep | copy (`copyObject`, server-side), **verify** (`head` size equals the private original), and only then write `approved` + `publishedAt`; then delete the private original. **Fails closed**: if the copy fails the item stays pending, the failure is logged, the automatic check records it as a check failure (retry with back-off, then a moderator) and a moderator gets a retryable `503 media_publish_failed`. A bad copy is deleted again. |
| **withdraw** public -> private | a moderator Reject of a published item, or reports reaching the hold threshold | the status is written first (the database visibility gate hides the file at once), then a verified private copy is made and the public object deleted. A failed move only leaves an object lingering; `publishedAt` stays set and the reconciler retries. |
| **reconcile** (`PostMediaSweepService.reconcileObjects`, every 5 minutes) | always | restores "a public object exists iff approved and not held": withdraws what should not be public, re-publishes an approved item whose public object is missing, deletes the private original of an approved published item. |

**A rejected file stays in the private prefix while its row exists** — none of the moves above (publish, withdraw, reconcile)
deletes it, and a moderator Reject does not delete it either. It is deleted when its row is removed: see "Deleting a rejected
file (B-283)" below. *(This replaces the earlier rule that no purge or cleanup path ever deleted it, #430 item 2.)*

**An approved file has NO private copy** once it is published: `finishPublish` deletes the private original after publishing, and
the reconciler removes any that is left (this is the B-257 design, and B-290 keeps it). Anything that needs a private copy of an
approved file therefore **makes one at that moment** by `withdraw()` (copy public -> private, verify the size, only then delete
the public object): a file held by reports, and a file whose post a moderator removed.

**Known narrow race:** a moderator "keep" landing in the same instant as an automatic withdraw of the same item can leave an
approved row whose public object was just removed; the reconciler heals it from the retained private copy.

**Deployment caveat (human step):** "private" only holds if no public base URL serves the private prefix. With Cloudflare R2
the bucket's `r2.dev` address or a custom domain serves the *whole bucket* unless a rule limits it. `S3_PUBLIC_BASE_URL` must
map **only** `post-media/` (a path rule or Worker), or the private files must live in a separate bucket. Not verified against a real
R2 bucket; belongs to the launch-gate runbook (B-180).

### The automatic check (`MediaCheckService`, `PostMediaSweepService`)

The check reads the file from the **private** prefix. Images go to Rekognition `DetectModerationLabels` (an image over the API's 5 MB byte limit is downscaled **for the
check only**; the stored file is untouched). A video is sampled into frames (`MEDIA_CHECK_VIDEO_FRAME_INTERVAL_SECONDS`,
capped by `MEDIA_CHECK_VIDEO_MAX_FRAMES`, the interval widening to spread them) and **every frame is checked**.
Three outcomes, from configuration thresholds (`media-moderation-decision.util.ts`, a pure function):

| Outcome | Rule | Result |
|---|---|---|
| approved | every label on every frame is below the pass threshold | `status: approved`, `decisionSource: auto` |
| rejected | a label of a reject category at or above the reject threshold, on any frame | `status: rejected`, `decisionSource: auto`, reason "This file didn't meet our rules" |
| pending | anything between | stays `pending`, `decisionSource` NULL: the moderator queue |

Thresholds are **stricter for an uploader who is a minor** (`*_MINOR`). **Nothing is ever approved by default**:
Rekognition not configured -> the sweep does not run the check at all and the rows stay queued; a failure is retried
with doubling back-off (1, 2, 4 ... minutes, capped at an hour); after `MEDIA_CHECK_MAX_ATTEMPTS` the row is left
`gave_up` (pending) for a moderator. A decision is only written if no moderator decided first. A crashed worker's
10-minute lease expires and another worker takes the row over.

### Visibility (`post-media-visibility.util.ts`)

A post with **any** attached media that is not `approved` is visible to its **author only**; everyone else gets the same
404 as a post that does not exist. The fragment is ANDed into `visibleToViewer()` (feed, single post, saved posts,
comments, likes, saves, views) and applied to search, the contest entry list, the pinned entry, the Final-week
carousel and the final ranking. A contest final entry whose video is not approved by the reveal is not shown and is not
ranked at the crown.

### Deleting

- `DELETE /posts/:id` removes the media rows (cascade) and then the stored objects (best effort, after the commit).
- Anonymising an account (`AccountDeletionSweepService.anonymizeUser`) deletes the user's media rows, removes their URLs
  from the posts that survive (#341 keeps the post), and removes the objects after the commit.
- `DELETE /media/uploads/:id` (the uploader) removes one file; a contest entry's file cannot be removed (409).
- `PostMediaService.purgeUnattached` (hourly, B-259) removes **confirmed uploads never attached to a post** once older than
  `POST_MEDIA_UNATTACHED_MAX_AGE_DAYS` (default 7): objects first, then the row; a deletion failure is logged and retried next run.
  A rejected item is purged too (B-283), except for an uploader under an active hold (then it is left whole and tried again).
- `PostMediaService.purgeQuarantine` (hourly) removes quarantine objects older than `POST_MEDIA_QUARANTINE_MAX_AGE_HOURS` (24).
  A link never used loses its row; a confirmed upload whose original could not be deleted loses only the original — and, for a
  rejected one, its private object too (B-283).

### Deleting a rejected file (B-283)

`backend/b283-delete-rejected-media`; build register B-283; Decision Log #462 (g) and #464 (founder decision 2026-11-02).
**A rejected file's private object is deleted on every path that removes its row:** a post deleted by a live account,
`DELETE /media/uploads/:id`, the quarantine purge, the unattached purge, account anonymisation and the account purge
(`post-media-cleanup.util.ts`, `post-media.service.ts`, `AccountDeletionSweepService`, `AnonymizedRowPurgeService`).

**The protection rule** (`rejected-media-evidence.util.ts`, one place for every path). The object is NOT deleted, and the
deletion is retried later, when either holds:

1. the uploader has an **active admin hold** (a legal hold or a bad-faith hold; `findActiveAccountHold` from
   `account-hold.rules.ts`, not a copy of it); or
2. the **post** the file is attached to has a report that is **not yet closed** (`reportClosedAt`, the one closure
   predicate of the hold rules, so an open report, an appeal pending and a still-running appeal window all count).

It applies to the rejected file's private object only. A pending or approved file, a leftover quarantined original and a public
object are deleted as before.

**Why a record.** When a post or an upload is deleted its `PostMedia` row goes with it, so a skipped deletion has nothing left to
retry from. The skip is written to **`PostMediaDeferredDeletion`** (`objectKey` unique, `mediaId`, `uploaderId`, `postId`; no
foreign keys, so it outlives the account and the post) **in the same transaction as the row delete**. The purges instead leave
the whole row in place (no record needed) and try again next run.

**The daily sweep** (`rejected-media-sweep.service.ts`, `@Cron('0 0 4 * * *')`, after the 03:00 account sweep and 03:30 purge):

1. `processDeferred` — for each deferral record, deletes the object (and the record) once neither protection applies.
2. `sweepStrays` — **lists** the `private-media/`, `post-media/` and `quarantine/` prefixes and deletes every object that has
   **no `PostMedia` row**. Never: an object younger than `POST_MEDIA_STRAY_MIN_AGE_DAYS` (default 7, measured on the object's own
   last-modified time; an object with no time counts as young); an object that has a row; an object with a deferral record; an
   object whose uploader (named in the key) has an active hold; an object whose key shape it cannot attribute (counted, never
   deleted). At most `POST_MEDIA_STRAY_SWEEP_MAX_DELETES` (default 200, the cap convention of `ANONYMIZED_PURGE_MAX_PER_RUN`) per
   run. `POST_MEDIA_STRAY_SWEEP_DRY_RUN=true` only counts and logs. **A stray cannot be tied to a report** (the key names only the
   uploader and the media id), so the minimum age is the only protection a stray has against an open report.
3. `deleteUploaderObjects` — called by the account purge right after it deletes a `User` row: removes whatever is still under that
   user's media prefixes (no age limit: the account is gone), skipping an object with a row or a deferral record.

**Needs a LIST permission on the storage key** (the B-207 launch-gate step). Without it the sweep logs one plain error naming the
fix and deletes nothing; `processDeferred` and every lifecycle path still work. The same error class
(`StorageListNotPermittedError`) is raised by `S3StorageService.listObjects` for an `AccessDenied` / 403.

Logs carry counts and media ids only, never an uploader id, a key or any content.

### Media of a post removed by moderation (B-290)

`backend/b290-removed-post-media`; build register B-290; Decision Log #484, on the content-removal columns of #483
(`Post.removedByModerationAt` / `removedByReportId`, set by `content_removed` on a **post** report). Contest-entry videos are
ordinary `PostMedia` of the entry's post, so they follow exactly the same path.

| Step | When | What happens |
|---|---|---|
| **Withdraw** | Remove Content recorded (`ModerationService.actionReport`, after the commit, in the background) | `PostMediaObjectsService.withdrawForPost(postId)` calls `withdraw()` for each published file: a private copy is made from the public object and verified, `publishedAt` is cleared, the **public** object is deleted. The post is already hidden by the database read gate, so a failure only leaves an object lingering; **the reconciler is the repair** (its withdraw query now also selects files whose post is removed). |
| **Keep** | from then until closure | The **private** copy (`privateKey`) is kept as evidence. It is not reachable by any public URL. Nothing deletes it on its own. |
| **Republish** | an appeal on the removing report is **overturned**, and that report was the one that removed the post | `restoreContentRemoval` clears the removal; `republishForPost` copies the private copy back to the public prefix and `finishPublish` drops it again (back to the normal approved state, public only). The reconciler's publish query does the same on its next pass if the immediate call missed. |
| **Confirm (delete)** | the **removing report closes** | The private object is deleted, `privateKey` becomes `NULL`, and the row records `deletedByModerationAt`. **The `PostMedia` row and the `Post` stay.** |

**Approving a file whose post is removed (B-296, Decision Log #484).** Every approval path that used to publish at once now first
asks whether the post is removed (`Post.removedByModerationAt`): the **automatic check** (`MediaCheckService.apply`), a **moderator
Approve** of a pending file and a moderator **Keep** of a reported file (`PostMediaDecisionService.approve`, both branches). If it is,
the file is **approved but NOT published**: no public copy is made, `publishedAt` stays `NULL`, `finishPublish` is not called and the
private file stays where it is. Everything else about the decision (status, reports resolved, the uploader's notification) is
unchanged. The write that records publication also carries `POST_NOT_REMOVED_BY_MODERATION` **in its WHERE**, so a removal that lands
between the check and the write cannot be missed: that write matches nothing, the same approval is written without publishing, and
the copy that had been made is taken out again. When the removal is overturned `republishForPost` (or the reconciler) publishes the
approved file from its private copy. (`publishRow`, used by those two, already carried the condition.) `finishPublish` and
`reconcile` need no change. The evidence rules (`rejected-media-evidence.util.ts`) are untouched.

**Closure** is `reportClosedAt` (the one predicate of the hold rules): the appeal window lapsed (`REPORT_APPEAL_WINDOW_DAYS`, 30), or
the appeal was upheld. A report that is open, has an appeal pending, or is back to open after an overturn is **not** closed.
Because closure is always *after* a removal that was not overturned, a file whose private copy was deleted can never need to be
republished (`deletedByModerationAt` is also in the republish queries' `WHERE`).

**Confirm is step 4 of the daily sweep** (`RejectedMediaSweepService.confirmModerationRemovals`, 04:00, after the deferred
deletions and before the stray sweep). It pages candidate rows (`post` removed by a report, `privateKey` set, not published, not yet
deleted) and asks **one function** which may go: `removedMediaDeletableNow` in `rejected-media-evidence.util.ts`. That function is
the existing protection rule **unchanged** (`partitionEvidence`: the uploader has an **active admin hold** -> keep and retry next
run; the post has another **report not yet closed** -> keep) with one condition in front of it: the removing report must be closed.
It is capped like the other steps (`POST_MEDIA_STRAY_SWEEP_MAX_DELETES`, deletions plus failures per run), logs **counts only**
(deleted / waiting / failed / capped), and a delete that fails leaves the row untouched and is retried on the next run (the object
is deleted first, then the row is updated, so a failure between the two is also retried and harmless).

> **B-206 hook (OPEN under counsel):** the later evidence set-aside (statutory reporting, CSAM) is meant to plug into
> `removedMediaDeletableNow` and nowhere else: one more reason to put an item in `waiting`. Nothing else in the sweep decides
> whether a removed post's copy may be deleted.

**The author deletes the removed post before it closes.** The private copy is then evidence that has lost its row, so it follows the
B-283 rule: `evidenceKeyOf` treats it like a rejected file's private object (`post.removedByModerationAt` is set), the delete is
**not** done with the row, a `PostMediaDeferredDeletion` record is written in the same transaction, and `processDeferred` deletes it
once neither protection applies (the removing report included, because it is an unclosed report on the post until it closes).
Account anonymisation takes the same path (an account with an unclosed report on its post is held, so this is a second line of defence).

Defaults, founder-veto-able: only a **post** removal is handled (a removed comment or message has no media); the republish and the
confirm use the existing 30-day window and the existing hold; a file still published when the sweep runs waits (the reconciler
withdraws it first).

## What is stored, sent, retained and who can read it (for the DPIA drafter; NOT legal copy)

### Stored per upload (`PostMedia`, one row)

| Field | Content | Readable by |
|---|---|---|
| `id`, `sequence`, `createdAt`, `confirmedAt` | identifiers and timestamps | uploader (id, createdAt); admins via the (future) review queue |
| `uploaderId` | the uploading user | server; the uploader's own view omits it (it is them) |
| `kind`, `declaredContentType`, `declaredSize` | what the client declared | server |
| `contentType`, `byteSize`, `durationSeconds` | the PROCESSED file's type, size and (video) duration | uploader |
| `quarantineKey` | key of the unprocessed original while it exists | server only |
| `publicKey`, `publicUrl` | where the processed file is stored | uploader always; **everyone only after approval** (the API never returns the URL of a non-approved file to anyone else) |
| `status`, `decisionSource`, `decidedAt`, `decidedBy` | pending/approved/rejected, auto or moderator, when, which admin id (plain string) | uploader sees status; decidedBy/decisionSource server/admin only |
| `rejectionReason` | "This file didn't meet our rules" (auto) or a moderator's reason | uploader |
| `checkLabels` | **moderation category NAMES only** (no confidence, no image) at or above the pass threshold | server/admin only; **never returned to the uploader** |
| `checkState`, `checkAttempts`, `checkNextAt`, `checkLeaseUntil`, `checkedAt`, `checkError` | the check's bookkeeping; `checkError` is an error NAME, never content | server only |
| `postId` | the post it is attached to | uploader |
| `deletedByModerationAt` | when the private copy of a removed post's file was deleted at closure (B-290) | server only |
| `processingUntil` | confirm-in-progress lease | server only |

The processed **file itself** is also stored (object store: the private prefix until approved, the public prefix only while approved and not held) and, until it is deleted, the original in the quarantine prefix.
A reporter's optional **reason** (`PostMediaReport.reason`, at most 500 characters) is stored with the report and shown to moderators only.
Image metadata (EXIF/GPS/XMP/IPTC) and video metadata (global, stream, chapter, data tracks) are removed before storage; the
original, which may carry them, is deleted straight after and in any case within 24 hours.

### Sent to Amazon Rekognition (`DetectModerationLabels`)

Per call: **one still image as bytes** (the photo, or one sampled frame of a video, at most 5 MB; larger images downscaled first)
and a `MinConfidence` number. **Nothing else**: no user id, no account data, no filename, no URL, no text. Region: `REKOGNITION_REGION`
(default `eu-west-1`, Ireland; Decision Log #391). Returned: moderation labels (name, parent name, confidence). **AWS terms to
check with counsel/the founder** (not decided here): whether to opt out of AWS using submitted content to improve its AI services
(the AWS Organizations "AI services opt-out policy"), and that the call is a transfer of children's images to a processor.

### Retention

| Item | Kept | Deleted when |
|---|---|---|
| Original in quarantine | seconds, normally | right after a successful confirm; otherwise by the hourly purge once older than 24 h |
| Never-confirmed upload (row + object) | up to 24 h | the purge |
| Processed file + `PostMedia` row | while the post exists | post deleted (objects removed by the app); uploader deletes it; account anonymised. A **rejected** file's private object goes too (B-283), unless the uploader is under an active hold or the post has an unclosed report: then it waits in `PostMediaDeferredDeletion` |
| Confirmed upload never attached to a post | 7 days (`POST_MEDIA_UNATTACHED_MAX_AGE_DAYS`) | the hourly unattached purge (a rejected one too, unless the uploader is held) |
| `checkLabels`, `rejectionReason`, decision fields | with the row | with the row. **No separate retention clock exists** (OPEN: see the report) |
| A removed post's media (B-290) | public copy withdrawn at removal; the **private** copy is kept | when the removing report closes (appeal window lapsed or appeal upheld), unless the uploader is under an active hold or another report on the post is open: then it waits. The row and the post stay (`deletedByModerationAt`) |
| A rejected file | stays in the **private** prefix while its row exists; deleted with its row / post / upload / account (B-283); a stray with no row is deleted by the daily sweep once older than `POST_MEDIA_STRAY_MIN_AGE_DAYS` (7) | protected by an active hold or an unclosed report on its post; statutory reporting / evidence beyond that is OPEN under counsel (B-206) |

### Who can read what

- **Uploader**: their own rows (status, reason, url, type, size, duration, postId) and a short-lived signed `viewUrl` to the file's current object (private while under review or rejected, public once approved; 5 minutes, never stored), never `checkLabels`. `url` is the file's *public* URL: it only works once approved. The same `viewUrl` appears on the author's own post media (`media[].viewUrl`) for files that are not public yet.
- **Other users**: the URL only of a file attached to a post they can see, i.e. only after approval. They can never list or read another user's `PostMedia`.
- **The object store**: a pending, held or rejected file sits in the **private** prefix, not fetchable by a public URL (subject to the
  deployment caveat above); only an approved, un-held file is in the public prefix. This supersedes the w14 note that a processed file
  sat in the public prefix before approval.
- **Admins**: moderators and superadmins read the review queue through `/admin/media-review` (see "The review queue" below); that module returns the uploader's public name and id, never an email, a short-lived signed view link to the file's current object, and reporters' optional reasons (never who wrote them). **A minor's items need a child-safety-vetted admin** (B-258).
- **Rekognition (AWS)**: only the still image(s) described above, for the duration of the call.

## The review queue (B-037, `backend/w15-media-review-queue`)

Server half; the admin screen and the web report control are FC10. Routes live in `modules/admin-media-review/` (moderator,
superadmin) and `post-media-report.controller.ts` (users).

**What is in the queue.** Only (a) pending files the automatic check left uncertain, gave up on, or never ran for
(`reviewEnteredAt` set, `reviewEntrySource = 'auto_check'`), and (b) approved files users have reported (`reportCount > 0`).
A file the check approved or rejected on its own is never here; a file still waiting for its check is not either. With the check
**not configured at all**, an upload that has waited `MEDIA_REVIEW_UNCHECKED_AFTER_MINUTES` (default 30) is sent to the queue so
it is not stuck forever; it is still never approved by default.

**Moderator routes** (`AdminJwtAuthGuard` + `AdminRolesGuard('moderator','superadmin')`):

```
GET  /admin/media-review?status=pending|approved|rejected&source=auto_check|user_report&order=newest|oldest&limit&cursor
GET  /admin/media-review/stats?days=7        counts over a window: autoApproved, autoRejected, sentToReview, reported, decidedByModerator
GET  /admin/media-review/:id                 one item that has been in the queue (404 otherwise)
POST /admin/media-review/:id/approve         pending -> approved;  approved-with-reports -> KEPT (hold lifted, uploader not told)
POST /admin/media-review/:id/reject  {reason}  pending or reported-approved -> rejected; reason required, 1 to 300 characters
```

`status=pending` (the default) means "waiting for a decision". A decision is one transaction: the status (guarded in the
`WHERE`, so two moderators acting at once cannot both win), the resolution of the open reports, and the uploader's `Notification`
(`post_media_approved` / `post_media_rejected`, `payloadRefId` = the media id, reason NOT copied). A repeat or a decided item is
`409 already_decided`; an item the check has not finished with is `409 not_in_review_queue`. The admin action log
(`media.approved`, `media.rejected`, target `post_media`) is written after the commit. The automatic check writes the same two
notifications when it approves or rejects on its own.

**What a moderator sees:** the uploader's public name and id (never email or real name), kind, size, age, why it is here
(`sources`), the check's category labels, the open report count, and a 5-minute signed view link
(`DirectUploadStorageService.createDownloadUrl`; if storage is down the item comes back without a link). Never any reporter.

**Reviewers of minors' media (B-258; Decision Log #430 item 3).** Where the uploader is a minor, listing, opening, approving and
rejecting require the admin to be **child-safety vetted** (`AdminUser.childSafetyVetted`, read fresh from Postgres on every call by
`isAdminChildSafetyVetted`, the one rule `ModerationService` also uses; applies regardless of role). A non-vetted admin does not see a
minor's items in the list and gets the **same 404** as a missing id by id or on a decision (never a 403, so nothing leaks). The
statistics card counts stay accurate and are counts only.

**User report** `POST /media/:id/report` (`JwtAuthGuard` + `GuardianConsentGuard`): the file must be approved, attached to a post
the reporter can see right now, and not already held; your own file is `400 cannot_report_own_media`; anything else the reporter
cannot see (pending, rejected, unattached, hidden, a blocked pair either way, unknown id) is the same 404. One report per user per
item, ever (a repeat is `200 { alreadyReported: true }`). The item enters the queue on the first report and stays **visible**; when
the open report count reaches `MEDIA_REPORT_HIDE_THRESHOLD` (default 3 distinct reporters, 0 = never) `hiddenPendingReview` is
set and the item and its post are hidden from everyone but the author (`POST_MEDIA_ALL_APPROVED` in
`post-media-visibility.util.ts`) until a moderator decides; **a newly held file is also moved back to the private prefix**.
**Per-account daily limit (B-258):** at most `POST_MEDIA_REPORT_DAILY_LIMIT` reports (default **20**, a founder-veto-able default) in any
rolling 24 hours, counted from the report records; over it, `429` with the stable code `media_report_daily_limit`. The hold
threshold (3) is unchanged. **Optional reason (B-259):** the body may carry `{ reason }`, trimmed, at most 500 characters (a blank
reason is stored as none); it is stored with the report and shown to moderators only (`reportReasons` on the review item).

**The uploader's own view of a rejection** is the existing `GET /media/uploads/:id` (status, `rejectionReason`); anyone else gets 404.

Open points and the defaults chosen: `docs/backend-w15-review-queue-report.md`.

## Configuration

All in `.env.example` and `render.yaml` (both services): `POST_MEDIA_*` limits, `FFMPEG_PATH`/`FFPROBE_PATH`,
`REKOGNITION_*`, `MEDIA_CHECK_*` thresholds, and (B-037) `MEDIA_REPORT_HIDE_THRESHOLD`, `MEDIA_REVIEW_UNCHECKED_AFTER_MINUTES`, and (B-258, B-259) `POST_MEDIA_REPORT_DAILY_LIMIT` (default 20), `POST_MEDIA_UNATTACHED_MAX_AGE_DAYS` (default 7), and (B-283, all founder-veto-able) `POST_MEDIA_STRAY_MIN_AGE_DAYS` (7), `POST_MEDIA_STRAY_SWEEP_MAX_DELETES` (200), `POST_MEDIA_STRAY_SWEEP_DRY_RUN` (false). Human steps before it works in production: R2 bucket + keys and a **CORS rule
allowing PUT from the web app origin** (B-207, B-090), ffmpeg/ffprobe on the host (not on Render's native Node runtime), an AWS
account and a `rekognition:DetectModerationLabels` IAM user, optionally a bucket lifecycle rule expiring `quarantine/` after 1 day
as a backstop to the purge. **B-283: the R2/S3 key must be allowed to LIST objects** (a founder step at the launch gate, B-207;
Cloudflare's "Object Read & Write" token permission is believed to include it, not re-checked against Cloudflare's documentation).

## Not built here

The frontend switch to `viewUrl` (apps/web still reads `url`; B-260); CSAM and statutory reporting for rejected files, and evidence retention beyond an active hold (B-206, OPEN under counsel);
HEIC conversion; direct-message media (`Message.mediaUrl` is **removed from the API** by B-259 — the send-message DTO, controller and
service no longer accept or return it, so a message is text only until DM upload exists; the database column is deliberately left);
admin article/cover media (`MediaAsset`, the admin-only path, is unchanged); avatars and covers (they have their own pipeline).
The AWS account, IAM user and AWS AI-services opt-out are founder-owned launch steps and are NOT done here.
