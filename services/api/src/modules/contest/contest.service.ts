import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { hasBlockBetween, notBlockedWith } from '../block/block.util';
import { decodeFeedCursor, encodeFeedCursor } from '../feed/cursor.util';
import { FEED_DEFAULT_PAGE_SIZE, FEED_MAX_PAGE_SIZE, FeedQueryDto } from '../feed/dto/feed-query.dto';
import { FeedPost, FeedService, visibleToViewer } from '../feed/feed.service';
import { PUBLIC_NAME_SELECT, resolvePublicName } from '../users/public-name.util';
import { CONTEST_ELIGIBLE_USER } from './contest-eligibility';
import { CYCLE_GRAPH_INCLUDE, ContestReadModel, CycleGraph } from './contest-read-model.service';
import {
  buildContestScheduleForKey,
  isWithinEntryWindow,
  isWithinFinalUploadWindow,
  monthKeyOf,
} from './contest-schedule.util';
import { SubmitFinalEntryDto } from './dto/submit-final-entry.dto';
import {
  ContestCycleDetailResponse,
  ContestEntryView,
  ContestRoundEntriesResponse,
  CurrentContestResponse,
  PinnedEntryResponse,
} from './contest.types';

// Error `code`s on the 409/403s a client branches on (the frontend shows a different state for each).
export const CONTEST_NOT_ACCEPTING_ENTRIES_CODE = 'contest_not_accepting_entries';
export const CONTEST_ENTRIES_CLOSED_CODE = 'contest_entries_closed';
export const CONTEST_FINAL_UPLOAD_CLOSED_CODE = 'contest_final_upload_closed';
export const CONTEST_NOT_FINALIST_CODE = 'contest_not_finalist';

const conflict = (code: string, message: string) =>
  new ConflictException({ statusCode: 409, error: 'Conflict', code, message });

// What the entry views select. The post fields are the narrow set the feed already exposes.
const ENTRY_VIEW_SELECT = {
  id: true,
  roundId: true,
  userId: true,
  submittedAt: true,
  qualified: true,
  phase1Rank: true,
  pinnedUntil: true,
  pinRemovedAt: true,
  round: { select: { weekNumber: true, status: true, forfeited: true } },
  user: { select: PUBLIC_NAME_SELECT },
  post: {
    select: { id: true, contentText: true, mediaUrls: true, createdAt: true, likeCount: true, commentCount: true },
  },
  winner: { select: { position: true } },
} satisfies Prisma.ContestEntrySelect;
type EntryViewRow = Prisma.ContestEntryGetPayload<{ select: typeof ENTRY_VIEW_SELECT }>;

/**
 * The user-facing Contest (B-091; Decision Log #381, #386, #387, #400, #404-#406). Reads, the weekly
 * entry, the finalist's final upload, the per-round entry list and the profile pin.
 *
 * The Contest is not admin-judged: this service never decides anything. Results are written by
 * ContestLifecycleService on the calendar; voting is ContestVotingService; the admin only creates
 * and edits (ContestAdminService).
 */
