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
item (only how many). The view link is a signed GET valid for 5 minutes, created per request and never stored.
`GET /admin/media-review/:id` returns only items that have been through the queue, so it is not a general browser of
everyone's uploads.

## Not decided

Whether reviewers of **minors'** media must be child-safety vetted (as for reports that concern a minor,
`ModerationService.assertChildSafetyVetted`). Decision Log #419 lists it as found and undecided, so no such gate exists here;
see the report.
