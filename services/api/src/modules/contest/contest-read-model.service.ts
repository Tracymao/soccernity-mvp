import { POST_MEDIA_ALL_APPROVED } from '../post-media/post-media-visibility.util';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PUBLIC_NAME_SELECT, resolvePublicName } from '../users/public-name.util';
import { CONTEST_ELIGIBLE_USER } from './contest-eligibility';
import { groupEngagementRows } from './contest-engagement.util';
import { EngagementEvent, rankFinal } from './contest-ranking.util';
import {
  buildContestScheduleForKey,
  ContestCalendarState,
  ContestSchedule,
  deriveCalendarState,
} from './contest-schedule.util';
import {
  ContestCycleSummary,
  ContestFinalOutcome,
  ContestFinalRankingRow,
  ContestFinalistSummary,
  ContestForfeitedWeek,
  ContestPhase,
  ContestRoundSummary,
  ContestStandingSummary,
  ContestWinnerSummary,
} from './contest.types';

// backend/w7-contest (B-091). The part of every contest response that is the same for the public
// endpoints and the admin endpoints: the cycle, its rounds, the weekly winners, the finalists, the
// forfeited weeks, the week-4 ranking, the standings and the outcome. Built once here so the user
// view and the admin view cannot drift apart.

// Decision Log #339 (sprint-2/contest-withdrawn-consent-visibility): winners / standings / finalists
// whose guardian has since WITHDRAWN consent. Public surfaces omit the row entirely (no renumbering:
// the vacated slot stays vacant, the next entrant is not promoted); the admin surface keeps the row
// and redacts the identity. Unchanged by B-091.
export const WITHDRAWN_CONSENT_ADMIN_PLACEHOLDER = 'Entry withdrawn — guardian consent revoked';
export type ContestViewer = 'public' | 'admin';

/** A short, factual reason, shown with the forfeit pop-up (spec section 7). [COPY PENDING LEGAL REVIEW: reaches minors.] */
export const FORFEIT_REASON_TOO_FEW_ENTRIES = 'Fewer than 3 entries were submitted for this week.';

export const CYCLE_GRAPH_INCLUDE = {
  rounds: {
    orderBy: { weekNumber: 'asc' },
    include: {
      winners: {
        include: {
          user: { select: PUBLIC_NAME_SELECT },
          entry: { select: { postId: true } },
        },
      },
    },
  },
  standings: { include: { user: { select: PUBLIC_NAME_SELECT } } },
} satisfies Prisma.ContestCycleInclude;

export type CycleGraph = Prisma.ContestCycleGetPayload<{ include: typeof CYCLE_GRAPH_INCLUDE }>;
export type RoundRow = CycleGraph['rounds'][number];

export interface ContestReadParts {
  cycle: ContestCycleSummary;
  phase: ContestPhase;
  calendarState: ContestCalendarState | null;
  rounds: ContestRoundSummary[];
  weeklyWinners: ContestWinnerSummary[];
  finalists: ContestFinalistSummary[];
  forfeitedWeeks: ContestForfeitedWeek[];
  finalRanking: ContestFinalRankingRow[] | null;
  monthlyStandings: ContestStandingSummary[];
  finalOutcome: ContestFinalOutcome | null;
  /** For callers that need to branch on it without re-deriving. */
  schedule: ContestSchedule | null;
  finalistUserIds: string[];
  allWeeklyJudged: boolean;
}

@Injectable()
export class ContestReadModel {
  constructor(private readonly prisma: PrismaService) {}

  // Pure function of (status, how many weekly rounds are decided). A forfeited week counts as
  // decided. Never reads the clock; the clock-driven answer is calendarState.
  static derivePhase(status: string, decidedWeeklyRounds: number): ContestPhase {
    if (status === 'completed') return 'crowned';
    if (status === 'final') return 'final_live';
    if (decidedWeeklyRounds >= 3) return 'weeks_1_3';
    if (decidedWeeklyRounds === 2) return 'weeks_1_2';
    if (decidedWeeklyRounds === 1) return 'week_1';
    return 'vacant';
  }

