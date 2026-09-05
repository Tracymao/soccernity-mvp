import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CONTEST_MONTHLY_CROWN_POINTS,
  CONTEST_WEEKLY_WIN_POINTS,
} from '../points/points.constants';
import { awardPoints } from '../points/points.util';
import { CreateCycleDto } from './dto/create-cycle.dto';
import { CrownCycleDto } from './dto/crown-cycle.dto';
import { RoundResultsDto } from './dto/round-results.dto';
import {
  ContestCycleDetailResponse,
  ContestCycleSummary,
  ContestPhase,
  ContestRoundSummary,
  ContestStandingSummary,
  ContestWinnerSummary,
  CurrentContestResponse,
} from './contest.types';

const WEEKLY_ROUND_COUNT = 3;
const ROUND_LENGTH_MS = 7 * 24 * 60 * 60 * 1000;

// A cycle plus its rounds (each with weekly winners + the winning post
// id) and its crowned standings — everything needed to derive the phase
// and shape every Contest response.
const CYCLE_GRAPH_INCLUDE = {
  rounds: {
    orderBy: { weekNumber: 'asc' },
    include: {
      winners: {
        include: {
          user: { select: { displayName: true } },
          entry: { select: { postId: true } },
        },
      },
    },
  },
  standings: {
    include: { user: { select: { displayName: true } } },
  },
} satisfies Prisma.ContestCycleInclude;

type CycleWithGraph = Prisma.ContestCycleGetPayload<{ include: typeof CYCLE_GRAPH_INCLUDE }>;

