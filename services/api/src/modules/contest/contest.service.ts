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
  AdminContestCycleDetailResponse,
  AdminContestCycleListItem,
  AdminContestCycleListResponse,
  AdminContestEntry,
  AdminContestRoundDetail,
  AdminCurrentContestResponse,
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

// sprint-2/contest-withdrawn-consent-visibility (Decision Log #339
// resolution). toWeeklyWinners()/toStandings() are shared by the public
// (JwtAuthGuard-only) endpoints and the AdminJwtAuthGuard-only endpoints,
// and each surface needs different visibility when a
// ContestRoundWinner/ContestStanding row's userId belongs to a minor whose
// Guardian.consentStatus has moved to 'declined' (withdrawn) since the
// entry was submitted:
//   - 'public': the row is OMITTED entirely -- no renumbering/backfill.
//     The vacated position/prize slot stays vacant; the next-ranked
//     entrant is never promoted into it. This is a deliberate business
//     decision, not an accidental gap: a withdrawal reduces the prize
//     count by one, it does not create a new winner.
//   - 'admin': the row is KEPT (an admin still needs it to reconcile round
//     scoring -- position, weekNumber, entryId are all real), but the
//     minor's real identity/content is redacted to a placeholder, the same
//     anonymize-in-place-rather-than-delete discipline
//     account-anonymization-reconsideration (Decision Log #341) already
//     established for feed.service.ts's authors.
type ContestVisibilityMode = 'public' | 'admin';

const WITHDRAWN_CONSENT_ADMIN_PLACEHOLDER = 'Entry withdrawn — guardian consent revoked';

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

// sprint-2/admin-contest-read-endpoints (Decision Log #241). The admin
// read surface reuses CYCLE_GRAPH_INCLUDE and layers on what only an
// admin needs:
//
//  - the list (GET /admin/contest/cycles) adds a per-round entry COUNT
//    (`_count`, cheap — no rows pulled).
//  - the detail views (GET /admin/contest/cycles/:id and .../current)
//    add each round's full `entries`, each with its entrant, the
//    submitted Post (the same narrow field set feed's POST_SELECT
//    exposes), and — via the ContestEntry.winner back-relation — the
//    winning position, if any. This is the only place entryIds surface.
const ADMIN_CYCLE_LIST_INCLUDE = {
  ...CYCLE_GRAPH_INCLUDE,
  rounds: {
    ...CYCLE_GRAPH_INCLUDE.rounds,
    include: {
      ...CYCLE_GRAPH_INCLUDE.rounds.include,
      _count: { select: { entries: true } },
    },
  },
} satisfies Prisma.ContestCycleInclude;

const ADMIN_CYCLE_DETAIL_INCLUDE = {
  ...CYCLE_GRAPH_INCLUDE,
  rounds: {
    ...CYCLE_GRAPH_INCLUDE.rounds,
    include: {
      ...CYCLE_GRAPH_INCLUDE.rounds.include,
      entries: {
        orderBy: { submittedAt: 'asc' },
        include: {
          user: { select: { displayName: true } },
          post: {
            select: {
              id: true,
              contentText: true,
              mediaUrls: true,
              createdAt: true,
              likeCount: true,
              commentCount: true,
            },
          },
          // The weekly-winner back-relation (ContestEntry.winner) — set
          // when this entry placed in its round's judged top 3.
          winner: { select: { position: true } },
        },
      },
    },
  },
} satisfies Prisma.ContestCycleInclude;

