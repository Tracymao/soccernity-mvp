import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getCurrentIsoWeekPeriod, getIsoWeekBoundaries, getPreviousIsoWeekPeriod } from './iso-week.util';
import { ENGAGEMENT_POINTS_CAP_PER_PERIOD, ENGAGEMENT_POINTS_SOURCES } from './leaderboard.constants';

// The shape $queryRaw's aggregation below actually returns, after the
// explicit ::INTEGER casts — see rollupPeriod's own comment on why those
// casts exist (Postgres SUM(int)/RANK() both return bigint by default,
// which the pg driver would otherwise hand back as a JS `bigint`, not a
// plain `number`).
interface AggregatedLeaderboardRow {
  userId: string;
  totalPoints: number;
  rank: number;
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

    // A CTE, not one flat query with the window function inline: Postgres
    // does not allow a SELECT list expression to reference another
    // expression's own alias at the same query level (the window
    // function's ORDER BY needs the ALREADY-CAPPED total, which is
    // itself a multi-line CASE/SUM/LEAST expression) — aggregating first
    // in `aggregated`, then ranking over its `totalPoints` OUTPUT column
    // in the outer SELECT, sidesteps that restriction entirely rather
    // than repeating the capped-total expression twice.
    //
    // The cap: LEAST(SUM(engagement points), 100) — summed ONLY across
    // ENGAGEMENT_POINTS_SOURCES — is added to the UNCAPPED sum of
    // everything else (today: contest_weekly_win, contest_monthly_crown;
    // competition_result is reserved and unused). Contest points are
    // never capped — see leaderboard.constants.ts's own comment on why
    // 100 keeps Contest performance dominant per Decision Log #219's
    // ratio rationale.
    //
    // `u."accountStatus" = 'active'` (Decision Log #221) — a deactivated
    // or pending_deletion user's ledger rows are never included in a
    // fresh rollup, so their LeaderboardEntry row for THIS run's period
    // is simply never written/updated. An already-existing row from
    // before they deactivated is left untouched here (not deleted) — see
    // leaderboard/README.md's "stale rows" section for why that's fine:
    // GET /leaderboard's own read-time filter hides it regardless.
    //
    // `WHERE "totalPoints" > 0` in the outer query — a user with zero
    // PointsLedgerEntry rows in this window never appears in `aggregated`
    // at all (INNER JOIN only groups rows that exist); this filter is
    // the belt-and-braces case where every source happened to sum to
    // zero, so no zero-point LeaderboardEntry row is ever materialized.
    //
    // ::INTEGER casts on both computed columns: Postgres's SUM(int) and
    // RANK() both return bigint (int8) by default, which node-postgres
    // (and therefore Prisma's $queryRaw) would otherwise hand back as a
    // JS `bigint`, not a `number` — every real point total here is far
    // inside the safe-integer range, so casting down to a genuine SQL
    // INTEGER keeps the JS side a plain `number` with no bigint handling
    // needed anywhere in this module.
    //
    // ENGAGEMENT_POINTS_SOURCES is referenced TWICE below (once for the
    // capped branch, once for the "everything else" branch) —
    // `Prisma.join` is called fresh each time rather than reused, since
    // each occurrence needs its own independent set of query parameters.
    const aggregated = await this.prisma.$queryRaw<AggregatedLeaderboardRow[]>`
      WITH aggregated AS (
        SELECT
          ple."userId" AS "userId",
          CAST(
            LEAST(
              COALESCE(SUM(CASE WHEN ple.source IN (${Prisma.join(ENGAGEMENT_POINTS_SOURCES)}) THEN ple.points ELSE 0 END), 0),
              ${ENGAGEMENT_POINTS_CAP_PER_PERIOD}
            )
            + COALESCE(SUM(CASE WHEN ple.source NOT IN (${Prisma.join(ENGAGEMENT_POINTS_SOURCES)}) THEN ple.points ELSE 0 END), 0)
          AS INTEGER) AS "totalPoints"
        FROM "PointsLedgerEntry" ple
        INNER JOIN "User" u ON u.id = ple."userId"
        WHERE ple."occurredAt" >= ${start}
          AND ple."occurredAt" < ${end}
          AND u."accountStatus" = 'active'
        GROUP BY ple."userId"
      )
      SELECT
        "userId",
        "totalPoints",
        CAST(RANK() OVER (ORDER BY "totalPoints" DESC) AS INTEGER) AS "rank"
      FROM aggregated
      WHERE "totalPoints" > 0
    `;

    // Plain Prisma upserts, not a second raw statement — Prisma's query
    // builder can express "insert or update on a unique key" natively
    // (upsert), so raw SQL is reserved for the one thing it genuinely
    // can't do here (the window-function aggregation above). Each
    // upsert is independently idempotent (re-running with identical
    // input reproduces identical output), so this is deliberately NOT
    // wrapped in one big $transaction across every row — a partial
    // failure mid-loop just means fewer rows are current until the next
    // 15-minute tick catches up, not a correctness problem for any
    // individual row.
    for (const row of aggregated) {
      await this.prisma.leaderboardEntry.upsert({
        where: { userId_period: { userId: row.userId, period } },
        update: { points: row.totalPoints, rank: row.rank },
        create: { userId: row.userId, period, points: row.totalPoints, rank: row.rank },
      });
    }

    return { period, upserted: aggregated.length };
  }
}
