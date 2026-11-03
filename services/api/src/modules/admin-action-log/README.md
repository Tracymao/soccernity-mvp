# admin-action-log module

Build target: **feat/admin-action-log** (backend-api, 2026-09-27) — the
application half of `AdminActionLog`, laid down as schema groundwork by
`schema/report-severity-escalation-admin-vetting` and flagged there as "no
application code writes to this model in this PR; it is schema groundwork
only." This module is that application code.

Zero `schema.prisma` diff, zero new migration — the model already existed
(migration `20260927112530_add_report_severity_escalation_admin_vetting`).

---

## What this is

A small, reusable service — `AdminActionLogService.record(adminId, action,
targetType, targetId, notes?)` — that writes one append-only
`AdminActionLog` row per call. No controller, no read endpoint (see
"Not built" below). Every module that performs a moderator/admin action
worth an audit record imports `AdminActionLogModule` and calls this one
method, rather than each writing its own inline `prisma.adminActionLog.create(...)`.

This is deliberately a **separate concept** from `Report`'s own
`reviewedByAdminId`/`actionTaken`/`appealStatus`/`appealReviewedByAdminId`/
escalation-trail fields — those record the moderation-decision lifecycle
of *one specific* `Report`; `AdminActionLog` is a general, cross-resource
audit trail meant to eventually cover every admin-console action worth
auditing (article edits, category changes, user suspensions, admin role
changes, ...), not just Report review.

---

## Call sites wired in this PR

| Module | Method | `action` | `targetType` / `targetId` | `notes` |
|---|---|---|---|---|
| `ModerationService` | `actionReport` | `report.actioned` | `report` / the report id | the recorded `dto.action` (e.g. `content_removed`) |
| `ModerationService` | `decideAppeal` | `report.appeal_decided` | `report` / the report id | the recorded `dto.decision` (`upheld`/`overturned`) |
| `ModerationService` | `escalateReport` | `report.escalated` | `report` / the report id | `escalatedToAuthority=<bool>: <escalationNotes>` |
| `AdminStaffVettingService` | `setChildSafetyVetting` | `admin_user.child_safety_vetting_updated` | `admin_user` / the **target** admin's id (not the caller) | `childSafetyVetted=<bool>` |
| `AdminUsersService` | `updateUserStatus` | `user.status_updated` | `user` / the user id | `status=<active\|suspended\|deleted>` |
| `AdminStaffRolesService` | `updateAdminRole` | `admin_user.role_changed` | `admin_user` / the **target** admin's id | `role=<editor\|moderator\|superadmin>` |
| `AdminStaffRolesService` | `updateAdminStatus` | `admin_user.status_updated` | `admin_user` / the **target** admin's id | `status=<active\|deactivated>` |

In every case `adminId` passed to `record()` is the **acting** admin (the
`AdminAccessTokenPayload.sub` of whoever made the call) — for
`setChildSafetyVetting` this is the calling superadmin, not the admin
being vetted, which is the `targetId` instead.

A log row is written only on a **successful** state change — every guard
check (404/403/409) that this codebase already enforces on these methods
still runs first and still throws before any log write is attempted; a
rejected action never produces a log row.

---

## Admin-user "block" vs. "role-change" (per the task brief's own PR 5/6
framing)

The task brief that dispatched this PR referred to "admin-user
block/role-change (PR 5/6)" and left the exact sequencing to this PR's own
judgment. Checked directly rather than assumed:

- **"Block"** already exists and is already merged to `main` —
  `AdminUsersService.updateUserStatus` (`PATCH /admin/users/:id`,
  `sprint-5/admin-users-dashboard-backend`), covering
  `active`/`suspended`/`deleted` on a platform `User` row. **Wired in this
  PR** (see the table above) — there was no reason to stub something that
  already exists and is already live.
- **"Role-change"** — an endpoint that lets a superadmin change another
  `AdminUser`'s `role` (`editor`/`moderator`/`superadmin`) — does **not
  exist anywhere in this codebase**. Confirmed by grep across
  `src/modules` for any route/service method that writes `AdminUser.role`,
  and by checking for any remote branch/PR named for it (`git branch -r`)
  — neither turned anything up. There is therefore no call site to wire
  `AdminActionLogService.record()` into, and nothing to meaningfully
  "stub" either (a stub call site inside a controller/service that itself
  doesn't exist yet isn't a real stub, just dead code with no caller).
  **Deliberately deferred, not built here** — `ADMIN_ACTION_LOG_ACTIONS.ADMIN_ROLE_CHANGED`
  (`admin_user.role_changed`) is reserved in `admin-action-log.constants.ts`
  specifically so whoever builds that endpoint has a name ready to use,
  rather than inventing an ad-hoc string at that point.
  **RESOLVED — see `../admin-staff-roles/README.md` (`feat/admin-role-management`):**
  `PATCH /admin/staff/:id/role` now exists, superadmin-only, and calls
  `AdminActionLogService.record()` with exactly the reserved
  `ADMIN_ROLE_CHANGED` action on every successful write.

