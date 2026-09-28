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

- **No `GET /admin/action-log` (or similar) read endpoint.** This PR is
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
