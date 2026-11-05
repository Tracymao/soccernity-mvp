# admin-media-review — the moderator media review queue (B-037)

`backend/w15-media-review-queue`. Decision Log #419 item 4. Backend only: no frontend, no Figma, no Decision Log docx edit.

The moderator side of the post and contest-entry media pipeline. The full description of what is in the queue, the routes,
the decision rules and the user report route is in [`../post-media/README.md`](../post-media/README.md), section
"The review queue". This module owns:

| Route | Guard | Does |
|---|---|---|
| `GET /admin/media-review` | `AdminJwtAuthGuard` + `AdminRolesGuard('moderator','superadmin')` | the queue, keyset-paginated (opaque cursor over `PostMedia.sequence`), `order`, `source`, `status` filters |
| `GET /admin/media-review/stats?days=` | same | aggregates only over a window (default 7, max 90) |
| `GET /admin/media-review/:id` | same | one item that has been in the queue |
| `POST /admin/media-review/:id/approve` | same | approve a pending item, or keep a reported one |
| `POST /admin/media-review/:id/reject` | same | reject with a required reason |

The decision itself is `PostMediaDecisionService` (in `post-media/`, next to the automatic check that writes the same
notifications). This module adds the listing, the view link, the stats and the admin action log rows (`media.approved`,
`media.rejected`, target `post_media`), written after the decision commits.

## Privacy

A moderator gets the uploader's **public name and id** only. Never an email, never the real name, never who reported an
item (only how many, and what they wrote). The view link is a signed GET valid for 5 minutes, created per request and never stored.
`GET /admin/media-review/:id` returns only items that have been through the queue, so it is not a general browser of
everyone's uploads.

## Reviewers of minors' media (B-258; Decision Log #430 item 3)

Where the uploader is a minor, the list, the item, approve and reject require a **child-safety-vetted** admin
(`isAdminChildSafetyVetted`, `moderation/child-safety-vetting.util.ts`, the same rule `ModerationService` uses; fresh read, any
role). A non-vetted admin does not see a minor's items in the list and gets the **same 404** as a missing id by id or on a decision,
so nothing leaks. `GET /stats` is unchanged: counts only, accurate for everyone.

## View links and reporter reasons (B-257, B-259)

`viewUrl` is a 5-minute signed link to the file's **current** object: the private prefix while the item awaits a decision, is held
or is rejected; the public prefix once approved. There is no public URL for a pending or rejected file. `reportReasons` lists what
reporters wrote (newest first, at most 20, text only, never who); the uploader and other users never receive it.

## Approve fails closed

Approving publishes the file first (private -> public copy, verified); if that fails nothing changes and the moderator gets a
retryable `503 media_publish_failed`. See `post-media/README.md`, "Private and public prefixes".

## Profile pictures in the same queue (B-037; Decision Log #411 item 1, #468)

An avatar or cover photo is reviewed in this queue as a new kind of item. Every item carries `type`: `post_media`,
`profile_avatar` or `profile_cover`.

**What is in it.** A picture whose status is `pending` AND (its `ProfileImageCheck` state is `review` or `gave_up`, OR the automatic
check is not configured, so nothing would ever decide it). One still being retried, or not yet picked up while the check IS
configured, is not shown: the check will decide it. Source is always `auto_check`. No label percentages (the check does not store
them), no size. The age comes from `User.avatarUploadedAt` / `coverUploadedAt` (migration `20261113090000`); older rows are NULL and are
listed as the oldest, with `uploadedAt` and `ageSeconds` null.

**The id.** `avatar:<userId>:<file>` or `cover:<userId>:<file>` (`profile-image-item-id.ts`). `<file>` is the stored file's name, so the
id names the exact FILE the moderator was shown. If the person has uploaded another picture since, the id matches nothing (404) and the
old decision can never reach the new one. A post media id is a UUID and never contains `:`.

**One list, one cursor.** The post-media stream (ordered by insertion sequence, as before) and the profile stream (upload time, then
`<kind>:<userId>`) are merged by time; ties go to post media. The cursor holds a position in each stream. A page with no profile
items encodes exactly as before, and an old `{ sequence }` cursor still works. Profile pictures are listed only for the default
`pending` status and the `auto_check` source (they have no reports and no decision history). Statistics stay post and contest media only.

**Approve** is `ProfileImagePublishService.publish`, the same code the automatic check runs: copy to `profile-media/`, verify, then flip
the status and key, only while the row still points at the key shown. Fails closed with the same retryable `503 media_publish_failed`. No
notification (the automatic approval sends none).

**Reject** is `UserImageReviewService.rejectProfileImage` with the key shown: required reason (trimmed, 1 to 300 characters), ONE
notification, and the guardian notice for a minor. It now also takes down an already-APPROVED picture: copy to the private prefix and verify,
delete the public object, then one transaction rejects it and points the row at the private key. Any failure before that transaction
throws and rejects nothing; a retry finishes the job. A repeat or an already-decided item is a `409 already_decided` with no second
notification and no second log row.

**Minors.** Same rule as post media (B-258): a minor's pictures are visible to, and decidable by, a child-safety-vetted admin only; anyone
else gets the same 404 as a missing id.

**Audit.** `media.approved` / `media.rejected`, target type `profile_image`, `targetId` the PERSON's user id (so the audit-log reader can
hide a minor's rows from an unvetted admin by joining `User`), the kind in the notes (`avatar`, or `avatar: <reason>`).
