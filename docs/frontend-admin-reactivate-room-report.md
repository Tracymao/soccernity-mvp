# Admin: Reactivate Room (frontend/admin-reactivate-room)

Date: 2026-11-15. Scope: `apps/admin` only (plus one Playwright spec and four screenshots). Follows R81 (`backend/room-staff-reactivation`, PR #795; Decision Log #515). No backend, Figma, register, docx, creator-facing app or other-action change.

## What changed

**`apps/admin/src/api/moderation.ts`**
- `Report` gains `reportedRoom?: ReportedRoom | null`, where `ReportedRoom = { id, status: "active" | "inactive", staffMayReactivate }`. These are the fields R81 returns on `GET /admin/moderation/reports/:id` for a `banter_room` report. `staffMayReactivate` is computed by the server for the calling admin; the page decides nothing itself.
- `reactivateRoom(roomId)` calls `POST /admin/banter-rooms/:id/reactivate` (explicit `method: "POST"`, no body) and returns `{ id, status: "active" }`.
- The two stable codes `banter_room_already_active` and `banter_room_not_staff_deactivated`.

**`apps/admin/src/pages/moderation/ReportedRoomCard.tsx` (new)**
- A "Bants room" card on the report detail with a Room status pill (Active outline, Inactive strong).
- "Reactivate Room" button only when the server says `staffMayReactivate` and the page is not in the vetting-restricted state.
- Refusals, told apart by the server's `code`, never by its message text:

| Answer | Shown |
| --- | --- |
| 409 `banter_room_already_active` | "This room is already active." Room shown Active, button gone |
| 409 `banter_room_not_staff_deactivated` | "This room wasn’t deactivated by staff, so staff can’t reactivate it." Room stays Inactive, button gone |
| 403 `child_safety_vetting_required` | the existing restricted notice (`VettingRestrictedNotice`), no button |
| any other 403 (role refused) | "Your role can’t reactivate a room." Button stays |
| anything else | "Couldn’t reactivate the room. Please try again." Button stays, works again |

- Success: the room reads Active, the line "Room reactivated." appears, the button goes, the page stays where it is.
- `reportedRoom: null` (room deleted) shows "This room no longer exists." and nothing else. An older server with no field draws no card at all.

**`apps/admin/src/pages/moderation/ReportDetailPage.tsx`**
- Renders the card for `banter_room` reports.
- A report handed over from the queue has no `reportedRoom`, so the page now also waits for the single-report read for room reports and merges the field in (the same pattern the message context uses). A failed read leaves no card, never a wrong "no longer exists".
- A successful reactivation updates the local `reportedRoom`.

## DEFAULT wording and behaviour (founder-veto-able)

There is **no Figma frame** for this action. It reuses the existing Deactivate Room control style; no screen was drawn and no admin room list was added.

1. **The brief says "same confirmation and optional note as Deactivate Room", but Deactivate Room has neither** (it is a plain button that acts at once, with no note field). So Reactivate Room mirrors it exactly: a plain button, no confirmation step, no note field. The API accepts an optional `note` (up to 500 characters); this page does not send one. Adding a confirmation or a note is a small follow-up if wanted.
2. The one label is "Reactivate Room". The other strings are the card heading "Bants room", "Room status", the two pill words, and the five lines in the table above plus "Room reactivated.". None carries a legal or safety promise, so none is tagged `[COPY PENDING LEGAL REVIEW]` and `docs/pending-copy-manifest.md` is unchanged.
3. "The audit entry" is read as the existing audit-log row `banter_room.reactivated` (already labelled on the Audit log / My activity screen). The detail page itself shows the room status and "Room reactivated.", not an audit row; the Playwright spec checks the row in Postgres.
4. The card sits in its own card, not inside "Take action", so it also works on an already-actioned report and leaves Deactivate Room untouched.

## Tests

| Run | Result |
| --- | --- |
| `apps/admin` `tsc --noEmit` | clean |
| `eslint` on `src/pages/moderation` and `src/api/moderation.ts` | clean |
| `apps/admin` `npm run build` | clean |
| `apps/admin` vitest (whole workspace, `--maxWorkers=3`) | 61 files / 965 tests, 0 failures |
| new `roomReactivation.test.tsx` | 16 tests (visibility rules, button press, every refusal by code) |
| Playwright, ONLY spec 64 and spec 53 (`53-b304-suspend-from-report-and-user`), real Chrome, real API, Postgres, Redis | **10 passed / 0 failed** (spec 53: 5, spec 64: 5), 1.7 min |

Spec 64 (`e2e/tests/64-room-reactivation.spec.ts`), moderators created in Postgres and used through a locally signed token (as spec 53 does):
1. A moderator deactivates a room from its report (room is `inactive` in Postgres), and the same report then shows Inactive and Reactivate Room.
2. Reactivate Room: the card reads Active and "Room reactivated.", the URL stays, the room is `active` in Postgres, exactly one `banter_room.reactivated` audit row by that moderator, and a reload still shows Active with no button.
3. A member reads the room as active through the API and can post in it.
4. A room the creator deactivated shows Inactive and no button, and a direct API call is a 409 `banter_room_not_staff_deactivated` with the room unchanged.
5. A stale page: another moderator reactivates first; pressing the button reads "This room is already active.", the room stays active, and only one audit row exists.

Machine state at the start: ports 3100, 5273, 5274, 3191, 3192 free, no node process, no run-lock file. No other agent or run was using the machine. After the run no node process was left. The run did not rewrite any tracked screenshot under `docs/`; the four new screenshots are in `docs/admin-reactivate-room-screens/` and were checked by eye (03 and 04 were not individually opened).

## Not run

- The rest of the Playwright suite (the QA reviewer runs it at the launch gate), the `apps/web` and `services/api` suites (untouched), CI (cannot be read from here), any real-browser check beyond the Playwright run, a Playwright case for the vetting 403 or the role 403 (unit tests only; the QA database has no suitable admin for the vetting case).
- The role 403 path (an editor, which the API refuses) is covered by a unit test only.
