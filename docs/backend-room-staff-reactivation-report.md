# Backend: staff reactivation of a Bants room, and the active-creator guard

Branch `backend/room-staff-reactivation`. Decision Log #515 (a room continues after its creator is anonymised) and `docs/backend-room-with-purged-creator-report.md` (PR #788, findings 2 and 4). `services/api` plus one label in `apps/admin`. No schema change, no migration, no new environment variable, no copy.

## What changed

1. **Staff can reactivate a room staff deactivated.** `POST /admin/banter-rooms/:id/reactivate`, through the existing single write path `BanterService.setRoomStatus`.
2. **The creator's controls need an ACTIVE creator account.** `BanterService.assertRoomCreator` (used by `PATCH /banter-rooms/:id/status`, `POST /banter-rooms/:id/topics`, `DELETE /banter-rooms/:id/topics/:topicId`) now refuses with the same 403 and the same message a non-creator gets when the creator's account is not `active` (deleted, suspended, deactivated, pending deletion) or the creator row is missing (dangling `createdBy`). The account is looked up only when the caller IS the recorded creator, so a non-creator costs no extra query.
3. **The admin report detail of a Banter Room report** carries `reportedRoom`.
4. **New audit action** `banter_room.reactivated` (target type `banter_room`), added to `ADMIN_ACTION_LOG_ACTIONS` and, so the existing drift test stays green, to `ACTION_KINDS` / `TARGET_TYPE_LABELS` in `apps/admin/src/api/adminActionLog.ts` (label "Bants room reactivated" / "Bants room").

## Route and shapes

`POST /admin/banter-rooms/:id/reactivate` — `AdminJwtAuthGuard` + `AdminRolesGuard('moderator', 'superadmin')`, `200`.

Body (optional): `{ "note"?: string }`, at most 500 characters, unknown keys are a 400.

Response: `{ "id": "<roomId>", "status": "active" }`.

Errors: `404` unknown room; `409` code `banter_room_already_active`; `409` code `banter_room_not_staff_deactivated`; `403` code `child_safety_vetting_required` (B-297 shape); `403` editor; `401` user token or none.

`GET /admin/moderation/reports/:id`, for a report with `targetType: 'banter_room'`, adds

```
reportedRoom: { id, status: 'active' | 'inactive', staffMayReactivate: boolean } | null
```

(`null` when the room row is gone). `staffMayReactivate` is computed for the CALLING admin: true only when the room is inactive, staff deactivated it and nobody has reactivated it since, and (the deactivating report is not `concernsMinor` OR the admin is child-safety vetted). Every other report keeps its exact shape (no `reportedRoom` key); existing clients keep working.

## How "staff deactivated and not since reactivated" is decided (DEFAULT)

From `AdminActionLog`, the more recent of:
- a `report.actioned` row with notes `room_deactivated` whose target is a report about this room (a `Report` with `targetType: 'banter_room'`, `targetId` = the room), or
- a `banter_room.reactivated` row for the room.

Latest is a deactivation: staff may reactivate. Latest is a reactivation, or there is none: 409 `banter_room_not_staff_deactivated`. The check is repeated inside the transaction under a per-room advisory lock (`pg_advisory_xact_lock`), so two staff members pressing at once give one 200 and one 409.

## Defaults — all founder-veto-able, none stated by the founder

- **Only staff-deactivated rooms.** A room the creator switched off is a 409 (the creator, if alive, reactivates it; if the creator is gone, staff cannot — see limits).
- **Staff deactivated, then a living creator reactivated, then the creator deactivated again:** the creator's toggles are not audited, so the latest AUDITED event is still the staff deactivation and staff CAN reactivate that room. This is a disclosed limit, accepted for now. (If staff reactivated and the creator then switched it off: 409, because the latest audited event is the reactivation.)
- **Same roles as `room_deactivated`:** moderator and superadmin.
- **Vetting gate:** if the report that deactivated the room was `concernsMinor` (in practice the `child_safety_concern` category, #466), `ModerationService.assertVettedToActOn` applies with that report (the latest deactivating report, not another report on the same room). It runs after the two 409s because it depends on the deactivating report.
- **Note:** optional, at most 500 characters (the length other admin notes use), trimmed; blank counts as none.
- **Audit:** `banter_room.reactivated`, target the room, admin id, notes `report=<reportId>` or `report=<reportId>; note=<note>`. Written in the same transaction as the status change.
- **No notification.** No `Notification` row. The guardian-security-notice registry has a `room_deactivated` safety event but NO reactivation event, so nothing is sent to any guardian; adding one would be a decision and wording. A room report that notifies the anonymised creator's account is unchanged (accepted).
- Unknown room 404; already active 409.

## Limits (disclosed)

1. The creator's own toggles are unaudited (above).
2. A report is deleted by the retention sweep (6 or 7 years after it closes). The audit row is tied to the room only through the Report row, so once that report is gone staff can no longer reactivate that room.
3. A room staff deactivated, whose creator is alive and active, can be reactivated by either the creator or staff.

## Tests

- Unit: `banter.service.spec.ts` (creator guard: each control x deleted / suspended / deactivated / pending_deletion, dangling creator same response as a non-creator, no user lookup for a non-creator, active creator passes), `banter-room-reactivation.service.spec.ts`, `admin-banter-rooms.controller.http.spec.ts`, three new `getOne` tests in `admin-moderation.controller.http.spec.ts`; four other moderation controller specs only gained the new provider.
- e2e (real Postgres): new `test/room-staff-reactivation.e2e-spec.ts` (happy path with audit row and no notification, superadmin, creator-deactivated 409, staff/staff/creator sequence 409, editor 403, user token 401, already active 409, unknown 404 and validation 400s, simultaneous presses, vetted / unvetted on a `child_safety_concern` report, report-detail `reportedRoom`, creator guard for anonymised-style statuses and a dangling creator, living creator unaffected). `test/room-with-purged-creator.e2e-spec.ts` updated: the former "FINDING PROBE" now asserts a token minted after anonymisation is REFUSED (403) and the room stays active; the "stays inactive" test now ends with staff reactivating the room.

Results are in the "Verification" section below.

## Not built

Admin room screen; ownership transfer; a member-moderator role; any change to who may create or join; any change to room-report notification; a guardian notice or notification for reactivation; copy.

## Not run

The full API unit and e2e suites, Playwright, `apps/web`, CI. Nothing against a real environment.

## Verification

Measured on scratch Postgres database `soccernity_test_roomreact` and Redis DB 15 (own, so no collision with other sessions; Postgres/Redis are the shared docker containers).
- `tsc --noEmit`, `eslint` (banter, moderation, admin-action-log) and `nest build`: clean.
- Unit, `src/modules/banter`, `src/modules/moderation`, `src/modules/admin-action-log`, `src/write-route-guards.spec.ts`: 30 suites / 792 tests, 0 failures. (Before-figures on a clean `origin/main` were not measured.)
- `apps/admin` `src/api/actionLogKinds.test.ts`: 5 / 5 (its first run errored at start-up under machine load with no tests collected; rerun passed).
- e2e `test/room-staff-reactivation.e2e-spec.ts` (new): 18 tests, 0 failures.
- e2e `test/room-with-purged-creator.e2e-spec.ts` (updated): 13 tests, 0 failures when run alone. In the first combined run this file failed with `Can't reach database server at localhost:5432` (a transient database outage mid-run, not an assertion); the container was healthy afterwards and the rerun passed.

Not run: the full API unit and e2e suites, other e2e files, Playwright, `apps/web`, CI.
