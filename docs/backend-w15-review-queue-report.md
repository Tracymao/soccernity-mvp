# Backend W15 — the media review queue (B-037)

Branch `backend/w15-media-review-queue`, from `origin/main` after W14 (PR #474). Decision Log #419 item 4.
`services/api` only, plus `render.yaml`, `.env.example` and docs. No frontend, no Figma, no Decision Log docx,
no `docs/sprint-1-dpia-outline-draft.md`, no Log Book.

## 1. What was built

| Item in the brief | Where |
|---|---|
| (1) `GET /admin/media-review`: cursor, newest/oldest, `source` auto-check or user-report, `status`, uploader public name and id, kind, size, age, source, the check's category labels, short-lived view URL, never an email | `modules/admin-media-review/` |
| (2) `POST /admin/media-review/:id/approve` | same; decision logic in `post-media/post-media-decision.service.ts` |
| (3) `POST /admin/media-review/:id/reject`, reason required and length-limited, idempotent, refuses an already-decided item | same |
| (4) `POST /media/:id/report` (`JwtAuthGuard` + `GuardianConsentGuard`), one per user per item, not your own, blocked pairs get the same 404, queue entry, hold past a configured threshold | `post-media/post-media-report.{controller,service}.ts` |
| (5) Deciding writes an admin action log row and a Notification to the uploader (approved / rejected); automatic decisions send the same | `AdminActionLogService` (`media.approved`, `media.rejected`, target `post_media`); notification types `post_media_approved`, `post_media_rejected`; `media-check.service.ts` |
| (6) Approved item publishes its post when all its other media are approved; rejected keeps the post author-only until the media is removed | derived on read by `post-media-visibility.util.ts` (no extra write); proven in e2e |
| (7) The uploader can read their own rejection reason, owner-only | already `GET /media/uploads/:id` (W14); now covered by a test; anyone else gets 404 |
| (8) `GET /admin/media-review/stats` | counts of auto-approved, auto-rejected, sent to review, reported, decided by a moderator over `?days=` (default 7, max 90). Aggregates only |

Also added: `GET /admin/media-review/:id` (one item that has been through the queue), and a short-lived signed GET link
(`DirectUploadStorageService.createDownloadUrl`, 5 minutes, never stored).

### Schema (one additive migration, `20261030090000_add_media_review_queue`, rollback in its header)

- `PostMedia`: `reviewEnteredAt`, `reviewEntrySource` (`auto_check` | `user_report`), `reportCount`, `hiddenPendingReview`,
  with CHECK constraints (source and time set together; a report count or a hold only on an approved item).
- New `PostMediaReport` (`mediaId`, `reporterId`, `createdAt`, `resolvedAt`), unique per `(mediaId, reporterId)`, cascade with the item.

### Configuration (both services of `render.yaml`, and `.env.example`)

`MEDIA_REPORT_HIDE_THRESHOLD` (default 3; 0 = never hide automatically), `MEDIA_REVIEW_UNCHECKED_AFTER_MINUTES` (default 30).

### Behaviour worth knowing

- **Decisions** are one transaction: guarded status write (status in the `WHERE`, so two moderators cannot both win), report
  resolution, notification. A repeat is `409 already_decided`: no second notification, no second log row (proven, including a
  simultaneous approve/reject).
- **Approve on a reported approved item = "keep"**: hold lifted, reports resolved, the uploader is **not** notified (they never
  knew it was reported). **Reject on it** rejects it for good and notifies.
- **The automatic check** now writes its approve/reject notification in the same transaction as the decision, and sends an
  uncertain / gave-up item to the queue.
- **The report route** is the same 404 for everything the reporter cannot see (pending, rejected, unattached, hidden, blocked
  pair either direction, unknown id). A repeat report is `200 { alreadyReported: true }`.

## 2. Verification

See section 6.

## 3. Not built (by scope)

The admin screen and the web report control (FC10), the notification row for the two new types in the web Notification Centre
(unknown types fall back to the generic row), Figma (K13 is drawn), the child-safety-vetting gate (open point 1).

## 4. Found while building

- `POST /media/uploads/report` matches `POST /media/:id/report` with id `uploads`; it 404s in the service (no such item). Harmless,
  noted because the two controllers share the `/media` prefix.
- The W14 report said "no moderator approve/reject endpoint exists yet"; that is now false (this PR). The W14 README text that said so was updated.
- The earlier `media-check.service.spec.ts` asserted "no write at all when Rekognition is unconfigured". That is no longer true on
  purpose (rows that waited are sent to the queue); the spec was rewritten and still asserts that nothing is decided or announced.

## 5. OPEN points, with the default chosen (all veto-able)

1. **Child-safety vetting for reviewers of minors' media.** Undecided in #419. **Default: no gate** (any `moderator` or
   `superadmin` sees every item). Recommended before launch: apply the same rule as reports concerning a minor
   (`ModerationService.assertChildSafetyVetted`: a non-vetted admin does not see items whose uploader `isMinor`). Not built because it
   would hide the queue entirely until a vetted admin exists.
