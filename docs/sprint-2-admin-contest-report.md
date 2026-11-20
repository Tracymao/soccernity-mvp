# Sprint 2 — apps/admin PR 9: Contest admin screens (disclosed stubs)

**Branch:** `sprint-2/admin-contest` — stacks on PR 8 (`sprint-2/admin-competitions-stub`, #199).
**Figma:** 9 screens — `2363:2244`, `2363:3446`, `5403:6640`, `5403:6753`, `5403:6866`, `5403:6979`, `5403:7092`, `5405:8277`, `5405:8390`.

## The backend situation (Decision Log #239)

Verified against `services/api/src/modules/contest/` (`sprint-2/contest-data-model-backend`, Decision Log #218/#219):

1. **The Figma screens model a "task"** (Task Name / Hashtag / Description / Target Entry Count). **There is no "task" entity.** The backend models a `ContestCycle` with weekly `ContestRound`s.
2. **4 real `AdminJwtAuthGuard`-protected write endpoints exist** — `POST /admin/contest/cycles`, `.../rounds/:week/results`, `.../final/open`, `.../crown` — but they need entity ids (`entryId` / `userId`) the admin cannot discover, because **there is no admin read endpoint** (`GET /contest/current` / `GET /contest/cycles/:id` are user-JWT only).
3. **None of the 4 real endpoints has a Figma screen.**

**`Create cycle` alone was deliberately not wired** — `createCycle` rejects when an active cycle exists and there is no follow-up UI (no judge / final / crown screen, no read), so exposing it would strand the admin mid-workflow — worse than not exposing it.

A working Contest admin console needs a coordinated pass: `GET /admin/contest/*` read endpoint (backend-api) + Figma screens for the real cycle/round/judge/final/crown workflow (figma-screen-builder) + code (figma-to-code). Tracked as Decision Log #239.

## What this PR ships

All 9 screens as disclosed stubs — the shared `ContestBackendNote` banner on every one:

| Route | Screen |
|---|---|
| `/contest` | Contest Tasks — tabbed (Contest Tasks / Scheduled / Empty state), sample table, Create Task link |
| `/contest/tasks/new` | Create Task — 4 task fields, disabled |
| `/contest/tasks/edit` | Edit Task — prefilled sample, disabled |
| `/contest/tasks/schedule` | Schedule Task — disabled date fields |
| `/contest/tasks/search` | Search Task — disabled search + sample results |
| `/contest/tasks/delete` | Delete Task — confirm, disabled |
| `/contest/tasks/scheduled` | Task Scheduled (success) — for design fidelity |

## Verification

- apps/admin vitest — **15 files / 52 tests, 0 failures** (`contest.test.tsx` +3)
- `npx tsc --noEmit`, `npm run lint`, `npm run build` — clean

**Decision Log #239 (Open — flagged).** Not merged — founder's call. Next: PR 10 `sprint-2/admin-settings-roles-stub` (final).
