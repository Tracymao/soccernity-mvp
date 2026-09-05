# points

Build target: **sprint-2/contest-data-model-backend** — Decision Log #219
(the scoring weights the founder delegated to backend-api in Decision Log
#130). No Build Plan Section 4 endpoints of its own.

## What this is

The **write primitive** for the append-only `PointsLedgerEntry` table
(`schema.prisma`), plus the documented scoring constants. It is *not* the
Leaderboard — the aggregation (`SUM(points)` over a window, per
represented club), the `GET /leaderboard` endpoint (Build Plan Section
4.9), and the scheduled `LeaderboardEntry` rollup are **all Sprint 6** and
not built here.

- `points.constants.ts` — `ENGAGEMENT_POINTS` (post 3 / like 1 / follow
  1), `CONTEST_WEEKLY_WIN_POINTS` (50 / 30 / 20), `CONTEST_MONTHLY_CROWN_POINTS`
  (250 / 150 / 100), and the `PointsSource` union. See Decision Log #219
  for the full rationale — the short version: baseline engagement rewards
  *actions a user takes* (not popularity received), at small absolute
  values, so the board stays a measure of participation rather than a
  follower-count race; contest results dominate volume by a wide margin
  (a crown ≈ 83 posts).
- `points.util.ts` — `awardPoints(tx, { userId, source, refId, points,
  clubId?, occurredAt? })`. Idempotent (swallows `P2002` from the ledger's
  `@@unique([source, refId, userId])`), always called inside a
  `$transaction` so the ledger row lands atomically with the thing it
  pays for.

## Why a plain function, not a NestJS module

`awardPoints` is imported directly by `FeedService` (post create, like),
`UsersService` (follow), and `ContestService` (weekly wins, crown). A
shared *provider* would force `FeedModule` / `UsersModule` to import a
`PointsModule` for a one-line write. This is the exact precedent the
notification wiring already set — `tx.notification.create(...)` is written
directly inside those same services' transaction callbacks, with no
`NotificationService` — and the same shape as `cursor.util.ts` (a shared
stateless util, not a provider).

## Idempotency and revocation — deliberate

- **Engagement points are awarded once per distinct event and never
  revoked.** Like → unlike → re-like the same post earns **1** point
  total (the re-like's `Like` row succeeds, reaches `awardPoints`, and
  hits the ledger `@@unique` → no-op). Same for follow → unfollow →
  re-follow. A user who likes 100 distinct posts earns 100 — they did
  engage with 100 posts.
- **Re-running contest round judging cannot double-pay** — the ledger
  `@@unique([source, refId, userId])` is the backstop
  (`refId` = round id for a weekly win, cycle id for a crown), on top of
  `ContestService` refusing to re-judge an already-judged round.

## Flagged follow-ups (not built here)

- **Per-day engagement cap / anti-spam.** Like/follow points are the
  obvious spam vector; only the "once per distinct target" rule blunts it
  today. The Sprint 6 Leaderboard aggregation is the natural place to cap
  engagement contribution at read time.
- **`PointsLedgerEntry.clubId`** is always `null` today — the
  represented-club field/endpoint doesn't exist (Decision Log #74/#128).
  When it lands, the award sites should snapshot it so a historical
  per-club Leaderboard can filter on it.
- **`competition_result`** is a reserved `PointsSource` value with no
  writer — Decision Log #73's Competition umbrella (Prediction /
  Commentary) is still Build Plan Section 2.2-deferred.