type AdminCycleListGraph = Prisma.ContestCycleGetPayload<{ include: typeof ADMIN_CYCLE_LIST_INCLUDE }>;
type AdminCycleDetailGraph = Prisma.ContestCycleGetPayload<{ include: typeof ADMIN_CYCLE_DETAIL_INCLUDE }>;

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
    const withdrawnUserIds = await this.getWithdrawnConsentUserIds(this.collectGraphUserIds(graph));

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
      weeklyWinners: this.toWeeklyWinners(graph, 'public', withdrawnUserIds),
      monthlyStandings: phase === 'crowned' ? this.toStandings(graph, 'public', withdrawnUserIds) : [],
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
    const withdrawnUserIds = await this.getWithdrawnConsentUserIds(this.collectGraphUserIds(graph));
    return {
      cycle: this.toCycleSummary(graph),
      phase,
      rounds: graph.rounds.map((r) => this.toRoundSummary(r)),
      weeklyWinners: this.toWeeklyWinners(graph, 'public', withdrawnUserIds),
      monthlyStandings: this.toStandings(graph, 'public', withdrawnUserIds),
    };
  }

  // -------------------------------------------------------------------
  // Admin read surface — sprint-2/admin-contest-read-endpoints
  // (Decision Log #241). All AdminJwtAuthGuard-only (ContestAdminController).
  //
  // Safeguarding: these reads expose entrant displayNames + submitted
  // post text, but a restricted-pending minor can never appear here. A
  // ContestEntry's userId is always its Post's authorId, POST /posts is
  // GuardianConsentGuard-gated, and POST /contest/entries is too — so a
  // restricted-pending minor has no Post and therefore no ContestEntry.
  // dateOfBirth/isMinor are immutable post-registration, so an entry
  // cannot retroactively become a *minor's* entry.
  //
  // sprint-1/guardian-consent-decline-withdraw-expiry corrected this
  // comment to note that a guardian CAN now withdraw consent after having
  // already confirmed it (POST /auth/guardian-consent/withdraw), moving a
  // 'confirmed' Guardian row to 'declined' — so a ContestRoundWinner/
  // ContestStanding row that WAS validly submitted by a consented minor
  // can later belong to a minor whose consent has since been revoked.
  // That correction flagged this as a Decision Log candidate (#339)
  // without resolving it either way.
  //
  // RESOLVED by sprint-2/contest-withdrawn-consent-visibility, per Temi's
  // explicit direction — see the ContestVisibilityMode doc comment above
  // toWeeklyWinners()/toStandings() for the full public-vs-admin shape.
  // Short version: the PUBLIC endpoints (getCurrentContest/getCycleById)
  // now omit a withdrawn winner/standing row entirely, with no
  // renumbering; the ADMIN endpoints below keep the row (so an admin can
  // still reconcile round scoring) but redact the minor's displayName and
  // postId to WITHDRAWN_CONSENT_ADMIN_PLACEHOLDER, mirroring how
  // feed.service.ts's ACTIVE_AUTHOR_POST_FILTER family anonymizes an
  // author's identity in place rather than deleting the row
  // (Decision Log #341).
  //
  // toAdminEntry() / AdminContestEntry (a round's raw, not-yet-judged
  // `entries` array, exposed only via getCycleByIdForAdmin/
  // getCurrentContestForAdmin's `rounds[].entries`) is ALSO now covered,
  // closing the residual gap this comment used to flag as a separate
  // follow-up: a withdrawn entrant's real displayName and full post
  // content (contentText/mediaUrls) are redacted to
  // WITHDRAWN_CONSENT_ADMIN_PLACEHOLDER there too, via the same
  // getWithdrawnConsentUserIds() batched lookup — see
  // collectAdminDetailUserIds()'s own comment for why `entries[].userId`
  // needed folding into that lookup, and toAdminEntry()'s own comment for
  // exactly what is and isn't redacted on an entry row.
  // -------------------------------------------------------------------

  // GET /admin/contest/cycles
  async listCyclesForAdmin(): Promise<AdminContestCycleListResponse> {
    const cycles = await this.prisma.contestCycle.findMany({
      orderBy: { createdAt: 'desc' },
      include: ADMIN_CYCLE_LIST_INCLUDE,
    });
    // One batched Guardian lookup across every cycle's userIds, not one
    // query per cycle — see getWithdrawnConsentUserIds's own comment.
    const withdrawnUserIds = await this.getWithdrawnConsentUserIds(
      cycles.flatMap((cycle) => this.collectGraphUserIds(cycle)),
    );
    return { items: cycles.map((cycle) => this.toAdminCycleListItem(cycle, withdrawnUserIds)) };
  }

  // GET /admin/contest/cycles/:id
  async getCycleByIdForAdmin(cycleId: string): Promise<AdminContestCycleDetailResponse> {
    const cycle = await this.prisma.contestCycle.findUnique({
      where: { id: cycleId },
      include: ADMIN_CYCLE_DETAIL_INCLUDE,
    });
    if (!cycle) {
      throw new NotFoundException('Contest cycle not found');
    }
    const withdrawnUserIds = await this.getWithdrawnConsentUserIds(this.collectAdminDetailUserIds(cycle));
    return this.toAdminCycleDetail(cycle, withdrawnUserIds);
  }

  // GET /admin/contest/current — same resolution as getCurrentContest:
  // the running cycle (active/final), else the most-recently completed
  // one, else an all-null response.
  async getCurrentContestForAdmin(): Promise<AdminCurrentContestResponse> {
    const cycle =
      (await this.prisma.contestCycle.findFirst({
        where: { status: { in: ['active', 'final'] } },
        orderBy: { createdAt: 'desc' },
        include: ADMIN_CYCLE_DETAIL_INCLUDE,
      })) ??
      (await this.prisma.contestCycle.findFirst({
        where: { status: 'completed' },
        orderBy: { crownedAt: 'desc' },
        include: ADMIN_CYCLE_DETAIL_INCLUDE,
      }));

    if (!cycle) {
      return { cycle: null, phase: null, rounds: [], weeklyWinners: [], monthlyStandings: [] };
    }
    const withdrawnUserIds = await this.getWithdrawnConsentUserIds(this.collectAdminDetailUserIds(cycle));
    return this.toAdminCycleDetail(cycle, withdrawnUserIds);
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
        // contest_win Notification (Decision Log #87's audit) -- one row
        // per ContestRoundWinner created, i.e. per weekly winner, NOT the
        // monthly ContestStanding crown (crownCycle is a separate method
        // and out of this trigger's scope per the task brief). No
        // self-notification guard needed: this whole method only runs
        // behind AdminJwtAuthGuard (a completely separate AdminUser auth
        // domain, Decision Log #189-193) -- there is no identity overlap
        // between the admin actor and the User being notified.
        // payloadRefId is cycleId, not roundId/entryId: GET
        // /contest/cycles/:id is the only single-resource read endpoint
        // that exists today, so it's the one payloadRefId value a future
        // display pass can actually resolve without a new endpoint.
        await tx.notification.create({
          data: { userId: entry.userId, type: 'contest_win', payloadRefId: cycleId },
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

  // Every distinct userId that appears as a ContestRoundWinner or a
  // ContestStanding in one cycle's graph — the full set toWeeklyWinners/
  // toStandings need to check against getWithdrawnConsentUserIds's
  // result. Deliberately NOT deduped here (getWithdrawnConsentUserIds's
  // own `in: [...new Set(...)]` handles that once, across every cycle a
  // caller batches together).
  private collectGraphUserIds(graph: CycleWithGraph): string[] {
    return [
      ...graph.rounds.flatMap((r) => r.winners.map((w) => w.userId)),
      ...graph.standings.map((s) => s.userId),
    ];
  }

  // The admin detail graph (ADMIN_CYCLE_DETAIL_INCLUDE) carries each
  // round's raw `entries` array on top of everything collectGraphUserIds()
  // already covers -- a userId can appear here (as an entrant who
  // submitted, win or lose) without ever appearing as a
  // ContestRoundWinner/ContestStanding row, so collectGraphUserIds()
  // alone would miss it. Used only by getCycleByIdForAdmin/
  // getCurrentContestForAdmin (both ADMIN_CYCLE_DETAIL_INCLUDE); NOT by
  // listCyclesForAdmin, whose ADMIN_CYCLE_LIST_INCLUDE has no `entries`
  // field to read (only a per-round _count), so collectGraphUserIds()
  // alone is still correct there.
  private collectAdminDetailUserIds(graph: AdminCycleDetailGraph): string[] {
    return [
      ...this.collectGraphUserIds(graph),
      ...graph.rounds.flatMap((r) => r.entries.map((e) => e.userId)),
    ];
  }

  // Decision Log #339. One batched Guardian lookup for every userId a
  // caller passes in, rather than one query per winner/standing row — the
  // same "batch, never N+1" discipline feed.service.ts's
  // attachViewerState() and messaging.service.ts's toConversationViews()
  // already established. A userId with no Guardian row at all (not a
  // minor) is simply absent from the result set, same as any other
  // "hide via absence, never a distinct signal" filter in this codebase.
  private async getWithdrawnConsentUserIds(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.prisma.guardian.findMany({
      where: { minorUserId: { in: [...new Set(userIds)] }, consentStatus: 'declined' },
      select: { minorUserId: true },
    });
    return new Set(rows.map((r) => r.minorUserId));
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

  // mode/withdrawnUserIds: Decision Log #339. 'public' omits a withdrawn
  // row entirely (no renumbering — the vacated position simply stays
  // absent). 'admin' keeps the row but redacts displayName/postId to
  // WITHDRAWN_CONSENT_ADMIN_PLACEHOLDER. withdrawnUserIds must be
  // computed once per call site via getWithdrawnConsentUserIds() (never
  // per-row) — see the doc comment on ContestVisibilityMode above.
  private toWeeklyWinners(
    graph: CycleWithGraph,
    mode: ContestVisibilityMode,
    withdrawnUserIds: Set<string>,
  ): ContestWinnerSummary[] {
    const winners = graph.rounds
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

    if (mode === 'public') {
      return winners.filter((w) => !withdrawnUserIds.has(w.userId));
    }
    return winners.map((w) =>
      withdrawnUserIds.has(w.userId)
        ? { ...w, displayName: WITHDRAWN_CONSENT_ADMIN_PLACEHOLDER, postId: WITHDRAWN_CONSENT_ADMIN_PLACEHOLDER }
        : w,
    );
  }

  private toStandings(
    graph: CycleWithGraph,
    mode: ContestVisibilityMode,
    withdrawnUserIds: Set<string>,
  ): ContestStandingSummary[] {
    const standings = graph.standings
      .map((s) => ({ position: s.position, userId: s.userId, displayName: s.user.displayName }))
      .sort((a, b) => a.position - b.position);

    if (mode === 'public') {
      return standings.filter((s) => !withdrawnUserIds.has(s.userId));
    }
    return standings.map((s) =>
      withdrawnUserIds.has(s.userId) ? { ...s, displayName: WITHDRAWN_CONSENT_ADMIN_PLACEHOLDER } : s,
    );
  }

  // ---- admin read shaping (Decision Log #241) ----------------------

  private toAdminCycleListItem(
    graph: AdminCycleListGraph,
    withdrawnUserIds: Set<string>,
  ): AdminContestCycleListItem {
    return {
      cycle: this.toCycleSummary(graph),
      phase: ContestService.derivePhase(graph.status, this.judgedCount(graph)),
      rounds: graph.rounds.map((r) => ({
        ...this.toRoundSummary(r),
        entryCount: r._count.entries,
      })),
      weeklyWinners: this.toWeeklyWinners(graph, 'admin', withdrawnUserIds),
      monthlyStandings: this.toStandings(graph, 'admin', withdrawnUserIds),
    };
  }

  private toAdminCycleDetail(
    graph: AdminCycleDetailGraph,
    withdrawnUserIds: Set<string>,
  ): AdminContestCycleDetailResponse {
    return {
      cycle: this.toCycleSummary(graph),
      phase: ContestService.derivePhase(graph.status, this.judgedCount(graph)),
      rounds: graph.rounds.map((r) => this.toAdminRoundDetail(r, withdrawnUserIds)),
      weeklyWinners: this.toWeeklyWinners(graph, 'admin', withdrawnUserIds),
      monthlyStandings: this.toStandings(graph, 'admin', withdrawnUserIds),
    };
  }

  private toAdminRoundDetail(
    round: AdminCycleDetailGraph['rounds'][number],
    withdrawnUserIds: Set<string>,
  ): AdminContestRoundDetail {
    return {
      ...this.toRoundSummary(round),
      entryCount: round.entries.length,
      entries: round.entries.map((e) => this.toAdminEntry(e, withdrawnUserIds)),
    };
  }

  // Decision Log #339 (residual gap closed). entryId, submittedAt,
  // post.id/createdAt/likeCount/commentCount, and position are all kept
  // real regardless of withdrawal -- an admin still needs them to
  // reconcile round judging (same "keep the row, redact only
  // identity/content" reasoning as toWeeklyWinners()/toStandings()'s own
  // 'admin' mode). Only entrant.displayName and post.contentText/
  // mediaUrls are redacted, to the same WITHDRAWN_CONSENT_ADMIN_PLACEHOLDER
  // string toWeeklyWinners() already uses for a withdrawn winner's
  // displayName/postId -- mediaUrls is a string[], so it becomes a
  // single-element array carrying that same placeholder, not an empty
  // array (an empty array would read as "no media", a different and
  // false claim about the original post).
  private toAdminEntry(
    entry: AdminCycleDetailGraph['rounds'][number]['entries'][number],
    withdrawnUserIds: Set<string>,
  ): AdminContestEntry {
    const withdrawn = withdrawnUserIds.has(entry.userId);
    return {
      entryId: entry.id,
      submittedAt: entry.submittedAt,
      entrant: {
        userId: entry.userId,
        displayName: withdrawn ? WITHDRAWN_CONSENT_ADMIN_PLACEHOLDER : entry.user.displayName,
      },
      post: {
        id: entry.post.id,
        contentText: withdrawn ? WITHDRAWN_CONSENT_ADMIN_PLACEHOLDER : entry.post.contentText,
        mediaUrls: withdrawn ? [WITHDRAWN_CONSENT_ADMIN_PLACEHOLDER] : entry.post.mediaUrls,
        createdAt: entry.post.createdAt,
        likeCount: entry.post.likeCount,
        commentCount: entry.post.commentCount,
      },
      position: entry.winner?.position ?? null,
    };
  }

  private p2002Target(err: Prisma.PrismaClientKnownRequestError): string[] {
    const target = err.meta?.target;
    if (Array.isArray(target)) return target.map(String);
    if (typeof target === 'string') return [target];
    return [];
  }
}
