import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { getCurrentIsoWeekPeriod, getPreviousIsoWeekPeriod } from './iso-week.util';
import { getSevenDayBaseline } from './leaderboard-period.util';
import { LeaderboardRollupService } from './leaderboard-rollup.service';
import { ALL_TIME_PERIOD } from './leaderboard.constants';

export interface HistoryRollupResult {
  period: string;
  rowsUpdated: number;
}

// backend/b053-leaderboard-periods (B-053, Decision Log #472). The two things the board did not have:
//
//  1. an ALL-TIME board: LeaderboardEntry rows with period 'all-time', the sum of every unrevoked
//     quarter-point ledger row since the start, ranked exactly like a weekly board. Built by the existing
//     LeaderboardRollupService.rollupPeriod('all-time') (same SQL, wider window), so the rank and active
//     account rules are identical.
//  2. the 7-DAY RANK BASELINE: for every row of a board, the rank that person held on the same board seven
//     days earlier, stored in LeaderboardEntry.rankSevenDaysAgo. GET /leaderboard returns rank minus that
//     value. The baseline is DERIVED from the ledger, not from stored snapshots (no snapshot table
//     exists): the board is re-ranked as it stood at the earlier instant, counting a ledger row only if it
//     had been awarded by then and not yet revoked by then (PointsLedgerEntry.occurredAt / revokedAt).
//
// A separate service on its own cron (not folded into LeaderboardRollupService.runRollup) so the existing
// weekly rollup, its cadence and its tests are untouched. It runs a few minutes AFTER the main rollup
// tick so the rows it annotates already exist; a row created after this pass simply has a NULL baseline
// until the next one (honest: "unknown", never 0).
@Injectable()
export class LeaderboardHistoryRollupService {
  private readonly logger = new Logger(LeaderboardHistoryRollupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: LeaderboardRollupService,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  // Every 15 minutes, 7 minutes after the main rollup ('0 */15 * * * *').
  @Cron('0 7,22,37,52 * * * *')
  async runHistoryRollup(now: Date = this.clock.now()): Promise<void> {
    const currentPeriod = getCurrentIsoWeekPeriod(now);
    const previousPeriod = getPreviousIsoWeekPeriod(currentPeriod);

    // The all-time board has to exist before its baseline can be written onto it.
    await this.boards.rollupPeriod(ALL_TIME_PERIOD);

    const results: HistoryRollupResult[] = [];
    for (const period of [currentPeriod, previousPeriod, ALL_TIME_PERIOD]) {
      results.push(await this.updateSevenDayBaseline(period, now));
    }
    this.logger.log(
      `Leaderboard 7-day baseline updated: ${results.map((r) => `${r.period}=${r.rowsUpdated}`).join(', ')}`,
    );
  }

  // Sets rankSevenDaysAgo on every LeaderboardEntry row of `period` (the Overall board and every club
  // board), in ONE statement: a row whose person was not on that board seven days earlier gets NULL.
  //
  // `ranked` re-ranks the board as it stood at `asOf`: ledger rows awarded in [windowStart, asOf] that
  // were not revoked at asOf, active accounts only (see the caveat below), points > 0, RANK() exactly as
  // the live rollup does. The global board is the '' clubId; club boards are partitioned by the snapshot
  // clubId on the ledger row, mirroring LeaderboardRollupService.aggregateClubBoards.
  //
  // CAVEAT (stated, not hidden): "active account" is the account's status NOW. A person deactivated
  // since is on neither today's board nor, here, the earlier one, so others' earlier ranks are computed
  // without them. There is no status history to do better.
  async updateSevenDayBaseline(period: string, now: Date): Promise<HistoryRollupResult> {
    const { asOf, windowStart } = getSevenDayBaseline(period, now);

    const rowsUpdated = await this.prisma.$executeRaw`
      WITH earlier AS (
        SELECT
          '' AS "clubId",
          ple."userId" AS "userId",
          CAST(COALESCE(SUM(ple."quarterPoints"), 0) AS INTEGER) AS "totalQuarterPoints"
        FROM "PointsLedgerEntry" ple
        INNER JOIN "User" u ON u.id = ple."userId"
        WHERE ple."occurredAt" >= ${windowStart}
          AND ple."occurredAt" <= ${asOf}
          AND (ple."revokedAt" IS NULL OR ple."revokedAt" > ${asOf})
          AND u."accountStatus" = 'active'
        GROUP BY ple."userId"
        UNION ALL
        SELECT
          ple."clubId" AS "clubId",
          ple."userId" AS "userId",
          CAST(COALESCE(SUM(ple."quarterPoints"), 0) AS INTEGER) AS "totalQuarterPoints"
        FROM "PointsLedgerEntry" ple
        INNER JOIN "User" u ON u.id = ple."userId"
        WHERE ple."occurredAt" >= ${windowStart}
          AND ple."occurredAt" <= ${asOf}
          AND (ple."revokedAt" IS NULL OR ple."revokedAt" > ${asOf})
          AND ple."clubId" IS NOT NULL
          AND u."accountStatus" = 'active'
        GROUP BY ple."clubId", ple."userId"
      ),
      ranked AS (
        SELECT
          "clubId",
          "userId",
          CAST(RANK() OVER (PARTITION BY "clubId" ORDER BY "totalQuarterPoints" DESC) AS INTEGER) AS "rank"
        FROM earlier
        WHERE "totalQuarterPoints" > 0
      )
      UPDATE "LeaderboardEntry" le
      SET "rankSevenDaysAgo" = (
        SELECT r."rank" FROM ranked r WHERE r."userId" = le."userId" AND r."clubId" = le."clubId"
      )
      WHERE le."period" = ${period}
    `;

    return { period, rowsUpdated };
  }
}
