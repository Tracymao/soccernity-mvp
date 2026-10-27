# points

Build targets: **sprint-2/contest-data-model-backend** (the ledger primitive, Decision Log #219) and
**backend/w12-points** (B-093, the leaderboard points engine: Decision Log #382, #383, #384, #385;
`docs/contest-spec.md` sections 9a to 9e and 13). No Build Plan Section 4 endpoints of its own.

## What this is

The **write side** of the append-only `PointsLedgerEntry` table. It is not the Leaderboard: the
aggregation, `GET /leaderboard` and the scheduled `LeaderboardEntry` rollup live in `modules/leaderboard`.

### Units

Points are stored in **quarter-point units** (1 point = 4 units) in `PointsLedgerEntry.quarterPoints` and
`LeaderboardEntry.quarterPoints`. A creator's 0.25 is exactly 1 unit, so every stored number is an integer.
They are **displayed rounded to the nearest whole point, a half rounding up** (`quarter-points.util.ts`:
`quartersToDisplayPoints`) and **ranked on the exact stored value**, so rounding never creates a false tie.

### Baseline engagement (spec 9b), `engagement-points.util.ts`

Everyday views, likes and comments, outside any contest.

| Rule | Behaviour |
|---|---|
| Giver | 1 point (4 units) per qualifying view / like / comment per unique post. Source `engagement_<kind>_given`, `refId` = the post id |
| Creator | 0.25 point (1 unit) per qualifying view / like / comment per unique **account** per post. Source `engagement_<kind>_received`, `refId` = `<postId>:<giverId>`, `counterpartId` = the giver |
| Self-engagement | Exempt. A creator engaging with their own post earns nothing |
| Who may earn | The test the contest uses (`CONTEST_ELIGIBLE_USER`): active account, **verified email**, adult or a minor whose guardian has confirmed consent. Evaluated when the point is awarded, not remembered. An ineligible **giver** earns nothing and earns the creator nothing (the engagement does not count); an ineligible **creator** earns nothing but the giver still does |
| Daily caps | **40 points a day for giving, 20 for receiving**, per Europe/London calendar day, in configuration (`POINTS_DAILY_CAP_GIVEN`, `POINTS_DAILY_CAP_RECEIVED`, whole points; `points-config.service.ts`; a bad value falls back to the default, never to "no cap"). The two directions are independent. A capped engagement leaves **no row and is not queued** |
| Revocation | An unlike, the last visible comment of an account removed or hidden, a removed post, or an account later restricted marks the rows `revokedAt`. A revoked row counts for nothing, **including the cap**, so revoking frees that day's cap |
| Restored | Re-liking, or unhiding the comment, brings the revoked rows back (re-dated to now, subject to the cap): the engagement earns its point **once** |
| Comments | One comment point per account per post however many comments ("ten comments = 1"). The content-screening condition is the existing `commentCountsForContest` seam (always true: no comment screening exists), the one place to call real screening |
| Follows, posts | **Earn nothing** (B-094). There is no engagement kind for them |
| Contest entries | A like on a contest entry still earns the ordinary baseline points; the contest tally is a separate record (`ContestEngagement`) and the 0.25 rule never touches it |

The cap read-then-write is serialised by a transaction-scoped Postgres advisory lock per (side, account,
London day), taken in sorted order so two transactions can never wait on each other in a cycle.

`awardEngagementPoints`, `revokeEngagementPoints`, `revokeEngagementPointsForPost` and
`revokeEngagementPointsForAccount` are plain functions that take a transaction client, called from
`FeedService` (like, unlike, comment, delete comment, hide / unhide, delete post) and from
`ViewQualificationService` (a qualified view). The two "account later restricted" callers are
`GuardianConsentService.refuseConsentAndScheduleDeletion` (a withdrawn or declined consent) and
`AdminUsersService.updateUserStatus` (suspension). A restriction is **not** undone automatically when it
lifts: engagement simply earns again from then on.

### Placement points (spec 9d), `points.util.ts`

`awardPoints(tx, { userId, source, refId, quarterPoints, ... })` writes ONE one-off row; used by
`ContestLifecycleService` for the weekly prizes (at the 20:00 vote lock) and the monthly prize (at the crown).
The figures are the admin's, stored per contest on `ContestCycle` (`weeklyPoints1..3`, `monthlyPoints1..3`,
defaults 500 / 300 / 150 and 2,000 / 1,200 / 600 in whole points) and converted with `pointsToQuarters`.
Forfeited weeks and "No winner this month" award nothing. Idempotent: `@@unique([source, refId, userId])`
with `createMany({ skipDuplicates: true })` (a failed insert inside a transaction would otherwise abort it).
Prizes are never capped and never touched by a revocation.

### Files

- `points.constants.ts`: units, per-engagement amounts, the default caps, the closed set of `PointsSource`.
- `quarter-points.util.ts`: `pointsToQuarters`, `quartersToDisplayPoints`.
- `points-config.service.ts` + `points.module.ts`: the injectable caps.
- `engagement-points.util.ts`: the engine.
- `points.util.ts`: the one-off placement write.

## Why plain functions, not a service

Every award lands in the same transaction as the thing it pays for (the `Like`, the `Comment`, the
`ContestRoundWinner` rows). A shared provider would force `FeedModule` to import a heavyweight module for a
write; the notification wiring set the same precedent. Only the configuration is injectable.

## Flagged, not built

- **Comment content screening.** Still the always-true seam (see above).
- **`competition_result`** is a reserved `PointsSource` with no writer (B-100).
- **Anonymisation.** `AccountDeletionSweepService` does not revoke an anonymised user's baseline rows: the
  leaderboard already excludes non-active accounts, and the ledger holds opaque ids only.
- **Restriction lifted.** Not undone (see above).
