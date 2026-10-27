import { POST_MEDIA_ALL_APPROVED } from '../post-media/post-media-visibility.util';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { awardPoints } from '../points/points.util';
import { pointsToQuarters } from '../points/quarter-points.util';
import { CONTEST_ELIGIBLE_USER } from './contest-eligibility';
import { groupEngagementRows } from './contest-engagement.util';
import { FORFEIT_REASON_TOO_FEW_ENTRIES } from './contest-read-model.service';
import {
  MINIMUM_ENTRIES_FOR_A_WEEK,
  pickMonthlyPodium,
  rankFinal,
  rankPhase1,
  rankVotes,
} from './contest-ranking.util';
import { buildContestScheduleForKey, ContestSchedule, ContestWeekWindow } from './contest-schedule.util';

// backend/w7-contest (B-091; Decision Log #381, #386, #387, #393, #400, #404-#406; docs/contest-spec.md
// sections 5-8, 10). THE SCHEDULER: it replaces the admin-judged endpoints. Nothing here is
// triggered by an admin; every step is a function of the Europe/London calendar and the data.
//
// For each new-model contest (ContestCycle.monthKey set), in calendar order:
//
//   end of Phase 1 (00:00, day 5/12/19)   rank the week's entries by engagement; the top 10 qualify
//                                         for the vote. Fewer than 3 entries: the week is FORFEITED
//                                         (nobody placed, no points, reason recorded).
//   the lock (20:00, day 7/14/21)         freeze the tally, decide the top 3 by votes, award the
//                                         weekly placement points, notify the winners.
//   after week 3 is decided               the finalists are the distinct weekly winners.
//   the reveal (00:00, day 25)            status -> final. (Visibility itself is the clock: Post.visibleFrom.)
//   the end of the month (00:00 on the 1st)
//                                         rank the final entries (likes + comments, minimum tally),
//                                         crown the top 3 or declare "No winner this month", award
//                                         the monthly points, REMOVE THE PINS and let the final entries
//                                         become ordinary posts, all in one transaction.
//
// EVERY BOUNDARY IS A CALENDAR INSTANT, never "now". A tick that runs late (downtime, a slow minute)
// computes exactly what an on-time tick would have: engagement is bounded by the Phase 1 end, votes
// by the lock (a vote cannot be created after it), the weekly result is stamped at the lock. So the
// cron cadence only decides how soon a result becomes visible, never what it is.
//
// EVERY STEP IS A CLAIM. The status flip (`open -> voting`, `voting -> judged`, `active|final ->
// completed`) is an updateMany guarded on the current status, inside the transaction that does the
// work; if it matches nothing, another instance (or a previous tick) already did it and this one
// does nothing. Two overlapping sweeps therefore cannot double-award points.
//
// Legacy admin-judged cycles (monthKey NULL) are never touched.

// A big week can have thousands of entries; the default 5-second interactive-transaction timeout is
// far too short for ranking them.
const TX_OPTIONS = { timeout: 120_000, maxWait: 10_000 } as const;
// Postgres's bind-parameter ceiling is 32,767; four parameters a row.
const BULK_UPDATE_CHUNK = 1000;

export interface ContestLifecycleResult {
  cyclesProcessed: number;
  phase1Closed: number;
  weeksForfeited: number;
  weeksLocked: number;
  finalistsSelected: number;
  revealed: number;
  completed: number;
}

const emptyResult = (): ContestLifecycleResult => ({
  cyclesProcessed: 0,
  phase1Closed: 0,
  weeksForfeited: 0,
  weeksLocked: 0,
  finalistsSelected: 0,
  revealed: 0,
  completed: 0,
});

