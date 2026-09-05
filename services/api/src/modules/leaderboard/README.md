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
5. **Exclude non-active accounts from the ranking** (Decision Log #221,
   `sprint-2/account-deactivation-backend`). Decision Log #221 makes an
   inactive account's content disappear from every read surface that
   *does* exist today (feed, single post, club roster, follower/following
   lists). The Leaderboard is the one named "an inactive account should
   not appear" surface that has no code yet — so the requirement is
   parked here: whatever aggregation this module builds
   (`SUM(PointsLedgerEntry.points)` per user, or the `LeaderboardEntry`
   recompute job) must filter its user set to `User.accountStatus =
   'active'`. `PointsLedgerEntry` rows keep accruing for a deactivated
   user (deactivation removes nothing) and stay correct on reactivation —
   so this is a filter on the *read/rollup*, not a change to how the
   ledger is written. A minor absent from the data because they're
   restricted-pending (Decision Log #45) is a separate, already-recorded
   exclusion.