---

## Verification

Mocked-Prisma unit tests only — `AdminActionLogService.record` is a
single, unconditional `prisma.adminActionLog.create()` call with no raw
SQL, no transaction, and no new relation/constraint beyond the `AdminUser`
FK the schema already carries; none of `test/README.md`'s three e2e-add
triggers apply, the same conclusion `admin-content/README.md` and
`sprint-2/feed-per-user-flags`'s own analogous per-caller-viewer-state
change already reached for comparable plain-write changes. Real
`AdminUser` FK behaviour (a genuinely persisted row, `adminId` resolving
against a real `AdminUser`) is exercised indirectly by every e2e spec that
already drives `actionReport`/`decideAppeal`/`escalateReport`/
`setChildSafetyVetting`/`updateUserStatus` against real Postgres — none of
those specs assert on `AdminActionLog` rows directly in this PR (see "Not
built" below).

Tests added/updated:

- `admin-action-log.service.spec.ts` (new) — the service in isolation:
  writes the given fields, defaults `notes` to `null` when omitted, and
  propagates (does not swallow) a failed write.
- `moderation.service.spec.ts` — `buildService()` now also constructs a
  mocked `AdminActionLogService`; new assertions in `actionReport`/
  `decideAppeal`/`escalateReport`'s existing success-path tests confirm
  `record()` is called with the right `action`/`targetType`/`targetId`/
  `notes`, and confirm it is **not** called on any of the pre-existing
  404/409/403 rejection paths.
- `admin-staff-vetting.service.spec.ts` — same shape, for
  `setChildSafetyVetting`.
- `admin-users.service.spec.ts` — same shape, for `updateUserStatus`
  (both the plain active/suspended write and the immediate-delete
  branch); confirms `record()` is **not** called on the not-found or
  already-deleted rejection paths.

---

## Not built (flagged, not silently decided either way)

- **No `GET /admin/action-log` (or similar) read endpoint.** *(Built later: see the last section.)* This PR is
  write-side only, per its own task brief — nothing in the Admin Console
  currently surfaces this audit trail for a superadmin to review. A real,
  disclosed follow-up.
- **`AdminUser` role-change** — see the dedicated section above.
  **RESOLVED by `feat/admin-role-management`** — no longer an open gap.
- **Article/category edits, media uploads, and every other admin-console
  action this model is eventually meant to cover** are not wired here —
  only the five call sites this PR's own brief named. Extending coverage
  to those is future work, using the same `AdminActionLogService.record()`
  call this PR establishes.
- **No e2e spec asserting on a real, persisted `AdminActionLog` row** —
  see "Verification" above for why this was judged unnecessary for this
  change; if a future PR adds real read-side behaviour on top of this
  model (the endpoint above, or a report that joins across it), that PR
  should add real e2e coverage then, per `test/README.md`'s own
  raw-SQL/transaction/novel-relation trigger list.

## B-280 additions (`backend/b280-withhold-guardian-notices`)

Three new actions, all `targetType: 'user'` (the minor), written in the SAME transaction as the change they record:
`user.guardian_notices_withheld`, `user.guardian_notices_cleared`, `user.guardian_notices_reviewed`. Their notes hold the
admin's reason or note. **No endpoint reads this log**, so they are visible to nobody through the API; if one is ever
added it must hide these three actions from admins who are not child-safety vetted (Decision Log #458: nobody except
vetted admins may learn that the flag exists).


## GET /admin/action-log (`backend/admin-action-log-read`, Decision Log #464 option B)

The read side. **Reading the log does not write a log row.** Files: `admin-action-log-read.module.ts` (a separate module
from the write-side `AdminActionLogModule`, which many modules import), `.controller.ts`, `.service.ts`, `.query.ts`
(parsing, stable error codes, the cursor), `.constants.ts`, `dto/list-action-log-query.dto.ts`.

**Who may call it:** every admin role (`AdminJwtAuthGuard` + `AdminRolesGuard` with no required roles; no role rule is
copied from any other controller). **What a caller gets:**

| Reader | Rows returned |
|---|---|
| `superadmin` | every row (optionally filtered by `adminId`) |
| any other role (`editor`, `moderator`, or an unknown value) | ONLY the rows where they are the acting admin |

The scope is applied in the SQL: for a non-superadmin the query always carries `adminId = <the token subject>`. The
caller's id and role come from the verified token, never from the request. A non-superadmin who passes `adminId` at all
(another admin's id, or their own) gets `400 admin_action_log_admin_filter_not_allowed` (rejected, not silently ignored;
**veto-able default**).

**Query (all optional):** `cursor`, `limit` (1 to 50, default 20: `ADMIN_USERS_DEFAULT_PAGE_SIZE` and
`ADMIN_USERS_MAX_PAGE_SIZE`, reused, the Section 5.5 convention; **veto-able**), `action` (one of
`ADMIN_ACTION_LOG_ACTIONS`), `from` (inclusive), `to`, `adminId` (superadmin only). `from` and `to` are `YYYY-MM-DD` (a
date-only `to` covers that whole UTC day) or an ISO-8601 time with an explicit zone (`to` includes that millisecond). The
response is `{ items, nextCursor }`, newest first, keyset on `(createdAt, id)`. No total is returned. Each item:
`{ id, createdAt, actor: { id, displayName }, action, targetType, targetId, notes }`; `displayName` is
`AdminUser.fullName`; `notes` is returned exactly as stored. Every rejection has a stable `code`:
`admin_action_log_action_invalid`, `_date_invalid`, `_range_invalid`, `_admin_id_invalid`, `_admin_filter_not_allowed`,
`_limit_invalid`, `_cursor_invalid`.

### The child-safety rule (applies to EVERY reader, a reader's own rows included)

Decided by a fresh read of `AdminUser.childSafetyVetted` (`isAdminChildSafetyVetted`, the one shared rule), whatever the
role. A vetted admin sees these rows; for any other reader they are **left out of the query** (not removed after the
read), so the page size and cursor behave exactly as if the rows did not exist: no placeholder, no gap, no count. An
`action` filter that names a hidden action returns an empty page, not an error.

1. **By action, whatever the target:** `user.guardian_notices_withheld`, `_cleared`, `_reviewed`, `user.dob_viewed`,
   `user.dob_corrected`, `guardian.incorrect_details_resolved` (`ADMIN_ACTION_LOG_CHILD_SAFETY_ACTIONS`; the last is
   **added by this build**: it acts on a guardian's report about a minor, and the founder named only guardian-notice and
   date-of-birth actions).
2. **By target, using the checks the codebase already has:**
   - target is a `user` who is a minor (`User.isMinor`, the media review's own test), **or cannot be found** (fail
     closed). This covers `user.status_updated`, `user.username_revoked`, the `account_hold.*` actions and any other row
     with `targetType = 'user'`.
   - target is a `report` with `concernsMinor` (the moderation queue's own test), or cannot be found (fail closed).
   - target is a `post_media` item whose uploader is a minor, or that cannot be found (fail closed: a media item is
     deleted with its account).
   - target is a `contact_enquiry` that was escalated into a report with `concernsMinor`. An enquiry that cannot be found
     is **not** hidden (a minor flag exists only on an escalated enquiry, and the 12-month retention job never deletes an
     escalated one).
3. Everything else (`admin_user`, `contest_cycle`, `search` targets) is visible.

**Limitations, flagged, not fixed:** the minor test is the target's CURRENT `isMinor`, so a row about someone who was a
minor when the action ran and has since turned 18 is shown to an unvetted reader (the guardian-notice and
date-of-birth actions stay hidden regardless). The fail-closed rule hides a row about an account that has since been
purged from an unvetted reader's own history.

### Tests
`admin-action-log-read.query.spec.ts`, `.service.spec.ts`, `.controller.http.spec.ts` (mocked), and
`test/admin-action-log-read.e2e-spec.ts` (real Postgres: the role matrix, the vetting matrix for every reader role, every
target kind, pagination with createdAt ties and with hidden rows interleaved, filters, bad values, no writes on read, and
a row written by a real `PATCH /admin/users/:id`). Raw SQL is used because `targetId` is a bare string with no relation,
so "the target is a minor" cannot be written as a Prisma `where`; every value is a bound parameter.
