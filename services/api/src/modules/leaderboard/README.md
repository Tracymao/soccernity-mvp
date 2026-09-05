# leaderboard module

Build target: Sprint 6 — Section 4.9 of the MVP Build Plan
(`GET /leaderboard?period=`).

**Not yet implemented** — placeholder so the sprint owner is visible in
the file tree.

## What already exists as of sprint-2/contest-data-model-backend

The **inputs** to this module are now real, even though the module itself
isn't:

- **`PointsLedgerEntry`** (`schema.prisma`, `../points/`) — the
  append-only ledger of every point-earning event. Decision Log #219
  fixed the weights. Written today by `FeedService` (post / like),
  `UsersService` (follow) and `ContestService` (weekly wins, monthly
  crown).
- **`LeaderboardEntry`** (Section 3's own model) — the *materialised*
  rollup this module's `GET /leaderboard` will serve. Still empty;
  nothing writes it yet.

## What Sprint 6 still has to build here

1. The aggregation: `SUM(PointsLedgerEntry.points)` for a user over a time
   window (`occurredAt`), and — per Decision Log #128 — filtered to the
   user's **represented club** (a field/endpoint that does **not exist
   yet**; `PointsLedgerEntry.clubId` is the forward-compatible column,
   currently always `null`).
2. `GET /leaderboard?period=` — `JwtAuthGuard`-only (Decision Log #129:
   the Leaderboard requires login, no logged-out view).
3. The scheduled job that recomputes `LeaderboardEntry` (rank + points per
   `period`) from the ledger.
4. A place to apply anti-gaming caps on engagement contribution (see
   `../points/README.md`'s flagged follow-up).