  async build(cycle: CycleGraph, now: Date, viewer: ContestViewer): Promise<ContestReadParts> {
    const schedule = cycle.monthKey ? buildContestScheduleForKey(cycle.monthKey) : null;
    const weekly = cycle.rounds.filter((r) => r.weekNumber <= 3);
    const decided = weekly.filter((r) => r.status === 'judged').length;
    const allWeeklyJudged = weekly.length === 3 && decided === 3;

    const finalistUserIds = allWeeklyJudged
      ? [...new Set(weekly.flatMap((r) => [...r.winners].sort((a, b) => a.position - b.position).map((w) => w.userId)))]
      : [];

    const calendarState = schedule
      ? deriveCalendarState(
          schedule,
          weekly.map((r) => ({ weekNumber: r.weekNumber, forfeited: r.forfeited })),
          finalistUserIds.length,
          now,
        )
      : null;

    const finalRows = await this.loadFinalRanking(cycle, schedule, calendarState);
    const withdrawn = await this.getWithdrawnConsentUserIds([
      ...cycle.rounds.flatMap((r) => r.winners.map((w) => w.userId)),
      ...cycle.standings.map((s) => s.userId),
      ...(finalRows?.map((r) => r.userId) ?? []),
    ]);

    const phase =
      cycle.status === 'active' && calendarState?.kind === 'final_live'
        ? 'final_live' // the clock has passed the reveal; the lifecycle sweep flips `status` within a minute
        : ContestReadModel.derivePhase(cycle.status, decided);

    const weeklyWinners = this.toWeeklyWinners(cycle, viewer, withdrawn);
    const monthlyStandings = this.toStandings(cycle, viewer, withdrawn);

    return {
      cycle: this.toCycleSummary(cycle),
      phase,
      calendarState,
      rounds: cycle.rounds.map((r) => this.toRoundSummary(r, schedule, calendarState, now, viewer)),
      weeklyWinners,
      finalists: this.toFinalists(cycle, finalistUserIds, viewer, withdrawn),
      forfeitedWeeks: weekly
        .filter((r) => r.forfeited)
        .map((r) => ({ weekNumber: r.weekNumber, reason: r.forfeitReason ?? FORFEIT_REASON_TOO_FEW_ENTRIES })),
      finalRanking: finalRows ? this.toFinalRanking(finalRows, viewer, withdrawn) : null,
      monthlyStandings,
      finalOutcome: this.finalOutcome(cycle, finalistUserIds.length, allWeeklyJudged),
      schedule,
      finalistUserIds,
      allWeeklyJudged,
    };
  }

  toCycleSummary(cycle: {
    id: string;
    title: string;
    description: string | null;
    monthKey: string | null;
    status: string;
    startsAt: Date;
    endsAt: Date;
    finalOpenedAt: Date | null;
    crownedAt: Date | null;
  }): ContestCycleSummary {
    return {
      id: cycle.id,
      title: cycle.title,
      description: cycle.description,
      monthKey: cycle.monthKey,
      status: cycle.status,
      startsAt: cycle.startsAt,
      endsAt: cycle.endsAt,
      finalOpenedAt: cycle.finalOpenedAt,
      crownedAt: cycle.crownedAt,
    };
  }

