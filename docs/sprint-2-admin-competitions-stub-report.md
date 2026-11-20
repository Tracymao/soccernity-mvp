# Sprint 2 — apps/admin PR 8: Competitions (disclosed stubs)

**Branch:** `sprint-2/admin-competitions-stub` — stacks on PR 7 (`sprint-2/admin-media-stub`, #198).
**Figma:** `5566:8033` (Create Competition), `5569:7813` (Competition Created / Success).

## Why stubs

There is **no competitions admin endpoint anywhere**. The Competition umbrella (admin-created Prediction / Commentary types, votes) is deliberately parked — Build Plan Section 2.2 defers it, Decision Log #72/#73. `sprint-2/contest-data-model-backend` built the **Contest** half only; `PointsLedgerEntry.source` reserves `competition_result` for this.

## What this PR ships

| Screen | Route |
|---|---|
| Create Competition | `/competitions` — every field (name / type / scoring / custom method / entry brief / entry window / entries-per-player / visibility) **disabled** |
| Competition Created | `/competitions/created` — the success layout, with an explicit note that it isn't reachable from a real flow |

Dashed banners state the umbrella is parked.

## Verification

- apps/admin vitest — **14 files / 49 tests, 0 failures** (`competitions.test.tsx` +2)
- `npx tsc --noEmit`, `npm run lint`, `npm run build` — clean

**Decision Log #238.** Not merged — founder's call. Next: PR 9 `sprint-2/admin-contest` (partial backend).
