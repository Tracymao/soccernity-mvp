import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { getCurrentIsoWeekPeriod, getIsoWeekBoundaries, getPreviousIsoWeekPeriod } from './iso-week.util';
import { GLOBAL_BOARD_CLUB_ID } from './leaderboard.constants';

// The shape $queryRaw's aggregation below actually returns, after the
// explicit ::INTEGER casts — see rollupPeriod's own comment on why those
// casts exist (Postgres SUM(int)/RANK() both return bigint by default,
// which the pg driver would otherwise hand back as a JS `bigint`, not a
// plain `number`).
interface AggregatedLeaderboardRow {
  userId: string;
  // QUARTER-POINT units (backend/w12-points, Decision Log #383), ranked EXACTLY.
  totalQuarterPoints: number;
  rank: number;
}

// Decision Log #128 -- the same shape, plus the club board the row belongs to.
interface AggregatedClubLeaderboardRow extends AggregatedLeaderboardRow {
  clubId: string;
}


export interface RollupPeriodResult {
  period: string;
  upserted: number;
}

// The Sprint 6 rollup mechanism — Build Plan Section 4.9. Recomputes
// LeaderboardEntry (points + rank) for a single ISO-week period from the
// append-only PointsLedgerEntry ledger, via ONE raw, parameterized
// $queryRaw aggregation (Prisma's query builder cannot express a
// GROUP BY + window-function RANK() OVER (...) — see
// clubs.service.ts's own established precedent in this codebase for
// dropping to raw SQL specifically when the ORM can't reach). See
// leaderboard/README.md for the full design write-up (period handling,
// the cap, the active-account exclusion, and why this runs on a
// @Cron() schedule rather than on-demand at read time).
@Injectable()
export class LeaderboardRollupService {
  private readonly logger = new Logger(LeaderboardRollupService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Every 15 minutes, recompute BOTH the current ISO week AND the
  // immediately-preceding one. Recomputing the previous period too is
  // deliberately cheap insurance against the period-boundary edge case
  // (a PointsLedgerEntry row awarded in the last few minutes of a week,
  // read by a rollup tick that lands just after the Monday-00:00-UTC
  // rollover) rather than building separate finalization/backfill logic
  // — the previous period's numbers can only ever still be growing for a
  // few minutes right at the boundary, and re-running the same idempotent
  // upsert on an already-settled period is a harmless no-op cost
  // (identical values in, identical values out).
  //
  // `now` defaults to the real clock but is an explicit parameter,
  // exactly like AccountDeletionSweepService.sweepPendingDeletions(now)
  // — so tests can prove period-boundary behavior deterministically
  // without mocking global time. @Cron() itself always calls this with
  // no arguments, which is fine: the default parameter covers that case.
  // @nestjs/schedule's CronExpression enum (the installed version) has
  // no EVERY_15_MINUTES member — the nearest built-ins are
  // EVERY_10_MINUTES / EVERY_30_MINUTES. A plain cron string, following
  // the exact "0 */N * * * *" shape those two enum members themselves
  // use (confirmed against cron-expression.enum.d.ts), avoids either
  // over- or under-shooting the requested 15-minute cadence.
  @Cron('0 */15 * * * *')
  async runRollup(now: Date = new Date()): Promise<void> {
    const currentPeriod = getCurrentIsoWeekPeriod(now);
    const previousPeriod = getPreviousIsoWeekPeriod(currentPeriod);

    const current = await this.rollupPeriod(currentPeriod);
    const previous = await this.rollupPeriod(previousPeriod);

    this.logger.log(
      `Leaderboard rollup complete: ${currentPeriod}=${current.upserted} rows, ` +
        `${previousPeriod}=${previous.upserted} rows`,
    );
  }

  // Recomputes LeaderboardEntry for exactly one period. Public (not
  // private) so runRollup can call it twice, and so tests / a future
  // manual-backfill script can call it directly for an arbitrary period
  // without waiting for the cron tick.
  async rollupPeriod(period: string): Promise<RollupPeriodResult> {
    const { start, end } = getIsoWeekBoundaries(period);

    const globalRows = await this.aggregateGlobalBoard(start, end);
    const clubRows = await this.aggregateClubBoards(start, end);

    for (const row of globalRows) {
      await this.upsertEntry(row, period, GLOBAL_BOARD_CLUB_ID);
    }
    for (const row of clubRows) {
      await this.upsertEntry(row, period, row.clubId);
    }

    return { period, upserted: globalRows.length + clubRows.length };
  }

  private async upsertEntry(
    row: AggregatedLeaderboardRow,
    period: string,
    clubId: string,
  ): Promise<void> {
    await this.prisma.leaderboardEntry.upsert({
      where: { userId_period_clubId: { userId: row.userId, period, clubId } },
      update: { quarterPoints: row.totalQuarterPoints, rank: row.rank },
      create: { userId: row.userId, period, clubId, quarterPoints: row.totalQuarterPoints, rank: row.rank },
    });
  }

  private async aggregateGlobalBoard(start: Date, end: Date): Promise<AggregatedLeaderboardRow[]> {
    // A CTE, not one flat query with the window function inline: the window function's ORDER BY needs
    // the aggregated total, which a SELECT list cannot reference at the same query level - aggregating
    // first in `aggregated`, then ranking over its output column in the outer SELECT, sidesteps that.
    //
    // backend/w12-points (B-093): the total is SUM(quarterPoints) over the ledger rows that have NOT been
    // revoked (revokedAt IS NULL) - baseline engagement given and received, plus contest placement
    // prizes. There is no weekly cap here any more: the daily caps (40 given / 20 received) are applied
    // when a point is awarded, and placement prizes are never capped. A revoked row counts for nothing.
    //
    // `u."accountStatus" = 'active'` (Decision Log #221) - a deactivated or pending_deletion user's
    // ledger rows are never included in a fresh rollup, so their LeaderboardEntry row for THIS run's
    // period is simply never written/updated. An already-existing row from before they deactivated is
    // left untouched here (not deleted) - see leaderboard/README.md's "stale rows" section for why
    // that's fine: GET /leaderboard's own read-time filter hides it regardless.
    //
    // `WHERE "totalQuarterPoints" > 0` - a user with no live ledger rows in this window never appears in
    // `aggregated` at all; this filter is the belt-and-braces case where every row happened to be
    // revoked, so no zero-point LeaderboardEntry row is ever materialized.
    //
    // ::INTEGER casts on both computed columns: Postgres's SUM(int) and RANK() both return bigint (int8)
    // by default, which node-postgres (and therefore Prisma's $queryRaw) would otherwise hand back as a
    // JS `bigint`, not a `number` - every real total here is far inside the safe-integer range, so
    // casting down keeps the JS side a plain `number` with no bigint handling needed anywhere.
    return this.prisma.$queryRaw<AggregatedLeaderboardRow[]>`
      WITH aggregated AS (
        SELECT
          ple."userId" AS "userId",
          CAST(COALESCE(SUM(ple."quarterPoints"), 0) AS INTEGER) AS "totalQuarterPoints"
        FROM "PointsLedgerEntry" ple
        INNER JOIN "User" u ON u.id = ple."userId"
        WHERE ple."occurredAt" >= ${start}
          AND ple."occurredAt" < ${end}
          AND ple."revokedAt" IS NULL
          AND u."accountStatus" = 'active'
        GROUP BY ple."userId"
      )
      SELECT
        "userId",
        "totalQuarterPoints",
        CAST(RANK() OVER (ORDER BY "totalQuarterPoints" DESC) AS INTEGER) AS "rank"
      FROM aggregated
      WHERE "totalQuarterPoints" > 0
    `;
  }

  // Decision Log #128 -- one row per (club, user) for the club boards. Same revocation rule, same
  // active-account filter, same ledger window as the global board, with two differences: only points
  // attributed to a club (ple."clubId" IS NOT NULL) count, and RANK() is partitioned by club so each
  // club board is ranked on its own.
  private async aggregateClubBoards(start: Date, end: Date): Promise<AggregatedClubLeaderboardRow[]> {
    return this.prisma.$queryRaw<AggregatedClubLeaderboardRow[]>`
      WITH aggregated AS (
        SELECT
          ple."clubId" AS "clubId",
          ple."userId" AS "userId",
          CAST(COALESCE(SUM(ple."quarterPoints"), 0) AS INTEGER) AS "totalQuarterPoints"
        FROM "PointsLedgerEntry" ple
        INNER JOIN "User" u ON u.id = ple."userId"
        WHERE ple."occurredAt" >= ${start}
          AND ple."occurredAt" < ${end}
          AND ple."revokedAt" IS NULL
          AND ple."clubId" IS NOT NULL
          AND u."accountStatus" = 'active'
        GROUP BY ple."clubId", ple."userId"
      )
      SELECT
        "clubId",
        "userId",
        "totalQuarterPoints",
        CAST(RANK() OVER (PARTITION BY "clubId" ORDER BY "totalQuarterPoints" DESC) AS INTEGER) AS "rank"
      FROM aggregated
      WHERE "totalQuarterPoints" > 0
    `;
  }
}
