# post-media — user post and contest-entry media (B-041, B-036)

`backend/w14-post-media-pipeline`. Decision Log #419 (reverses the links-only launch of #418 item 7).
Backend only: no frontend, no Figma, no Decision Log docx edit.

> **Updated by `backend/media-privacy-vetting-followups`** (Decision Log #430 items 2, 3 and 4; build register B-257,
> B-258, B-259). Where this README describes a file in the *public* prefix before approval, that is superseded: see
> "Private and public prefixes" below. The decision of record is **automatic check first, plus report-and-review**
> (#430 item 1, correcting #419 item 4 "every upload is approved by a person").

A user's photo or video reaches a post (or a contest final entry) only through this pipeline. A free URL
is no longer accepted from a user on any route.

## The flow

```
POST /media/uploads                a one-time link into the QUARANTINE prefix  (JwtAuthGuard + GuardianConsentGuard + EmailVerifiedGuard + ProfileCompleteGuard, the POST /posts set)
browser PUTs the file to the link  (type and exact length are part of the signature)
POST /media/uploads/:id/confirm    verify -> strip metadata -> PRIVATE prefix -> delete the original -> queue the check
(background sweep, every minute)   Amazon Rekognition check -> approved (copied to PUBLIC) | rejected (stays private) | left pending (stays private)
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

**A rejected file is never deleted** by any of these, by the quarantine purge, by the unattached purge, by `DELETE
/media/uploads/:id`, by post deletion or by account anonymisation (`deletableKeys` in `post-media-cleanup.util.ts` never lists
a rejected file's private object; tests pin it). Evidence handling is OPEN under counsel (B-206). Consequence, flagged: deleting a
post or anonymising an account removes the *row* of a rejected file but leaves its private object, so Decision Log #419 item 9
("media of a deleted post or anonymised account is deleted") is knowingly unmet for rejected files until counsel decides.
The object key (`private-media/<uploaderId>/<mediaId>.<ext>`) still identifies the uploader and the file.

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
- `DELETE /media/uploads/:id` (the uploader) removes one file; a contest entry's file cannot be removed (409). A rejected file's
  private object is kept (above).
- `PostMediaService.purgeUnattached` (hourly, B-259) removes **confirmed uploads never attached to a post** once older than
  `POST_MEDIA_UNATTACHED_MAX_AGE_DAYS` (default 7): objects first, then the row; a deletion failure is logged and retried next run.
  **Never a rejected item.**
- `PostMediaService.purgeQuarantine` (hourly) removes quarantine objects older than `POST_MEDIA_QUARANTINE_MAX_AGE_HOURS` (24).
  A link never used loses its row; a confirmed upload whose original could not be deleted loses only the original.

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
| Processed file + `PostMedia` row | while the post exists | post deleted (objects removed by the app); uploader deletes it; account anonymised. A **rejected** file's private object is never deleted (OPEN, B-206) |
| Confirmed upload never attached to a post | 7 days (`POST_MEDIA_UNATTACHED_MAX_AGE_DAYS`) | the hourly unattached purge (never a rejected one) |
| `checkLabels`, `rejectionReason`, decision fields | with the row | with the row. **No separate retention clock exists** (OPEN: see the report) |
| A rejected file | stays in the **private** prefix; no purge or cleanup path deletes it | OPEN under counsel (legal-hold / CSAM evidence handling is undecided, B-206) |

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
`REKOGNITION_*`, `MEDIA_CHECK_*` thresholds, and (B-037) `MEDIA_REPORT_HIDE_THRESHOLD`, `MEDIA_REVIEW_UNCHECKED_AFTER_MINUTES`, and (B-258, B-259) `POST_MEDIA_REPORT_DAILY_LIMIT` (default 20), `POST_MEDIA_UNATTACHED_MAX_AGE_DAYS` (default 7). Human steps before it works in production: R2 bucket + keys and a **CORS rule
allowing PUT from the web app origin** (B-207, B-090), ffmpeg/ffprobe on the host (not on Render's native Node runtime), an AWS
account and a `rekognition:DetectModerationLabels` IAM user, optionally a bucket lifecycle rule expiring `quarantine/` after 1 day
as a backstop to the purge.

## Not built here

The frontend switch to `viewUrl` (apps/web still reads `url`; B-260); CSAM / evidence handling for rejected files (B-206, OPEN under counsel);
HEIC conversion; direct-message media (`Message.mediaUrl` is **removed from the API** by B-259 — the send-message DTO, controller and
service no longer accept or return it, so a message is text only until DM upload exists; the database column is deliberately left);
admin article/cover media (`MediaAsset`, the admin-only path, is unchanged); avatars and covers (they have their own pipeline).
The AWS account, IAM user and AWS AI-services opt-out are founder-owned launch steps and are NOT done here.