@Injectable()
export class ContestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feed: FeedService,
    private readonly readModel: ContestReadModel,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  // -------------------------------------------------------------------------------------------
  // GET /contest/current
  // -------------------------------------------------------------------------------------------
  async getCurrentContest(userId: string, now: Date = this.clock.now()): Promise<CurrentContestResponse> {
    const cycle = await this.resolveCurrentCycle(now);
    if (!cycle) {
      return {
        cycle: null,
        phase: null,
        calendarState: null,
        isAcceptingEntries: false,
        activeRound: null,
        rounds: [],
        weeklyWinners: [],
        finalists: [],
        forfeitedWeeks: [],
        finalRanking: null,
        monthlyStandings: [],
        finalOutcome: null,
        callerEntry: null,
        callerFinalEntry: null,
        callerIsFinalist: false,
        callerCanEnter: false,
        callerVote: null,
      };
    }

    const parts = await this.readModel.build(cycle, now, 'public');
    const state = parts.calendarState;

    // The round whose ENTRY window is open right now.
    const weeklyOpen = state?.kind === 'week_entries';
    const finalOpen = state?.kind === 'final_upload';
    const activeRoundRow = weeklyOpen
      ? cycle.rounds.find((r) => r.weekNumber === state.weekNumber)
      : finalOpen
        ? cycle.rounds.find((r) => r.weekNumber === 4)
        : undefined;
    const activeRound = activeRoundRow
      ? (parts.rounds.find((r) => r.id === activeRoundRow.id) ?? null)
      : null;

    // The round being voted on, for the caller's current vote.
    const votingRound = state?.kind === 'week_voting' ? cycle.rounds.find((r) => r.weekNumber === state.weekNumber) : undefined;
    const round4 = cycle.rounds.find((r) => r.weekNumber === 4);

    const [weeklyEntry, finalEntry, vote] = await Promise.all([
      weeklyOpen && activeRoundRow
        ? this.prisma.contestEntry.findUnique({
            where: { roundId_userId: { roundId: activeRoundRow.id, userId } },
            select: { roundId: true, postId: true },
          })
        : Promise.resolve(null),
      round4
        ? this.prisma.contestEntry.findUnique({
            where: { roundId_userId: { roundId: round4.id, userId } },
            select: { id: true, postId: true, submittedAt: true },
          })
        : Promise.resolve(null),
      votingRound
        ? this.prisma.contestVote.findUnique({
            where: { roundId_voterId: { roundId: votingRound.id, voterId: userId } },
            select: { roundId: true, entryId: true },
          })
        : Promise.resolve(null),
    ]);

    const callerIsFinalist = parts.finalistUserIds.includes(userId);
    const callerCanEnter = weeklyOpen ? weeklyEntry === null : finalOpen ? callerIsFinalist && finalEntry === null : false;

    return {
      cycle: parts.cycle,
      phase: parts.phase,
      calendarState: state,
      isAcceptingEntries: weeklyOpen || (finalOpen && parts.finalistUserIds.length > 0),
      activeRound,
      rounds: parts.rounds,
      weeklyWinners: parts.weeklyWinners,
      finalists: parts.finalists,
      forfeitedWeeks: parts.forfeitedWeeks,
      finalRanking: parts.finalRanking,
      monthlyStandings: parts.phase === 'crowned' ? parts.monthlyStandings : [],
      finalOutcome: parts.finalOutcome,
      callerEntry:
        weeklyEntry && activeRoundRow
          ? { roundId: weeklyEntry.roundId, weekNumber: activeRoundRow.weekNumber, postId: weeklyEntry.postId }
          : null,
      callerFinalEntry: finalEntry
        ? { entryId: finalEntry.id, postId: finalEntry.postId, submittedAt: finalEntry.submittedAt }
        : null,
      callerIsFinalist,
      callerCanEnter,
      callerVote: vote ? { roundId: vote.roundId, entryId: vote.entryId } : null,
    };
  }

  // GET /contest/cycles/:id -- one cycle in full, for the "past months" view.
  async getCycleById(cycleId: string, now: Date = this.clock.now()): Promise<ContestCycleDetailResponse> {
    const cycle = await this.prisma.contestCycle.findUnique({ where: { id: cycleId }, include: CYCLE_GRAPH_INCLUDE });
    if (!cycle) throw new NotFoundException('Contest cycle not found');
    const parts = await this.readModel.build(cycle, now, 'public');
    return {
      cycle: parts.cycle,
      phase: parts.phase,
      calendarState: parts.calendarState,
      rounds: parts.rounds,
      weeklyWinners: parts.weeklyWinners,
      finalists: parts.finalists,
      forfeitedWeeks: parts.forfeitedWeeks,
      finalRanking: parts.finalRanking,
      monthlyStandings: parts.monthlyStandings,
      finalOutcome: parts.finalOutcome,
    };
  }

  // The contest for the current London month; failing that the latest past one (so the crowned state
  // keeps showing until the next month's contest starts), then a legacy completed cycle, then the
  // nearest upcoming one. Between 00:00 and 08:00 on day 1 the new month's contest, if it exists, is
  // the current one and its state is "upcoming" (Week 1 opens at 08:00).
  private async resolveCurrentCycle(now: Date): Promise<CycleGraph | null> {
    const key = monthKeyOf(now);
    return (
      (await this.prisma.contestCycle.findUnique({ where: { monthKey: key }, include: CYCLE_GRAPH_INCLUDE })) ??
      (await this.prisma.contestCycle.findFirst({
        where: { monthKey: { lt: key } },
        orderBy: { monthKey: 'desc' },
        include: CYCLE_GRAPH_INCLUDE,
      })) ??
      (await this.prisma.contestCycle.findFirst({
        where: { monthKey: null, status: 'completed' },
        orderBy: { crownedAt: 'desc' },
        include: CYCLE_GRAPH_INCLUDE,
      })) ??
      (await this.prisma.contestCycle.findFirst({
        where: { monthKey: { gt: key } },
        orderBy: { monthKey: 'asc' },
        include: CYCLE_GRAPH_INCLUDE,
      }))
    );
  }

  // -------------------------------------------------------------------------------------------
  // POST /contest/entries -- a weekly entry (weeks 1-3, Phase 1 only)
  // -------------------------------------------------------------------------------------------
  async submitEntry(
    userId: string,
    postId: string,
    now: Date = this.clock.now(),
  ): Promise<{ id: string; cycleId: string; roundId: string; weekNumber: number; postId: string; submittedAt: Date }> {
    const cycle = await this.prisma.contestCycle.findUnique({
      where: { monthKey: monthKeyOf(now) },
      select: { id: true, monthKey: true },
    });
    const schedule = cycle?.monthKey ? this.scheduleOf(cycle.monthKey) : null;
    if (!cycle || !schedule) {
      throw conflict(CONTEST_NOT_ACCEPTING_ENTRIES_CODE, 'No contest is currently accepting entries');
    }
    // Entries are accepted in Phase 1 only: from the week's opening to the end of day 4/11/18 (#393).
    const week = schedule.weeks.find((w) => isWithinEntryWindow(w, now));
    if (!week) {
      throw conflict(CONTEST_ENTRIES_CLOSED_CODE, 'No contest round is currently open for entries');
    }
    const round = await this.prisma.contestRound.findUnique({
      where: { cycleId_weekNumber: { cycleId: cycle.id, weekNumber: week.weekNumber } },
      select: { id: true },
    });
    if (!round) throw conflict(CONTEST_ENTRIES_CLOSED_CODE, 'No contest round is currently open for entries');

    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.authorId !== userId) {
      throw new ForbiddenException('You can only submit your own post as a contest entry');
    }

    try {
      const entry = await this.prisma.$transaction(async (tx) => {
        // A share lock on the round: the end-of-Phase-1 job claims the round with an UPDATE and so
        // waits for this entry to commit; an entry made after the claim sees the round closed.
        await tx.$queryRaw`SELECT 1 FROM "ContestRound" WHERE "id" = ${round.id} FOR SHARE`;
        const fresh = await tx.contestRound.findUniqueOrThrow({ where: { id: round.id }, select: { status: true } });
        if (fresh.status !== 'open') {
          throw conflict(CONTEST_ENTRIES_CLOSED_CODE, 'No contest round is currently open for entries');
        }
        return tx.contestEntry.create({
          data: {
            cycleId: cycle.id,
            roundId: round.id,
            postId,
            userId,
            submittedAt: now,
            // Pinned on the entrant's profile until the contest ends (00:00 London on the 1st).
            pinnedUntil: schedule.final.monthEndAt,
          },
          select: { id: true, cycleId: true, roundId: true, postId: true, submittedAt: true },
        });
      });
      return { ...entry, weekNumber: week.weekNumber };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        if (this.p2002Target(err).includes('postId')) {
          throw conflict('contest_post_already_entered', 'This post has already been submitted as a contest entry');
        }
        throw conflict('contest_already_entered', 'You have already submitted an entry for this contest round');
      }
      throw err;
    }
  }

  // -------------------------------------------------------------------------------------------
  // POST /contest/final-entry -- a finalist's NEW final video (week 4, days 22-24)
  // -------------------------------------------------------------------------------------------
  async submitFinalEntry(
    userId: string,
    dto: SubmitFinalEntryDto,
    now: Date = this.clock.now(),
  ): Promise<{ entryId: string; post: FeedPost; revealsAt: Date }> {
    const cycle = await this.prisma.contestCycle.findUnique({
      where: { monthKey: monthKeyOf(now) },
      select: { id: true, monthKey: true },
    });
    const schedule = cycle?.monthKey ? this.scheduleOf(cycle.monthKey) : null;
    if (!cycle || !schedule || !isWithinFinalUploadWindow(schedule.final, now)) {
      throw conflict(CONTEST_FINAL_UPLOAD_CLOSED_CODE, 'The final upload window is not open.');
    }

    const [rounds, winner, round4] = await Promise.all([
      this.prisma.contestRound.findMany({ where: { cycleId: cycle.id, weekNumber: { lte: 3 } }, select: { status: true } }),
      this.prisma.contestRoundWinner.findFirst({
        where: { userId, round: { cycleId: cycle.id, weekNumber: { lte: 3 } } },
        select: { id: true },
      }),
      this.prisma.contestRound.findUnique({
        where: { cycleId_weekNumber: { cycleId: cycle.id, weekNumber: 4 } },
        select: { id: true, status: true },
      }),
    ]);
    const finalistsKnown = rounds.length === 3 && rounds.every((r) => r.status === 'judged');
    // Only the weekly winners can enter the final.
    if (!finalistsKnown || !winner || !round4) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: CONTEST_NOT_FINALIST_CODE,
        message: 'Only this month’s finalists can enter the final.',
      });
    }

    try {
      let entryId = '';
      const post = await this.feed.createPost(
        userId,
        { contentText: dto.contentText, mediaIds: [dto.mediaId] },
        {
          singleVideoOnly: true,
          // Hidden from everyone but its author until the reveal, and not a normal Community-feed
          // post until the pin is removed at the end of the month.
          visibleFrom: schedule.final.revealAt,
          communityFeedFrom: schedule.final.monthEndAt,
          inTransaction: async (tx, created) => {
            await tx.$queryRaw`SELECT 1 FROM "ContestRound" WHERE "id" = ${round4.id} FOR SHARE`;
            const fresh = await tx.contestRound.findUniqueOrThrow({
              where: { id: round4.id },
              select: { status: true },
            });
            if (fresh.status !== 'open') {
              throw conflict(CONTEST_FINAL_UPLOAD_CLOSED_CODE, 'The final upload window is not open.');
            }
            const entry = await tx.contestEntry.create({
              data: {
                cycleId: cycle.id,
                roundId: round4.id,
                postId: created.id,
                userId,
                submittedAt: now,
                pinnedUntil: schedule.final.monthEndAt,
              },
              select: { id: true },
            });
            entryId = entry.id;
          },
        },
      );
      return { entryId, post, revealsAt: schedule.final.revealAt };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw conflict('contest_already_entered', 'You have already uploaded your final entry.');
      }
      throw err;
    }
  }

  // -------------------------------------------------------------------------------------------
  // GET /contest/rounds/:roundId/entries -- the entries of one round
  // -------------------------------------------------------------------------------------------
  async listRoundEntries(
    roundId: string,
    userId: string,
    query: FeedQueryDto,
    now: Date = this.clock.now(),
  ): Promise<ContestRoundEntriesResponse> {
    const round = await this.prisma.contestRound.findUnique({
      where: { id: roundId },
      include: { cycle: { include: CYCLE_GRAPH_INCLUDE } },
    });
    if (!round) throw new NotFoundException('Contest round not found');

    const graph = round.cycle as unknown as CycleGraph;
    const parts = await this.readModel.build(graph, now, 'public');
    const roundSummary = parts.rounds.find((r) => r.id === roundId)!;
    const limit = Math.min(query.limit ?? FEED_DEFAULT_PAGE_SIZE, FEED_MAX_PAGE_SIZE);

    // The authors of contest entries follow the same visibility rules as feed posts: an inactive
    // account's content is hidden, and a block hides content in both directions.
    const base: Prisma.ContestEntryWhereInput = {
      roundId,
      user: { is: { AND: [{ accountStatus: { in: ['active', 'deleted'] } }, notBlockedWith(userId)] } },
      // A final entry is a 404 to everyone but its author until the reveal.
      // ...and so is any entry whose uploaded media is not all approved yet (Decision Log #419 item 5/7).
      post: { is: visibleToViewer(userId, now) },
    };

    let rows: EntryViewRow[];
    let nextCursor: string | null = null;
    if (round.weekNumber === 4) {
      rows = await this.prisma.contestEntry.findMany({
        where: base,
        orderBy: [{ finalRank: 'asc' }, { submittedAt: 'asc' }, { id: 'asc' }],
        take: 50,
        select: ENTRY_VIEW_SELECT,
      });
    } else if (round.forfeited) {
      rows = [];
    } else if (round.status === 'open') {
      // Phase 1: every entry, newest first, paged.
      const cursorFilter: Prisma.ContestEntryWhereInput = query.cursor
        ? (() => {
            const c = decodeFeedCursor(query.cursor);
            return { OR: [{ submittedAt: { lt: c.createdAt } }, { submittedAt: c.createdAt, id: { lt: c.id } }] };
          })()
        : {};
      const page = await this.prisma.contestEntry.findMany({
        where: { AND: [base, cursorFilter] },
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: ENTRY_VIEW_SELECT,
      });
      const hasMore = page.length > limit;
      rows = hasMore ? page.slice(0, limit) : page;
      const last = rows[rows.length - 1];
      nextCursor = hasMore && last ? encodeFeedCursor({ createdAt: last.submittedAt, id: last.id }) : null;
    } else {
      // Phase 2 and after: only the top 10, best Phase 1 rank first (or by weekly position once decided).
      rows = await this.prisma.contestEntry.findMany({
        where: { AND: [base, { qualified: true }] },
        orderBy: [{ phase1Rank: 'asc' }, { id: 'asc' }],
        select: ENTRY_VIEW_SELECT,
      });
      if (round.status === 'judged') {
        rows.sort((a, b) => (a.winner?.position ?? 99) - (b.winner?.position ?? 99) || (a.phase1Rank ?? 99) - (b.phase1Rank ?? 99));
      }
    }

    const voting = round.weekNumber <= 3 && round.status !== 'open' && !round.forfeited;
    const [counts, mine] = await Promise.all([
      voting && rows.length
        ? this.prisma.contestVote.groupBy({
            by: ['entryId'],
            where: { roundId, entryId: { in: rows.map((r) => r.id) }, voter: CONTEST_ELIGIBLE_USER },
            _count: { _all: true },
          })
        : Promise.resolve([] as { entryId: string; _count: { _all: number } }[]),
      round.weekNumber <= 3
        ? this.prisma.contestVote.findUnique({
            where: { roundId_voterId: { roundId, voterId: userId } },
            select: { entryId: true },
          })
        : Promise.resolve(null),
    ]);
    const countByEntry = new Map(counts.map((c) => [c.entryId, c._count._all]));

    return {
      round: roundSummary,
      calendarState: parts.calendarState,
      items: rows.map((r) => this.toEntryView(r, now, voting ? (countByEntry.get(r.id) ?? 0) : null, mine?.entryId === r.id)),
      nextCursor,
      callerVote: mine?.entryId ?? null,
    };
  }

  private toEntryView(row: EntryViewRow, now: Date, voteCount: number | null, votedByCaller: boolean): ContestEntryView {
    return {
      entryId: row.id,
      roundId: row.roundId,
      weekNumber: row.round.weekNumber,
      kind: row.round.weekNumber === 4 ? 'final' : 'weekly',
      entrant: { userId: row.userId, publicName: resolvePublicName(row.user) },
      post: row.post,
      submittedAt: row.submittedAt,
      qualified: row.qualified,
      phase1Rank: row.phase1Rank,
      voteCount,
      votedByCaller,
      position: row.winner?.position ?? null,
      pinned: this.isPinned(row, now),
    };
  }

  private isPinned(row: { pinnedUntil: Date | null; pinRemovedAt: Date | null }, now: Date): boolean {
    return row.pinRemovedAt === null && row.pinnedUntil !== null && row.pinnedUntil.getTime() > now.getTime();
  }

  // -------------------------------------------------------------------------------------------
  // GET /contest/users/:userId/pinned-entry -- the entry pinned on a user's profile
  // -------------------------------------------------------------------------------------------
  // The most recent entry still pinned (from submission until 00:00 London on the 1st, #404/#406).
  // The post itself is fetched with GET /posts/:id, which applies the visibility and block rules:
  // a final entry is not returned to anyone but its author before the reveal, so this endpoint does
  // not reveal that one exists either.
  async getPinnedEntry(targetUserId: string, viewerId: string, now: Date = this.clock.now()): Promise<PinnedEntryResponse> {
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { accountStatus: true } });
    if (!target || target.accountStatus !== 'active') return { entry: null };
    if (targetUserId !== viewerId && (await hasBlockBetween(this.prisma, viewerId, targetUserId))) {
      return { entry: null };
    }
    const entry = await this.prisma.contestEntry.findFirst({
      where: {
        userId: targetUserId,
        pinRemovedAt: null,
        pinnedUntil: { gt: now },
        post: { is: visibleToViewer(viewerId, now) },
      },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      select: { id: true, postId: true, pinnedUntil: true, round: { select: { weekNumber: true } } },
    });
    if (!entry) return { entry: null };
    return {
      entry: {
        entryId: entry.id,
        kind: entry.round.weekNumber === 4 ? 'final' : 'weekly',
        weekNumber: entry.round.weekNumber,
        pinnedUntil: entry.pinnedUntil,
        postId: entry.postId,
      },
    };
  }

  // -------------------------------------------------------------------------------------------

  private scheduleOf(monthKey: string) {
    return buildContestScheduleForKey(monthKey);
  }

  private p2002Target(err: Prisma.PrismaClientKnownRequestError): string[] {
    const target = err.meta?.target;
    if (Array.isArray(target)) return target.map(String);
    if (typeof target === 'string') return [target];
    return [];
  }
}