2. **Roles.** Default `moderator` + `superadmin`, no `editor` (an editor does not review user content). Same as the other moderation surfaces.
3. **An unchecked upload when Rekognition is not configured** goes to the queue after 30 minutes (configurable). The brief said the queue
   holds "only" what the check left uncertain; without this an unconfigured deployment would hold every upload pending forever.
4. **Report hold threshold** 3 distinct reporters (configurable, 0 = never). **Brigading risk:** three accounts can hide anyone's
   approved media from other viewers until a moderator acts. Mitigations not built: reporter reputation, rate limit on reports per
   account, a minimum account age. A hidden item is still visible to its author, who is not told.
5. **One report per user per item, ever**: a user whose report was resolved (item kept) cannot report the same item again.
6. **Keeping a reported item does not notify the uploader**; rejecting one does. Reporters are never told the outcome.
7. **Reject reason**: required, trimmed, 1 to 300 characters (same bound as profile images, B-214). It is shown to the uploader verbatim
   and is also written into the admin action log notes.
8. **Reject of an approved item nobody reported is refused (409)**. A moderator who finds a problem file in the wild has to go
   through the report route. Alternative: allow it with a reason.
9. **Auto-approved statistic after a later moderator rejection.** A file auto-approved, reported, then rejected by a moderator becomes
   `decisionSource = 'moderator'`, so it stops counting as "auto-approved" in the window it was counted in. `decidedByModerator` comes
   from the admin action log and is exact.
10. **View link** lifetime 5 minutes (a constant, not in configuration). The file itself is in the public prefix (W14 open point), so the
    link is a convenience, not an access control.
11. **Stats window** by days (1 to 90), ending now. No fixed calendar boundaries, no per-moderator breakdown.
12. **Queue filter `status`**: `pending` = waiting for a decision; `approved`/`rejected` = items that went through the queue and were
    decided. Items the check decided on its own are in neither.
13. **Audit write order**: the action log row is written after the decision commits (existing `AdminActionLogService` behaviour). A crash
    in between leaves a decision with no log row, never the reverse.
14. **Notification copy** is the web's job: the API sends only the type and the media id (`data: { media: { id, kind } }`), never English.
15. **Concurrent reports** at the threshold: the count and the hold are exact (increment is atomic); proven with four simultaneous reporters.
16. **Reports on a final contest entry** before the reveal: not reportable (the post is not visible to anyone else yet).
17. **Account deletion**: `PostMediaReport.reporterId` is a plain foreign key like the uploader's; anonymisation keeps the row (no
    personal data in it). A hard `DELETE` of a reporter would fail; none exists (Decision Log #341).

## 6. Test results

Baselines are the last figures recorded on `main` after W14 (mocked 185 suites / 3,226 tests; API e2e 55 suites / 744 tests), not re-measured on a clean checkout.

| Check | Result |
|---|---|
| `npx tsc --noEmit`, `npx eslint src`, `npx nest build` | clean |
| Mocked suite, `npx jest --maxWorkers=4` | **190 suites (189 passed, 1 skipped) / 3,268 tests (3,260 passed, 8 skipped), 0 failures.** Before: 185 / 3,226. +5 suites, +42 tests (decision service, report service, report controller, admin service, admin controller HTTP; plus cases added to the media-check, notifications and config specs). The 8 skipped are the real-ffmpeg tests, which skip where ffmpeg is not installed (as in W14) |
| API e2e (real Postgres + Redis), one `npm run test:e2e` | **56 suites / 768 tests. 765 passed, 3 failed** in `post-media.e2e-spec.ts` (hook timeouts of 30 s in `beforeEach`, the file took 585 s on a loaded machine). **That file re-run alone: 60/60 passed (198 s).** So 0 failures after the re-run; the three were load, not logic. Before: 55 / 744. +1 suite (`media-review.e2e-spec.ts`), +24 tests |
| New `test/media-review.e2e-spec.ts` | 24 tests, 24 passed: queue membership (uncertain in; auto-approved, auto-rejected and not-yet-checked out; unconfigured check; gave-up check), listing (cursor, order, source, status, no email or real name), approve / reject (reason rules, owner-only reason, repeat is 409 with one notification and one log row, simultaneous moderators, a moderator decision is not overwritten by the check), post visibility (publish on last approval, rejected keeps author-only until removed), report (visible below threshold, hidden at three, keep, reject, own file, indistinguishable 404s, blocked pair, restricted-pending 403, concurrent reporters), stats, view link and storage outage, database constraints |

One test in the new spec needed its audit-log rows moved onto the fake clock (`AdminActionLog.createdAt` is stamped by the database, not the app clock the spec fakes); that is a test artefact, not production behaviour.
