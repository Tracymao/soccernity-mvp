# suspected-illegal-media (B-206, founder decision 2026-11-15)

A child-safety-vetted admin can **set a file aside** as suspected illegal imagery, and later record that it was
**filed** with a receiving body or **not filed**. This module records and protects evidence. **It never contacts an
authority, never calls a vendor, and never acts on a Rekognition label.** Filing is a human act done outside the system;
the system only keeps the file and records what the human says they did.

## Routes (all `AdminJwtAuthGuard`; vetted admin required for every file)

| Route | Roles | Notes |
|---|---|---|
| `POST /admin/media-review/:id/suspected-illegal` `{ reason, reportId? }` | moderator, superadmin | one transaction: reject through the existing decision path (generic reason), create the record, audit row `media.suspected_illegal_set_aside` (no reason text in notes). 404 unknown media or report, 409 already set aside. |
| `GET /admin/suspected-illegal-media` | moderator, superadmin | keyset list, `?status=`, `?limit=` (max 50) |
| `GET /admin/suspected-illegal-media/:id` | moderator, superadmin | adds `suggestedBodies` and, while the object exists, a signed view link |
| `POST /admin/suspected-illegal-media/:id/filed` `{ bodyKey, bodyOther?, reference, filedAt?, note? }` | moderator, superadmin | 409 if already decided |
| `POST /admin/suspected-illegal-media/:id/not-filed` `{ reason }` | moderator, superadmin | 409 if already decided |

Vetting: a non-vetted admin on a **minor's** item gets the same 404 as an unknown id; on an **adult's** item a coded
403 `child_safety_vetting_required`. The filing routes are vetted-only (coded 403). Audit rows
`media.suspected_illegal_filed` / `media.suspected_illegal_not_filed` never contain the reference or the reason text.

## What set-aside does, and does not do

Only the existing generic rejection: status `rejected`, reason "This file didn't meet our rules", the public copy of an
approved file withdrawn, the guardian notice a rejection already sends. **No** extra notification, **no** account hold,
**no** change to what the uploader sees beyond that rejection.

## Protection (the one evidence rule)

`post-media/rejected-media-evidence.util.ts` treats a file as **protected** while its record has `status='set_aside'`
**or** `now < preserveUntil` (`SUSPECTED_MEDIA_PRESERVE_DAYS`, default 365, counted from the set-aside time). The match
is by `mediaId`/`objectKey` on the record, so it still protects the object after the `PostMedia` row is deleted. Every
private-object deletion path honours it: post deleted, upload deleted, quarantine purge, unattached purge, account
anonymised, account purged, B-290 closure deletion, the stray-object sweep. A held-back deletion is deferred in
`PostMediaDeferredDeletion` and finished by the daily `processDeferred` once protection ends. The report-retention sweep
skips a report that is a record's `reportId`, or that is on a post whose media has an active record.

## Receiving bodies — PENDING COUNSEL

`receiving-bodies.constants.ts`: GB (IWF, NCA), US (NCMEC), EU (INHOPE-network national hotline), NG (none listed). Every
entry is `pendingCounsel: true`; **no URL is stored** (none was verified). `suggestBodiesForCountry` only orders
suggestions; the admin may pick any key or `other` with a name. Which body, if any, a given case goes to is counsel's
decision, not the code's.

## Data

`SuspectedIllegalMedia` has **no foreign keys** by design (it must outlive the file, the post and the account). It stores
the uploader id, a country snapshot (derived country, else declared, else null), whether the uploader was a minor, the
reason text (admin only, never in audit notes), and the filing outcome. A genuine addition beyond Section 3: a Decision
Log candidate, not transcribed here.

## Not covered

Avatars and covers (`avatar:<user>:<file>` ids) are not set aside by this route (404 `media_not_found`). Retention of the
record itself is not decided. Whether and when evidence is ever released or deleted after `preserveUntil` is counsel's
call (B-206).
