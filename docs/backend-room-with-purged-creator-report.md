# A Bants room continues after its creator is anonymised or gone: e2e proof and findings

Branch `backend/room-with-purged-creator-test`, cut from `origin/main` `a31dec6`. Test only: **no application code was changed** (no test proved a defect).
Founder decision (2026-11-14, to be recorded by R80): a Bants room continues after its creator is anonymised or purged. Staff moderate it, the creator's own controls lapse, there is no ownership transfer.

New spec: `services/api/test/room-with-purged-creator.e2e-spec.ts` (13 tests, real Postgres via the real `AppModule`, real `AccountDeletionSweepService` and `AnonymizedRowPurgeService`).
Scratch database `soccernity_test_roompurge`, Redis DB 14 (own worktree `soccernity-roompurge`; the root `.env`/`.env.test` there are gitignored copies).

## Handshake

- `git fetch origin`; `origin/main` = `a31dec6`; the branch is at that commit.
- `gh pr list --state open`: no open PR touches `services/api/src/modules/banter/` or `.../moderation/`.

## The most important finding: "purged" cannot happen while the room exists

`AnonymizedRowPurgeService` classifies `BanterRoom.createdBy` as **content** in `anonymized-row-purge.references.ts` (also `Post.author`, and anything else the person left). So a creator who made a room is **never hard-deleted by the sweep**: the row stays anonymised (`accountStatus: 'deleted'`, name `[deleted user]`, email and username cleared) for as long as the room exists. The decision's "anonymised or purged" is therefore, in the real product, always the **anonymised** state.

`BanterRoom.createdBy` is a bare string with no foreign key, so a dangling creator id is still *possible* (a manual `DELETE`, a future rule change). The spec covers both: the real anonymised state through the real sweep, and a **SIMULATED** dangling state (the `User` row deleted directly in SQL). The dangling state is a simulation, not something the product can reach today. Say so if you cite it.

## Tests and what each proves

### Anonymised creator (real sweep: `startPendingDeletion`, 30 days later `sweepPendingDeletions`)

1. **The room stays visible and usable.** Still in `GET /banter-rooms`, `/search`, `?tagQuery=` (topic hit; the old username matches nothing), `/mine`, by id (`memberCount` 3 to 2 because the sweep removes the creator's membership), and its feed. The creator's old post shows `[deleted user]`. No response contains the creator's email, real name or username. Members keep posting, commenting, leaving and rejoining (no 500, no join error).
2. **The creator's controls lapse.** The creator's pre-deletion token is 401 on `PATCH status` and `POST topics` (the sweep revoked every session). Every other member gets 403 on status, attach and detach. The room stays `active` with its topic.
3. **FINDING PROBE.** A token issued after anonymisation (minted directly, after a 1.1 s wait for the whole-second B-305 marker) still gets **200** on `PATCH /banter-rooms/:id/status`. See finding 1.
4. **The purge keeps the creator row.** (a) A creator who posted: kept (first blocker is their own post). (b) A creator who never posted: kept with blocker `BanterRoom.createdBy`. The room row is untouched in both.
5. **Name, description and topic are unchanged** by the anonymisation and by a purge run; `createdBy` still equals the anonymised id.

### Moderation of such a room

6. **A member reports the room** (`POST /reports`, `banter_room`, `spam_or_scam`): accepted. A moderator (not child-safety vetted) opens it and records `room_deactivated`: the report is `actioned`, the `AdminActionLog` row's notes contain `room_deactivated`, the room becomes `inactive` and is still listed, readable and postable (nothing but the status dot reads the status).
7. **An inactive room whose creator is gone stays inactive.** A member's `PATCH status` is 403, an admin access token on the user route is 401, the reporter's appeal is 403. **No path exists today for anyone to reactivate it** (see finding 3); none was added.
8. **FINDING:** the report notifies the anonymised creator's account (1 `moderation_decision` row). See finding 2.
9. **`child_safety_concern`** on a room report sets `concernsMinor`: an unvetted moderator is refused (403) and the room stays active; a vetted moderator can act and the room goes inactive.
10. **Name and description survive the report** (a report needs neither removed).
11. **`resolveReportedUserId`** returns the creator id while the anonymised row exists.

### Dangling creator (SIMULATED: `User` row deleted outright)

12. The room is still in the list, search, `tagQuery`, by id and My Bants; no 500 and no join error; members keep reading and posting.
13. Creator controls are refused for every member. `resolveReportedUserId` is **`null`** without error. A report is accepted and a vetted-or-not moderator can action it; **only the reporter** is notified (1 `moderation_decision`); the appeal is refused (403); a member cannot reactivate; the room stays inactive.

## Findings (things that do not fully match, or are worth deciding)

1. **The creator's controls lapse only because the account's sessions are dead, not because any code checks the creator.** The creator checks compare `BanterRoom.createdBy` to the token subject and nothing reads `accountStatus` (`JwtAuthGuard` does not). A token for the anonymised id would work (probe: 200). A real person cannot obtain one (login refuses a `deleted` account, all sessions are revoked, and the user is anonymised), so the decision holds in practice, but it holds by side effect. If the founder wants it enforced, a creator check against an active account is a small change; not made here (brief: no new behaviour).
2. **A report on the room notifies the anonymised creator's account.** For a creator whose row still exists, `resolveReportedUserId` returns their id, so the outcome of the report writes a `moderation_decision` notification to an account nobody can read (it is also the id that would be the "reported user" for an appeal, which nobody can file). Harmless, but it is a row for a dead account; the dangling case notifies nobody.
3. **No reactivation route exists for staff.** `room_deactivated` is one-way for staff; only the creator can set a room back to `active` (`PATCH status`). With the creator gone, **an inactive room stays inactive forever**. The brief said not to add a path. If the founder wants one, it is a design decision (a moderator reactivation action).
4. **`createdBy` stays as an opaque id** of the anonymised account in every room read (`createdBy` is on the room payload).
5. **Name and description are never removed** and no retention rule applies to them (already recorded under the B-042/B-117 description PR). A room's name and description therefore outlive its creator's account, which is what the decision says; any counsel question about free text left by an anonymised person stays with counsel.
6. **No ownership transfer and no way to rename a room** exist; nothing changed.

## Verification (measured)

- New spec, real Postgres (own database, `--runInBand`): **13 tests, 0 failures** (final run 942 s; the machine was heavily loaded by other sessions, individual tests took 20 to 200 s, mostly `resetDatabase()` TRUNCATE time; the `beforeEach` hook has a 300 s timeout and the run used `--testTimeout=300000`). Two earlier runs failed on test-side problems only: two `beforeEach` timeouts at 120 s, and one assertion that expected the blocker `BanterRoom.createdBy` for a creator who had also posted (the first blocker found is `Post.author`; the test now checks both cases).
- Neighbouring unit specs (`src/modules/banter` + `src/modules/moderation`): **23 suites / 649 tests, 0 failures**.
- `tsc --noEmit` (`services/api`): clean. `eslint` on `src/modules/banter` and `src/modules/moderation`: clean (the spec file lives under `test/`, which `npm run lint` does not cover).
- **Not run:** the full API mocked suite, the full e2e suite, other e2e files, Playwright, `apps/*`, CI (not readable from here). No before-figures were taken (no existing test changed).