  // A week's task is hidden until the week has opened, so a future week cannot be read early. The
  // final's task is shown only in the uploading and live-ranking states (Decision Log #403 item 10).
  // An admin sees everything.
  toRoundSummary(
    round: {
      id: string;
      weekNumber: number;
      status: string;
      opensAt: Date;
      closesAt: Date;
      judgedAt: Date | null;
      task: string | null;
      viewWatchLimitSeconds: number | null;
      forfeited: boolean;
      forfeitReason: string | null;
    },
    schedule: ContestSchedule | null,
    calendarState: ContestCalendarState | null,
    now: Date,
    viewer: ContestViewer,
  ): ContestRoundSummary {
    const week = schedule && round.weekNumber <= 3 ? schedule.weeks[round.weekNumber - 1] : null;
    let task: string | null = round.task;
    if (viewer === 'public') {
      if (round.weekNumber === 4) {
        task = calendarState?.kind === 'final_upload' || calendarState?.kind === 'final_live' ? round.task : null;
      } else if (round.opensAt.getTime() > now.getTime()) {
        task = null;
      }
    }
    return {
      id: round.id,
      weekNumber: round.weekNumber,
      status: round.status,
      opensAt: round.opensAt,
      closesAt: round.closesAt,
      judgedAt: round.judgedAt,
      task,
      entriesCloseAt: week ? week.phase1EndsAt : null,
      votesLockAt: week ? week.votesLockAt : null,
      viewWatchLimitSeconds: round.viewWatchLimitSeconds,
      forfeited: round.forfeited,
      forfeitReason: round.forfeited ? (round.forfeitReason ?? FORFEIT_REASON_TOO_FEW_ENTRIES) : null,
    };
  }

  private toWeeklyWinners(cycle: CycleGraph, viewer: ContestViewer, withdrawn: Set<string>): ContestWinnerSummary[] {
    const winners = cycle.rounds
      .filter((r) => r.weekNumber <= 3)
      .flatMap((round) =>
        round.winners.map((w) => ({
          weekNumber: round.weekNumber,
          position: w.position,
          userId: w.userId,
          publicName: resolvePublicName(w.user),
          entryId: w.entryId,
          postId: w.entry.postId,
        })),
      )
      .sort((a, b) => a.weekNumber - b.weekNumber || a.position - b.position);
    if (viewer === 'public') return winners.filter((w) => !withdrawn.has(w.userId));
    return winners.map((w) =>
      withdrawn.has(w.userId)
        ? { ...w, publicName: WITHDRAWN_CONSENT_ADMIN_PLACEHOLDER, postId: WITHDRAWN_CONSENT_ADMIN_PLACEHOLDER }
        : w,
    );
  }

  private toStandings(cycle: CycleGraph, viewer: ContestViewer, withdrawn: Set<string>): ContestStandingSummary[] {
    const standings = cycle.standings
      .map((s) => ({ position: s.position, userId: s.userId, publicName: resolvePublicName(s.user) }))
      .sort((a, b) => a.position - b.position);
    if (viewer === 'public') return standings.filter((s) => !withdrawn.has(s.userId));
    return standings.map((s) =>
      withdrawn.has(s.userId) ? { ...s, publicName: WITHDRAWN_CONSENT_ADMIN_PLACEHOLDER } : s,
    );
  }

  private toFinalists(
    cycle: CycleGraph,
    finalistUserIds: string[],
    viewer: ContestViewer,
    withdrawn: Set<string>,
  ): ContestFinalistSummary[] {
    const names = new Map<string, string>();
    for (const round of cycle.rounds) {
      for (const w of round.winners) names.set(w.userId, resolvePublicName(w.user));
    }
    const finalists = finalistUserIds.map((userId) => ({ userId, publicName: names.get(userId) ?? '' }));
    if (viewer === 'public') return finalists.filter((f) => !withdrawn.has(f.userId));
    return finalists.map((f) =>
      withdrawn.has(f.userId) ? { ...f, publicName: WITHDRAWN_CONSENT_ADMIN_PLACEHOLDER } : f,
    );
  }

  private toFinalRanking(
    rows: FinalRankingSource[],
    viewer: ContestViewer,
    withdrawn: Set<string>,
  ): ContestFinalRankingRow[] {
    const shaped = rows.map((r) => ({
      rank: r.rank,
      entryId: r.entryId,
      postId: r.postId,
      userId: r.userId,
      publicName: r.publicName,
      points: r.points,
    }));
    if (viewer === 'public') return shaped.filter((r) => !withdrawn.has(r.userId));
    return shaped.map((r) =>
      withdrawn.has(r.userId)
        ? { ...r, publicName: WITHDRAWN_CONSENT_ADMIN_PLACEHOLDER, postId: WITHDRAWN_CONSENT_ADMIN_PLACEHOLDER }
        : r,
    );
  }