@Injectable()
export class ContestService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // Phase derivation — the heart of the weekly-progression state machine
  // -------------------------------------------------------------------
  //
  // Pure function of (cycle.status, number of judged rounds). Never reads
  // the clock — "which week are we in" is driven by admin actions
  // (judging a round, opening the final, crowning), not wall time, so the
  // phase is deterministic and fully testable. See contest.types.ts for
  // the mapping to Decision Log #61/#70's Figma states.
  static derivePhase(status: string, judgedRoundCount: number): ContestPhase {
    if (status === 'completed') return 'crowned';
    if (status === 'final') return 'final_live';
    // status === 'active'
    if (judgedRoundCount >= WEEKLY_ROUND_COUNT) return 'weeks_1_3';
    if (judgedRoundCount === 2) return 'weeks_1_2';
    if (judgedRoundCount === 1) return 'week_1';
    return 'vacant';
  }

  // -------------------------------------------------------------------
  // GET /contest/current
  // -------------------------------------------------------------------
  async getCurrentContest(userId: string): Promise<CurrentContestResponse> {
    // "The current cycle" = the one running now (active or final). If
    // none is running, fall back to the most recently completed one so
    // the "crowned" state keeps showing until the next cycle starts.
    const cycle =
      (await this.prisma.contestCycle.findFirst({
        where: { status: { in: ['active', 'final'] } },
        orderBy: { createdAt: 'desc' },
        include: CYCLE_GRAPH_INCLUDE,
      })) ??
      (await this.prisma.contestCycle.findFirst({
        where: { status: 'completed' },
        orderBy: { crownedAt: 'desc' },
        include: CYCLE_GRAPH_INCLUDE,
      }));

    if (!cycle) {
      return {
        cycle: null,
        phase: null,
        isAcceptingEntries: false,
        activeRound: null,
        rounds: [],
        weeklyWinners: [],
        monthlyStandings: [],
        callerEntry: null,
      };
    }

    const graph = cycle as CycleWithGraph;
    const phase = ContestService.derivePhase(graph.status, this.judgedCount(graph));
    const activeRound = this.findOpenRound(graph);
    const isAcceptingEntries = graph.status === 'active' && activeRound !== null;

    let callerEntry: CurrentContestResponse['callerEntry'] = null;
    if (activeRound) {
      const entry = await this.prisma.contestEntry.findUnique({
        where: { roundId_userId: { roundId: activeRound.id, userId } },
        select: { roundId: true, postId: true },
      });
      if (entry) {
        callerEntry = { roundId: entry.roundId, weekNumber: activeRound.weekNumber, postId: entry.postId };
      }
    }

    return {
      cycle: this.toCycleSummary(graph),
      phase,
      isAcceptingEntries,
      activeRound: activeRound ? this.toRoundSummary(activeRound) : null,
      rounds: graph.rounds.map((r) => this.toRoundSummary(r)),
      weeklyWinners: this.toWeeklyWinners(graph),
      monthlyStandings: phase === 'crowned' ? this.toStandings(graph) : [],
      callerEntry,
    };
  }

  // -------------------------------------------------------------------
  // GET /contest/cycles/:id
  // -------------------------------------------------------------------
  async getCycleById(cycleId: string): Promise<ContestCycleDetailResponse> {
    const cycle = await this.prisma.contestCycle.findUnique({
      where: { id: cycleId },
      include: CYCLE_GRAPH_INCLUDE,
    });
    if (!cycle) {
      throw new NotFoundException('Contest cycle not found');
    }
    const graph = cycle as CycleWithGraph;
    const phase = ContestService.derivePhase(graph.status, this.judgedCount(graph));
    return {
      cycle: this.toCycleSummary(graph),
      phase,
      rounds: graph.rounds.map((r) => this.toRoundSummary(r)),
      weeklyWinners: this.toWeeklyWinners(graph),
      monthlyStandings: this.toStandings(graph),
    };
  }

  // -------------------------------------------------------------------
  // POST /contest/entries — submit a Post as a contest entry
  // -------------------------------------------------------------------
  async submitEntry(
    userId: string,
    postId: string,
  ): Promise<{ id: string; cycleId: string; roundId: string; weekNumber: number; postId: string; submittedAt: Date }> {
    const cycle = await this.prisma.contestCycle.findFirst({ where: { status: 'active' } });
    if (!cycle) {
      throw new ConflictException('No contest is currently accepting entries');
    }

    const now = new Date();
    const round = await this.prisma.contestRound.findFirst({
      where: {
        cycleId: cycle.id,
        status: 'open',
        opensAt: { lte: now },
        closesAt: { gte: now },
      },
    });
    if (!round) {
      throw new ConflictException('No contest round is currently open for entries');
    }

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true },
    });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    if (post.authorId !== userId) {
      throw new ForbiddenException('You can only submit your own post as a contest entry');
    }

    try {
      const entry = await this.prisma.contestEntry.create({
        data: { cycleId: cycle.id, roundId: round.id, postId, userId },
        select: { id: true, cycleId: true, roundId: true, postId: true, submittedAt: true },
      });
      return { ...entry, weekNumber: round.weekNumber };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        if (this.p2002Target(err).includes('postId')) {
          throw new ConflictException('This post has already been submitted as a contest entry');
        }
        throw new ConflictException('You have already submitted an entry for this contest round');
      }
      throw err;
    }
  }

  // -------------------------------------------------------------------
  // Admin: POST /admin/contest/cycles
  // -------------------------------------------------------------------
  async createCycle(dto: CreateCycleDto): Promise<ContestCycleDetailResponse> {
    const running = await this.prisma.contestCycle.findFirst({
      where: { status: { in: ['active', 'final'] } },
    });
    if (running) {
      throw new ConflictException('A contest cycle is already running; crown it before starting another');
    }

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (startsAt >= endsAt) {
      throw new BadRequestException('startsAt must be before endsAt');
    }

    const rounds = this.resolveRoundWindows(dto, startsAt);

    const cycle = await this.prisma.contestCycle.create({
      data: {
        title: dto.title,
        status: 'active',
        startsAt,
        endsAt,
        rounds: {
          create: rounds.map((r) => ({
            weekNumber: r.weekNumber,
            status: 'open',
            opensAt: r.opensAt,
            closesAt: r.closesAt,
          })),
        },
      },
      include: CYCLE_GRAPH_INCLUDE,
    });

    return this.getCycleById(cycle.id);
  }

  // -------------------------------------------------------------------
  // Admin: POST /admin/contest/cycles/:id/rounds/:week/results
  // -------------------------------------------------------------------
  async recordRoundResults(
    cycleId: string,
    weekNumber: number,
    dto: RoundResultsDto,
  ): Promise<ContestCycleDetailResponse> {
    const cycle = await this.prisma.contestCycle.findUnique({
      where: { id: cycleId },
      include: { rounds: { orderBy: { weekNumber: 'asc' } } },
    });
    if (!cycle) {
      throw new NotFoundException('Contest cycle not found');
    }
    if (cycle.status !== 'active') {
      throw new ConflictException('Weekly rounds can only be judged while the cycle is active');
    }

    const round = cycle.rounds.find((r) => r.weekNumber === weekNumber);
    if (!round) {
      throw new NotFoundException(`Contest cycle has no week ${weekNumber} round`);
    }
    if (round.status === 'judged') {
      throw new ConflictException(`Week ${weekNumber} has already been judged`);
    }

    // Sequential judging: you cannot judge week N while an earlier week is
    // still open. Matches Decision Log #70's progressive 3 → 6 → 9 fill.
    const earlierUnjudged = cycle.rounds.find(
      (r) => r.weekNumber < weekNumber && r.status !== 'judged',
    );
    if (earlierUnjudged) {
      throw new ConflictException(
        `Week ${earlierUnjudged.weekNumber} must be judged before week ${weekNumber}`,
      );
    }

    // Validate the winners payload against real entries in THIS round.
    const entryIds = dto.winners.map((w) => w.entryId);
    if (new Set(entryIds).size !== entryIds.length) {
      throw new BadRequestException('The same entry cannot appear twice in the winners list');
    }
    const entries =
      entryIds.length > 0
        ? await this.prisma.contestEntry.findMany({
            where: { id: { in: entryIds } },
            select: { id: true, roundId: true, userId: true },
          })
        : [];
    const entryById = new Map(entries.map((e) => [e.id, e]));
    for (const winner of dto.winners) {
      const entry = entryById.get(winner.entryId);
      if (!entry || entry.roundId !== round.id) {
        throw new BadRequestException(`Entry ${winner.entryId} does not belong to week ${weekNumber}`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.contestRound.update({
        where: { id: round.id },
        data: { status: 'judged', judgedAt: new Date() },
      });
      for (const winner of dto.winners) {
        const entry = entryById.get(winner.entryId)!;
        await tx.contestRoundWinner.create({
          data: {
            roundId: round.id,
            entryId: entry.id,
            userId: entry.userId,
            position: winner.position,
          },
        });
        await awardPoints(tx, {
          userId: entry.userId,
          source: 'contest_weekly_win',
          // One win per user per round (ContestEntry @@unique([roundId,
          // userId])), so round.id alone keys the ledger uniquely per user.
          refId: round.id,
          points: CONTEST_WEEKLY_WIN_POINTS[winner.position],
        });
      }
    });

    return this.getCycleById(cycleId);
  }

  // -------------------------------------------------------------------
  // Admin: POST /admin/contest/cycles/:id/final/open
  // -------------------------------------------------------------------
  async openFinal(cycleId: string): Promise<ContestCycleDetailResponse> {
    const cycle = await this.prisma.contestCycle.findUnique({
      where: { id: cycleId },
      include: { rounds: true },
    });
    if (!cycle) {
      throw new NotFoundException('Contest cycle not found');
    }
    if (cycle.status !== 'active') {
      throw new ConflictException('The final can only open from an active cycle');
    }
    const judged = cycle.rounds.filter((r) => r.status === 'judged').length;
    if (judged < WEEKLY_ROUND_COUNT) {
      throw new ConflictException('All three weekly rounds must be judged before the final opens');
    }

    await this.prisma.contestCycle.update({
      where: { id: cycleId },
      data: { status: 'final', finalOpenedAt: new Date() },
    });

    return this.getCycleById(cycleId);
  }

  // -------------------------------------------------------------------
  // Admin: POST /admin/contest/cycles/:id/crown
  // -------------------------------------------------------------------
  async crownCycle(cycleId: string, dto: CrownCycleDto): Promise<ContestCycleDetailResponse> {
    const cycle = await this.prisma.contestCycle.findUnique({
      where: { id: cycleId },
      include: { rounds: { include: { winners: { select: { userId: true } } } } },
    });
    if (!cycle) {
      throw new NotFoundException('Contest cycle not found');
    }
    if (cycle.status !== 'final') {
      throw new ConflictException('The final must be open before the cycle can be crowned');
    }

    const userIds = dto.standings.map((s) => s.userId);
    if (new Set(userIds).size !== userIds.length) {
      throw new BadRequestException('The same user cannot appear twice in the standings');
    }
    // Decision Log #61: the finalists ARE the weekly winners — a crowned
    // user must have won at least one weekly round of this cycle.
    const weeklyWinnerIds = new Set(
      cycle.rounds.flatMap((r) => r.winners.map((w) => w.userId)),
    );
    for (const userId of userIds) {
      if (!weeklyWinnerIds.has(userId)) {
        throw new BadRequestException(`User ${userId} is not a weekly winner of this cycle and cannot be crowned`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.contestCycle.update({
        where: { id: cycleId },
        data: { status: 'completed', crownedAt: new Date() },
      });
      for (const standing of dto.standings) {
        await tx.contestStanding.create({
          data: { cycleId, userId: standing.userId, position: standing.position },
        });
        await awardPoints(tx, {
          userId: standing.userId,
          source: 'contest_monthly_crown',
          refId: cycleId,
          points: CONTEST_MONTHLY_CROWN_POINTS[standing.position],
        });
      }
    });

    return this.getCycleById(cycleId);
  }

  // -------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------

  private resolveRoundWindows(
    dto: CreateCycleDto,
    startsAt: Date,
  ): { weekNumber: number; opensAt: Date; closesAt: Date }[] {
    if (dto.rounds) {
      const weeks = dto.rounds.map((r) => r.weekNumber).sort((a, b) => a - b);
      if (weeks.join(',') !== '1,2,3') {
        throw new BadRequestException('rounds must cover exactly weeks 1, 2 and 3');
      }
      return dto.rounds.map((r) => {
        const opensAt = new Date(r.opensAt);
        const closesAt = new Date(r.closesAt);
        if (opensAt >= closesAt) {
          throw new BadRequestException(`week ${r.weekNumber}: opensAt must be before closesAt`);
        }
        return { weekNumber: r.weekNumber, opensAt, closesAt };
      });
    }
    // Auto-generate: three consecutive 7-day windows from startsAt.
    return Array.from({ length: WEEKLY_ROUND_COUNT }, (_, i) => ({
      weekNumber: i + 1,
      opensAt: new Date(startsAt.getTime() + i * ROUND_LENGTH_MS),
      closesAt: new Date(startsAt.getTime() + (i + 1) * ROUND_LENGTH_MS),
    }));
  }

  private judgedCount(graph: CycleWithGraph): number {
    return graph.rounds.filter((r) => r.status === 'judged').length;
  }

  private findOpenRound(graph: CycleWithGraph): CycleWithGraph['rounds'][number] | null {
    const now = Date.now();
    return (
      graph.rounds.find(
        (r) =>
          r.status === 'open' &&
          r.opensAt.getTime() <= now &&
          r.closesAt.getTime() >= now,
      ) ?? null
    );
  }

  private toCycleSummary(cycle: CycleWithGraph): ContestCycleSummary {
    return {
      id: cycle.id,
      title: cycle.title,
      status: cycle.status,
      startsAt: cycle.startsAt,
      endsAt: cycle.endsAt,
      finalOpenedAt: cycle.finalOpenedAt,
      crownedAt: cycle.crownedAt,
    };
  }

  private toRoundSummary(round: {
    id: string;
    weekNumber: number;
    status: string;
    opensAt: Date;
    closesAt: Date;
    judgedAt: Date | null;
  }): ContestRoundSummary {
    return {
      id: round.id,
      weekNumber: round.weekNumber,
      status: round.status,
      opensAt: round.opensAt,
      closesAt: round.closesAt,
      judgedAt: round.judgedAt,
    };
  }

  private toWeeklyWinners(graph: CycleWithGraph): ContestWinnerSummary[] {
    return graph.rounds
      .flatMap((round) =>
        round.winners.map((w) => ({
          weekNumber: round.weekNumber,
          position: w.position,
          userId: w.userId,
          displayName: w.user.displayName,
          entryId: w.entryId,
          postId: w.entry.postId,
        })),
      )
      .sort((a, b) => a.weekNumber - b.weekNumber || a.position - b.position);
  }

  private toStandings(graph: CycleWithGraph): ContestStandingSummary[] {
    return graph.standings
      .map((s) => ({ position: s.position, userId: s.userId, displayName: s.user.displayName }))
      .sort((a, b) => a.position - b.position);
  }

  private p2002Target(err: Prisma.PrismaClientKnownRequestError): string[] {
    const target = err.meta?.target;
    if (Array.isArray(target)) return target.map(String);
    if (typeof target === 'string') return [target];
    return [];
  }
}
