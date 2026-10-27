# post-media — user post and contest-entry media (B-041, B-036)

`backend/w14-post-media-pipeline`. Decision Log #419 (reverses the links-only launch of #418 item 7).
Backend only: no frontend, no Figma, no Decision Log docx edit.

A user's photo or video reaches a post (or a contest final entry) only through this pipeline. A free URL
is no longer accepted from a user on any route.

## The flow

```
POST /media/uploads                a one-time link into the QUARANTINE prefix  (JwtAuthGuard + GuardianConsentGuard)
browser PUTs the file to the link  (type and exact length are part of the signature)
POST /media/uploads/:id/confirm    verify -> strip metadata -> PUBLIC prefix -> delete the original -> queue the check
(background sweep, every minute)   Amazon Rekognition check -> approved | rejected | left pending for a moderator
POST /posts  { mediaIds: [...] }   attaches the caller's own uploads
GET    /media/uploads/:id          the uploader's own view (status, reason, url)
DELETE /media/uploads/:id          remove an upload and its files
```

### Confirm, step by step (`PostMediaService.confirmUpload`)

1. The row is claimed (`awaiting_upload -> processing`) so two simultaneous confirms process the file once.
2. `HEAD` the quarantined object: missing -> 409 `upload_not_received` (nothing is lost, the client can retry);
   size is not the declared size, or over the limit -> 400 `file_too_large`, original and row deleted.
3. Download to a temp file. **Magic bytes** (`media-signature.util.ts`) must agree with the declared type
   (JPEG, PNG, WebP, MP4, QuickTime, WebM; no GIF, no HEIC) -> else 400 `unsupported_file`, original and row deleted.
4. **Image**: re-encoded by `sharp` with all metadata removed (EXIF orientation is applied to the pixels first),
   decoded under a 100-megapixel guard. **Video**: `ffprobe` (duration, has a video stream; over the limit ->
   400 `video_too_long`), then `ffmpeg` **remux, no transcoding**: first video and first audio stream only,
   global/stream/chapter metadata dropped. **If ffmpeg/ffprobe are missing a video FAILS CLOSED: 503, nothing
   stored** (checked when the link is requested and again here).
5. Write to the **public prefix** `post-media/<uploaderId>/<uploadId>.<ext>`, mark the row `ready`
   (`status: pending`, `checkState: queued`), then delete the quarantined original (on failure the key stays on the
   row and the purge finishes the job).

Nothing in this flow approves anything.

### The automatic check (`MediaCheckService`, `PostMediaSweepService`)

Images go to Rekognition `DetectModerationLabels` (an image over the API's 5 MB byte limit is downscaled **for the
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

The processed **file itself** is also stored (object store, public prefix) and, until it is deleted, the original in the quarantine prefix.
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
| Processed file + `PostMedia` row | while the post exists | post deleted (objects removed by the app); uploader deletes it; account anonymised |
| `checkLabels`, `rejectionReason`, decision fields | with the row | with the row. **No separate retention clock exists** (OPEN: see the report) |
| A rejected file | stays in the object store until the uploader removes it, the post is deleted or the account is anonymised | OPEN (see the report: legal-hold / CSAM evidence handling is undecided) |

### Who can read what

- **Uploader**: their own rows (status, reason, url, type, size, duration, postId), never `checkLabels`.
- **Other users**: the URL only of a file attached to a post they can see, i.e. only after approval. They can never list or read another user's `PostMedia`.
- **The object store**: a processed file sits in the public prefix **before it is approved**; it is fetchable by anyone who has its URL
  (an unguessable `<uploaderId>/<uploadId>` key the API shows only to the uploader). OPEN: see the report.
- **Admins**: no admin endpoint exists yet (B-037, the review queue, is a separate task).
- **Rekognition (AWS)**: only the still image(s) described above, for the duration of the call.

## Configuration

All in `.env.example` and `render.yaml` (both services): `POST_MEDIA_*` limits, `FFMPEG_PATH`/`FFPROBE_PATH`,
`REKOGNITION_*`, `MEDIA_CHECK_*` thresholds. Human steps before it works in production: R2 bucket + keys and a **CORS rule
allowing PUT from the web app origin** (B-207, B-090), ffmpeg/ffprobe on the host (not on Render's native Node runtime), an AWS
account and a `rekognition:DetectModerationLabels` IAM user, optionally a bucket lifecycle rule expiring `quarantine/` after 1 day
as a backstop to the purge.

## Not built here

The admin review queue and its approve/reject endpoints (B-037, W15); the web composer (FC10); the Figma upload states (K13);
a feed-level "under review" flag on the author's own posts; DMs (`Message.mediaUrl` is still a free URL); admin article/cover
media (`MediaAsset`, the admin-only path, is unchanged); avatars and covers (they have their own pipeline).
