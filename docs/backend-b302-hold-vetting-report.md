# B-302: the child-safety vetting rule on the three hold routes

Branch `backend/b302-vetting-on-hold-routes`. Decision Log #498 and #499 (founder, 2026-11-12), register row B-302 and Section 89. `services/api` only. No schema change, no migration, no new environment variable, no wording.

## What changed

`ModerationHoldsService` (`services/api/src/modules/moderation/moderation-holds.service.ts`) now gates its three routes with `ModerationService.assertVettedToActOn` (B-297) instead of its own check on `Report.concernsMinor` alone:

| Route | Method | Gate input |
| --- | --- | --- |
| `POST /admin/moderation/reports/:id/holds/bad-faith` | `placeBadFaith` | the report's `concernsMinor`, `targetType`, `targetId` |
| `POST /admin/moderation/reports/:id/holds/legal` | `placeLegal` | the same |
| `PATCH /admin/moderation/holds/:holdId/lift` | `lift` | the same, read through the hold's report |

- **Rule (unchanged from B-297):** a `concernsMinor` report needs a vetted admin; a `message` report needs one when the sender or any participant of the conversation is under 18 (fail closed: a missing message row, or a participant with no `User` row, counts as a minor); any other report is not checked. A vetted admin is never blocked and the thread is not looked up for them.
- **Order, unchanged:** 404 for a missing report or hold first, then the coded 403 `child_safety_vetting_required` (message `This action requires a child-safety-vetted admin.`), then the hold rules. The 403 comes before anything is written: no `AccountHold` row is created or lifted and no `AdminActionLog` row is written.
- **Lift with no report (Decision Log #499):** a hold whose `reportId` is NULL (its report was purged) has nothing to vet against, so the check is skipped and any moderator may lift it, as before.
- **Implementation:** `ModerationHoldsService` takes `ModerationService` in its constructor. No circular dependency: `ModerationService` never references the holds service, and both are in `ModerationModule` (checked by reading both and by Nest booting the full `AppModule` in the e2e run). `loadReportForGate` and the lift query now also select `targetType` and `targetId`. The private `assertVettedForMinorReport` is removed (nothing else used it; the `isAdminChildSafetyVetted` and `CHILD_SAFETY_VETTING_REQUIRED_CODE` imports went with it).
- **Not changed (as instructed):** `getReportById` and `listActiveHoldsForReport` (viewing stays on the `concernsMinor`-only gate, #486); the four routes already gated by #491.

## Behaviour to know about (tell the founder)

The Report detail response (`GET /admin/moderation/reports/:id`) still lists a child-involved message report's active holds to an unvetted admin, because viewing is unchanged. The Lift control there will now be refused with the restricted answer if an unvetted admin presses it. The `apps/admin` hold dialogs already turn a `child_safety_vetting_required` 403 into the restricted notice (`onRestricted`), so nothing broke, but the control is still shown. Hiding it for that case would be an `apps/admin` change and was not asked for. Nothing else behaves differently from what the task described.

## Tests

- `moderation-holds.service.spec.ts`: the gate is called with the report fields after the 404 and before any hold is touched, for all three methods; a refusal is passed on and nothing is placed or lifted; a missing report or hold is a 404 and the gate is never asked; a lift with no report skips the gate.
- `admin-moderation-holds.controller.http.spec.ts` (real controller, real `AdminRolesGuard`, real `ModerationHoldsService` and `HoldService`, and a real `ModerationService` for `assertVettedToActOn` over a fake Prisma): for each of the three routes, an unvetted admin with a minor sender is 403 and nothing written; only the other participant a minor is 403; adults only is allowed; a vetted admin is allowed and the thread is not looked up; a missing message row is 403; a participant with no `User` row is 403; a non-message report that is not `concernsMinor` is unchanged; plus `concernsMinor` message report, 404 before the gate, and a purged-report lift.
- `test/b297-vetting-to-act-on-child-message-reports.e2e-spec.ts` (extended, as #730 already owned the e2e for this rule): real Postgres, 10 new tests covering the same matrix on the real routes, with row counts of `AccountHold` (total and lifted) and `AdminActionLog` compared before and after every refusal.

## What was run

Run in a separate worktree (`D:\Projects\soccernity-b302`), against a private database (`soccernity_test_b302`) for every e2e run.

| Check | Result |
| --- | --- |
| `tsc --noEmit` | clean |
| `eslint src/modules/moderation` | clean |
| `nest build` | clean |
| Mocked suite, before (clean `origin/main`, `jest --maxWorkers=4`) | 319 suites passed (1 skipped), 6,230 tests passed (8 skipped), 0 failures |
| Mocked suite, after | 319 suites passed (1 skipped), 6,265 tests passed (8 skipped), 0 failures (+35 tests, no new suite) |
| New e2e (`b297-vetting-to-act-on-child-message-reports.e2e-spec.ts`, extended) | 13 passed (3 from #730 + 10 new), 0 failures |
| Neighbouring e2e (`moderation`, `moderation-holds`, `account-hold`, `message-report`, `message-report-context`, `content-removal`, `report-retention`, `admin-search`, `b291-suspension-on-report`, `b292-staff-recorded-appeal`) | 10 suites / 172 tests passed, 0 failures |

**Not run:** the other e2e suites, the `apps/admin` and `apps/web` suites, Playwright, any real-browser check, CI.

**Process note:** the shared checkout was switched to another session's branch while I worked, so my first edit briefly sat on `frontend/b303-audit-log-action-labels`. I moved it to this worktree and reverted only my file there; the other session's uncommitted files were left as found and are not in this PR. One heredoc quoting error and one Windows-codec read of the README (fixed by forcing UTF-8) cost a retry each; nothing was written wrongly.

**Open for the founder:** none new. The one thing worth knowing is the Report detail response behaviour described above.