@Injectable()
export class ContestLifecycleService {
  private readonly logger = new Logger(ContestLifecycleService.name);
  // A tick that overruns must not overlap the next one in this process. Across processes the status
  // claims are the guard.
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  // Every minute. The calendar is exact to the second, but a result becoming visible within a
  // minute of its moment is enough (the notification sweep runs every five).
  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron(): Promise<void> {
    if (this.running) {
      this.logger.warn('Contest lifecycle sweep still running; skipping this tick');
      return;
    }
    this.running = true;
    try {
      const result = await this.runOnce(this.clock.now());
      const changed =
        result.phase1Closed + result.weeksLocked + result.finalistsSelected + result.revealed + result.completed;
      if (changed > 0) this.logger.log(`Contest lifecycle sweep: ${JSON.stringify(result)}`);
    } catch (err) {
      this.logger.error(`Contest lifecycle sweep failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** One sweep at a given instant. Public and clock-injected so tests need no fake timers. */
  async runOnce(now: Date): Promise<ContestLifecycleResult> {
    const result = emptyResult();
    const cycles = await this.prisma.contestCycle.findMany({
      where: { monthKey: { not: null }, status: { in: ['active', 'final'] } },
      select: { id: true },
      orderBy: { monthKey: 'asc' },
    });
    for (const { id } of cycles) {
      // One cycle failing must not starve the others; the next tick retries it (every step is a claim).
      try {
        await this.processCycle(id, now, result);
        result.cyclesProcessed++;
      } catch (err) {
        this.logger.error(`Contest lifecycle for cycle ${id} failed: ${(err as Error).message}`);
      }
    }
    return result;
  }

  /**
   * Called by the vote path: if the vote arrives in the first seconds of Phase 2, before the sweep
   * has ranked Phase 1, rank it now so the entry list the voter is looking at exists.
   */
  async ensurePhase1Closed(roundId: string, now: Date): Promise<void> {
    const round = await this.prisma.contestRound.findUnique({
      where: { id: roundId },
      include: { cycle: { select: { id: true, monthKey: true, weeklyPoints1: true } } },
    });
    if (!round || round.status !== 'open' || round.weekNumber > 3 || !round.cycle.monthKey) return;
    const schedule = buildContestScheduleForKey(round.cycle.monthKey);
    const week = schedule?.weeks[round.weekNumber - 1];
    if (!week || now.getTime() < week.phase1EndsAt.getTime()) return;
    await this.closePhase1(round.id, week, now);
  }

  // ---------------------------------------------------------------------------------------------

  private async processCycle(cycleId: string, now: Date, result: ContestLifecycleResult): Promise<void> {
    const cycle = await this.prisma.contestCycle.findUnique({
      where: { id: cycleId },
      select: { id: true, monthKey: true },
    });
    if (!cycle?.monthKey) return;
    const schedule = buildContestScheduleForKey(cycle.monthKey);
    if (!schedule) return;

    for (const week of schedule.weeks) {
      const round = await this.prisma.contestRound.findUnique({
        where: { cycleId_weekNumber: { cycleId, weekNumber: week.weekNumber } },
        select: { id: true, status: true },
      });
      if (!round) continue;

      let status = round.status;
      if (status === 'open' && now.getTime() >= week.phase1EndsAt.getTime()) {
        const outcome = await this.closePhase1(round.id, week, now);
        if (outcome === 'ranked') result.phase1Closed++;
        if (outcome === 'forfeited') {
          result.phase1Closed++;
          result.weeksForfeited++;
        }
        status = (await this.prisma.contestRound.findUnique({ where: { id: round.id }, select: { status: true } }))
          ?.status ?? status;
      }
      if (status === 'voting' && now.getTime() >= week.votesLockAt.getTime()) {
        if (await this.lockWeek(round.id, week)) result.weeksLocked++;
      }
    }

    if (await this.selectFinalists(cycleId)) result.finalistsSelected++;
    if (await this.reveal(cycleId, schedule, now)) result.revealed++;
    if (now.getTime() >= schedule.final.monthEndAt.getTime()) {
      if (await this.complete(cycleId, schedule, now)) result.completed++;
    }
  }

  // ---- end of Phase 1 ------------------------------------------------------------------------

  /** Ranks a week's entries and opens the vote, or forfeits the week. Returns what happened. */
  async closePhase1(roundId: string, week: ContestWeekWindow, now: Date): Promise<'skipped' | 'ranked' | 'forfeited'> {
    return this.prisma.$transaction(async (tx) => {
      // The claim. It also waits for any in-flight entry submission (which holds a share lock on the
      // round row) so a late entry is either in this ranking or cleanly refused.
      const claimed = await tx.contestRound.updateMany({
        where: { id: roundId, status: 'open' },
        data: { status: 'voting', phase1ClosedAt: now },
      });
      if (claimed.count === 0) return 'skipped';

      // Only eligible entrants take part: a deactivated or restricted account's entry is not ranked
      // and cannot be voted on. They are not counted toward "fewer than 3 entries" either.
      // ...and an entry whose uploaded media is not all approved is hidden from every voter (Decision
      // Log #419 item 5/7), so it cannot be ranked or voted on either.
      const entries = await tx.contestEntry.findMany({
        where: { roundId, user: CONTEST_ELIGIBLE_USER, post: { is: POST_MEDIA_ALL_APPROVED } },
        select: { id: true, submittedAt: true },
      });

      if (entries.length < MINIMUM_ENTRIES_FOR_A_WEEK) {
        await tx.contestRound.update({
          where: { id: roundId },
          data: {
            status: 'judged',
            forfeited: true,
            forfeitReason: FORFEIT_REASON_TOO_FEW_ENTRIES,
            // The calendar instant the week was lost, not the wall clock of this tick.
            judgedAt: week.phase1EndsAt,
          },
        });
        return 'forfeited';
      }

      const rows = await tx.contestEngagement.findMany({
        where: { entry: { roundId }, user: CONTEST_ELIGIBLE_USER, occurredAt: { lt: week.phase1EndsAt } },
        select: { entryId: true, userId: true, kind: true, followedAtEngagement: true, occurredAt: true },
      });
      const events = groupEngagementRows(rows);
      const ranked = rankPhase1(
        entries.map((e) => ({ entryId: e.id, submittedAt: e.submittedAt, events: events.get(e.id) ?? [] })),
        week.phase1EndsAt,
      );
      await this.bulkWritePhase1(tx, ranked);
      return 'ranked';
    }, TX_OPTIONS);
  }

  private async bulkWritePhase1(
    tx: Prisma.TransactionClient,
    ranked: { entryId: string; tally: number; rank: number; qualified: boolean }[],
  ): Promise<void> {
    for (let i = 0; i < ranked.length; i += BULK_UPDATE_CHUNK) {
      const chunk = ranked.slice(i, i + BULK_UPDATE_CHUNK);
      const values = chunk.map(
        (r) => Prisma.sql`(${r.entryId}::text, ${r.tally}::int, ${r.rank}::int, ${r.qualified}::boolean)`,
      );
      await tx.$executeRaw`
        UPDATE "ContestEntry" AS e
        SET "phase1Tally" = v.tally, "phase1Rank" = v.rank, "qualified" = v.qualified
        FROM (VALUES ${Prisma.join(values)}) AS v(id, tally, rank, qualified)
        WHERE e."id" = v.id`;
    }
  }

  // ---- the lock --------------------------------------------------------------------------------

  /** Freezes the tally at the lock and decides the week's top 3 by votes. Returns false if already decided. */
  async lockWeek(roundId: string, week: ContestWeekWindow): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.contestRound.updateMany({
        where: { id: roundId, status: 'voting' },
        // The calendar instant of the lock, so a late tick stamps the same moment an on-time one would.
        data: { status: 'judged', judgedAt: week.votesLockAt },
      });
      if (claimed.count === 0) return false;

      const round = await tx.contestRound.findUniqueOrThrow({
        where: { id: roundId },
        select: {
          cycleId: true,
          cycle: { select: { weeklyPoints1: true, weeklyPoints2: true, weeklyPoints3: true } },
        },
      });
      const points = [round.cycle.weeklyPoints1, round.cycle.weeklyPoints2, round.cycle.weeklyPoints3];

      const entries = await tx.contestEntry.findMany({
        where: { roundId, qualified: true, user: CONTEST_ELIGIBLE_USER },
        select: { id: true, userId: true, submittedAt: true, phase1Rank: true },
      });
      // Only votes cast strictly before the lock, by accounts that are still eligible, count.
      const votes = await tx.contestVote.findMany({
        where: {
          roundId,
          entryId: { in: entries.map((e) => e.id) },
          voter: CONTEST_ELIGIBLE_USER,
          createdAt: { lt: week.votesLockAt },
        },
        select: { entryId: true, voterId: true, createdAt: true },
      });
      const votesByEntry = new Map<string, { voterId: string; createdAt: Date }[]>();
      for (const v of votes) {
        const list = votesByEntry.get(v.entryId) ?? [];
        list.push({ voterId: v.voterId, createdAt: v.createdAt });
        votesByEntry.set(v.entryId, list);
      }

      const ranked = rankVotes(
        entries.map((e) => ({
          entryId: e.id,
          submittedAt: e.submittedAt,
          phase1Rank: e.phase1Rank,
          votes: votesByEntry.get(e.id) ?? [],
        })),
      );
      const byEntry = new Map(entries.map((e) => [e.id, e]));

      for (const [index, winner] of ranked.slice(0, 3).entries()) {
        const entry = byEntry.get(winner.entryId)!;
        const position = index + 1;
        await tx.contestRoundWinner.create({
          data: { roundId, entryId: entry.id, userId: entry.userId, position },
        });
        await awardPoints(tx, {
          userId: entry.userId,
          source: 'contest_weekly_win',
          // One win per user per round (ContestEntry @@unique([roundId, userId])), so the round id
          // alone keys the ledger uniquely per user.
          refId: roundId,
          quarterPoints: pointsToQuarters(points[index]),
          occurredAt: week.votesLockAt,
        });
        // The personal winner notice (Decision Log #278, #405 item 3): the existing `contest_win`
        // row, one per weekly winner. payloadRefId is the cycle (the only single-resource read
        // endpoint that exists is GET /contest/cycles/:id).
        await tx.notification.create({
          data: { userId: entry.userId, type: 'contest_win', payloadRefId: round.cycleId },
        });
      }
      return true;
    }, TX_OPTIONS);
  }

  // ---- finalists, reveal ----------------------------------------------------------------------

  /**
   * Once all three weekly rounds are decided (a forfeited week counts), the finalists are the
   * distinct weekly winners. They are DERIVED from ContestRoundWinner, so "selection" is just the
   * stamp that the set is final; if there are none there is no final.
   */
  private async selectFinalists(cycleId: string): Promise<boolean> {
    const cycle = await this.prisma.contestCycle.findUnique({
      where: { id: cycleId },
      select: { finalistsSelectedAt: true },
    });
    if (!cycle || cycle.finalistsSelectedAt) return false;
    const weekly = await this.prisma.contestRound.findMany({
      where: { cycleId, weekNumber: { lte: 3 } },
      select: { status: true, judgedAt: true },
    });
    if (weekly.length !== 3 || weekly.some((r) => r.status !== 'judged')) return false;
    // The latest decision instant: deterministic, independent of when this tick ran.
    const selectedAt = new Date(Math.max(...weekly.map((r) => (r.judgedAt ?? new Date(0)).getTime())));
    const claimed = await this.prisma.contestCycle.updateMany({
      where: { id: cycleId, finalistsSelectedAt: null },
      data: { finalistsSelectedAt: selectedAt },
    });
    return claimed.count > 0;
  }

  private async finalistCount(cycleId: string): Promise<number> {
    const winners = await this.prisma.contestRoundWinner.findMany({
      where: { round: { cycleId, weekNumber: { lte: 3 } } },
      select: { userId: true },
      distinct: ['userId'],
    });
    return winners.length;
  }

  // Week 4 only exists when finalists are known (no finalist, no final). At the reveal the cycle
  // becomes `final`; the entries' VISIBILITY does not wait for this tick, it is the clock
  // (Post.visibleFrom), so a late tick never delays the reveal for viewers.
  private async reveal(cycleId: string, schedule: ContestSchedule, now: Date): Promise<boolean> {
    if (now.getTime() < schedule.final.revealAt.getTime()) return false;
    const cycle = await this.prisma.contestCycle.findUnique({
      where: { id: cycleId },
      select: { status: true, finalistsSelectedAt: true },
    });
    if (!cycle || cycle.status !== 'active' || !cycle.finalistsSelectedAt) return false;
    if ((await this.finalistCount(cycleId)) === 0) return false;
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.contestCycle.updateMany({
        where: { id: cycleId, status: 'active' },
        data: { status: 'final', finalOpenedAt: schedule.final.revealAt, revealedAt: schedule.final.revealAt },
      });
      if (claimed.count === 0) return false;
      await tx.contestRound.updateMany({
        where: { cycleId, weekNumber: 4, status: 'open' },
        data: { status: 'live' },
      });
      return true;
    });
  }

  // ---- the end of the month: crown, final result, pin removal -----------------------------------

  /**
   * At 00:00 on the 1st: rank the final entries, crown the top 3 (or declare "No winner this month"
   * / no final), award the monthly points, remove the pins and release the final entries into the
   * ordinary feed -- ONE transaction, so the contest ends as a single event. `crownedAt` is when
   * this ran (>= the month end); the final-result notification fires at the later of the two
   * (contest-notification-plan.ts), exactly as the spec says.
   */
  private async complete(cycleId: string, schedule: ContestSchedule, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const cycle = await tx.contestCycle.findUniqueOrThrow({
        where: { id: cycleId },
        select: {
          status: true,
          minimumTally: true,
          followersExcludedWeek4: true,
          monthlyPoints1: true,
          monthlyPoints2: true,
          monthlyPoints3: true,
        },
      });
      if (cycle.status === 'completed') return false;

      const round4 = await tx.contestRound.findUnique({
        where: { cycleId_weekNumber: { cycleId, weekNumber: 4 } },
        select: { id: true },
      });
      const entries = round4
        ? await tx.contestEntry.findMany({
            // A final entry whose video is not approved by the reveal is not shown, so it is not ranked (#419 item 7).
            where: { roundId: round4.id, post: { is: POST_MEDIA_ALL_APPROVED } },
            select: { id: true, userId: true, submittedAt: true },
          })
        : [];

      // The final ranking: likes + comments from eligible givers inside [reveal, month end).
      const rows = entries.length
        ? await tx.contestEngagement.findMany({
            where: {
              entryId: { in: entries.map((e) => e.id) },
              user: CONTEST_ELIGIBLE_USER,
              occurredAt: { gte: schedule.final.revealAt, lt: schedule.final.monthEndAt },
            },
            select: { entryId: true, userId: true, kind: true, followedAtEngagement: true, occurredAt: true },
          })
        : [];
      const events = groupEngagementRows(rows);
      const ranked = rankFinal(
        entries.map((e) => ({ entryId: e.id, submittedAt: e.submittedAt, events: events.get(e.id) ?? [] })),
        {
          minimumTally: cycle.minimumTally ?? Number.MAX_SAFE_INTEGER,
          excludeFollowers: cycle.followersExcludedWeek4,
          from: schedule.final.revealAt,
          before: schedule.final.monthEndAt,
        },
      );

      // A finalist whose account is no longer eligible cannot be crowned; the next one takes the place.
      const eligibleAuthors = new Set(
        (
          await tx.user.findMany({
            where: { id: { in: entries.map((e) => e.userId) }, ...CONTEST_ELIGIBLE_USER },
            select: { id: true },
          })
        ).map((u) => u.id),
      );
      const authorOf = new Map(entries.map((e) => [e.id, e.userId]));
      const podium = pickMonthlyPodium(ranked.filter((r) => eligibleAuthors.has(authorOf.get(r.entryId)!)));

      const claimed = await tx.contestCycle.updateMany({
        where: { id: cycleId, status: { in: ['active', 'final'] } },
        data: { status: 'completed', crownedAt: now, noWinner: podium.length === 0, pinsRemovedAt: now },
      });
      if (claimed.count === 0) return false;

      const monthly = [cycle.monthlyPoints1, cycle.monthlyPoints2, cycle.monthlyPoints3];
      for (const [index, placed] of podium.entries()) {
        const userId = authorOf.get(placed.entryId)!;
        await tx.contestStanding.create({ data: { cycleId, userId, position: index + 1 } });
        await awardPoints(tx, {
          userId,
          source: 'contest_monthly_crown',
          refId: cycleId,
          quarterPoints: pointsToQuarters(monthly[index]),
          occurredAt: now,
        });
      }
      for (const r of ranked) {
        await tx.contestEntry.update({
          where: { id: r.entryId },
          data: { finalTally: r.tally, finalRank: r.rank },
        });
      }
      if (round4) {
        await tx.contestRound.update({ where: { id: round4.id }, data: { status: 'judged', judgedAt: now } });
      }

      // B-092: the Final-week carousel's per-viewer impression rows have done their job (balancing
      // exposure and the daily cap). Keep ONE aggregate total per entry for the admin distribution
      // view and DELETE the per-viewer rows, in the same transaction as the crown.
      const impressionCounts = await tx.contestImpression.groupBy({
        by: ['entryId'],
        where: { entry: { cycleId } },
        _count: { _all: true },
      });
      const impressionOf = new Map(impressionCounts.map((c) => [c.entryId, c._count._all]));
      for (const e of entries) {
        await tx.contestEntry.update({ where: { id: e.id }, data: { impressionTotal: impressionOf.get(e.id) ?? 0 } });
      }
      await tx.contestImpression.deleteMany({ where: { entry: { cycleId } } });

      // The pin comes off every entry of the contest, and a final entry stops being special: it is
      // visible and in the Community feed like any other post (Decision Log #405 item 1, #406 item 5).
      await tx.contestEntry.updateMany({ where: { cycleId, pinRemovedAt: null }, data: { pinRemovedAt: now } });
      await tx.post.updateMany({
        where: { contestEntry: { cycleId } },
        data: { visibleFrom: null, communityFeedFrom: null },
      });
      return true;
    }, TX_OPTIONS);
  }
}
