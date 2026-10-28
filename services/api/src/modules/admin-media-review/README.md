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
