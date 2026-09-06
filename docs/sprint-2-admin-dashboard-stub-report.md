# Sprint 2 — apps/admin PR 4: Dashboard (disclosed stub)

**Branch:** `sprint-2/admin-dashboard-stub` — stacks on PR 3 (`sprint-2/admin-moderation-stub`, #194). Merge order after #192/#193 (merged): #194 → this.
**Figma:** `110:5` (Dashboard).

## Why a stub

No `GET /admin/dashboard/stats` endpoint exists (Build Plan Section 4.8 spec's it; not built).

## What this PR ships

`/dashboard` renders the real Dashboard layout with no real data:

- **4 stat cards** — New Users / Total Visits / Total Articles / Community Users. Values render as `—`.
- **New users by league** breakdown (Premier League / La Liga / NPFL / Europa / Bundesliga), captioned "Sample".
- **Visitor statistics** — a plain CSS bar sketch (Jan–May axis) captioned *"Sample — chart not wired to data"*. **Not a real chart library** — the shape only, so the layout is legible; the real screen's PR wires a chart to `GET /admin/dashboard/stats`.
- **Latest posts** table (Date / Title / Category, sample rows).

Dashed disclosure banner names the missing endpoint. `routes.test.tsx`'s generic placeholder assertion moved from `/dashboard` to `/settings` (still a placeholder until PR 10).

## Verification

- apps/admin vitest — **10 files / 39 tests, 0 failures** (`DashboardPage.test.tsx` +1)
- `npx tsc --noEmit`, `npm run lint`, `npm run build` — clean

**Decision Log #234.** Not merged — founder's call. Next: PR 5 `sprint-2/admin-articles-categories-stub`.