  // pending until the cycle completes; then winners / no_winner (finalists but nobody reached the
  // minimum tally) / no_final (week 3 produced no winner at all, so there was no final).
  private finalOutcome(cycle: CycleGraph, finalistCount: number, allWeeklyJudged: boolean): ContestFinalOutcome | null {
    if (cycle.status !== 'completed') return 'pending';
    if (cycle.standings.length > 0) return 'winners';
    if (cycle.monthKey === null) return null; // a legacy cycle with no standings: nothing to say
    if (!allWeeklyJudged || finalistCount === 0) return 'no_final';
    return 'no_winner';
  }

  // The week-4 ranking: the stored result once crowned, the live one from the reveal, nothing
  // before. Likes + comments only, by eligible givers, in the admin's followers mode.
  private async loadFinalRanking(
    cycle: CycleGraph,
    schedule: ContestSchedule | null,
    calendarState: ContestCalendarState | null,
  ): Promise<FinalRankingSource[] | null> {
    const round4 = cycle.rounds.find((r) => r.weekNumber === 4);
    if (!schedule || !round4) return null;
    const completed = cycle.status === 'completed';
    const live = calendarState?.kind === 'final_live';
    if (!completed && !live) return null;

    const entries = await this.prisma.contestEntry.findMany({
      // Only entries whose uploaded video is approved are shown or ranked (Decision Log #419 item 7).
      where: { roundId: round4.id, post: { is: POST_MEDIA_ALL_APPROVED } },
      select: {
        id: true,
        postId: true,
        userId: true,
        submittedAt: true,
        finalTally: true,
        finalRank: true,
        user: { select: PUBLIC_NAME_SELECT },
      },
    });
    if (entries.length === 0) return [];

    if (completed && entries.every((e) => e.finalRank !== null)) {
      return entries
        .map((e) => ({
          rank: e.finalRank as number,
          entryId: e.id,
          postId: e.postId,
          userId: e.userId,
          publicName: resolvePublicName(e.user),
          points: e.finalTally ?? 0,
        }))
        .sort((a, b) => a.rank - b.rank);
    }

    const events = await this.loadEngagementEvents(entries.map((e) => e.id), schedule.final.monthEndAt);
    const ranked = rankFinal(
      entries.map((e) => ({ entryId: e.id, submittedAt: e.submittedAt, events: events.get(e.id) ?? [] })),
      {
        minimumTally: 0,
        excludeFollowers: cycle.followersExcludedWeek4,
        from: schedule.final.revealAt,
        before: schedule.final.monthEndAt,
      },
    );
    const byId = new Map(entries.map((e) => [e.id, e]));
    return ranked.map((r) => {
      const e = byId.get(r.entryId)!;
      return {
        rank: r.rank,
        entryId: e.id,
        postId: e.postId,
        userId: e.userId,
        publicName: resolvePublicName(e.user),
        points: r.tally,
      };
    });
  }

  /** Engagement events by entry, from eligible givers only (active, verified email, not restricted). */
  async loadEngagementEvents(
    entryIds: string[],
    before: Date,
    from?: Date,
  ): Promise<Map<string, EngagementEvent[]>> {
    const rows = await this.prisma.contestEngagement.findMany({
      where: {
        entryId: { in: entryIds },
        user: CONTEST_ELIGIBLE_USER,
        occurredAt: from ? { gte: from, lt: before } : { lt: before },
      },
      select: { entryId: true, userId: true, kind: true, followedAtEngagement: true, occurredAt: true },
    });
    return groupEngagementRows(rows);
  }

  // Decision Log #339. One batched Guardian lookup for every userId a caller passes in.
  async getWithdrawnConsentUserIds(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.prisma.guardian.findMany({
      where: { minorUserId: { in: [...new Set(userIds)] }, consentStatus: 'declined' },
      select: { minorUserId: true },
    });
    return new Set(rows.map((r) => r.minorUserId));
  }
}

interface FinalRankingSource {
  rank: number;
  entryId: string;
  postId: string;
  userId: string;
  publicName: string;
  points: number;
}
