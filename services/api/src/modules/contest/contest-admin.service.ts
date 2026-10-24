import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { ADMIN_ACTION_LOG_ACTIONS, ADMIN_ACTION_LOG_TARGET_TYPES } from '../admin-action-log/admin-action-log.constants';
import { AdminActionLogService } from '../admin-action-log/admin-action-log.service';
import { PUBLIC_NAME_SELECT, resolvePublicName } from '../users/public-name.util';
import { CONTEST_ELIGIBLE_USER } from './contest-eligibility';
import { computeEditability } from './contest-editability.util';
import {
  CYCLE_GRAPH_INCLUDE,
  ContestReadModel,
  CycleGraph,
  WITHDRAWN_CONSENT_ADMIN_PLACEHOLDER,
} from './contest-read-model.service';
import { buildContestSchedule, ContestSchedule, monthKeyOf, parseMonthKey } from './contest-schedule.util';
import { CreateCycleDto } from './dto/create-cycle.dto';
import { UpdateCycleDto } from './dto/update-cycle.dto';
import {
  AdminContestCycleDetailResponse,
  AdminContestCycleListItem,
  AdminContestCycleListResponse,
  AdminContestEntry,
  AdminContestRoundDetail,
  AdminContestSettings,
  AdminCurrentContestResponse,
} from './contest.types';

export const CONTEST_MONTH_STARTED_CODE = 'contest_month_started';
export const CONTEST_MONTH_TAKEN_CODE = 'contest_month_taken';
export const CONTEST_FIELD_LOCKED_CODE = 'contest_field_locked';
export const CONTEST_LEGACY_CYCLE_CODE = 'contest_legacy_cycle';

const DEFAULT_WEEKLY_POINTS: [number, number, number] = [500, 300, 150];
const DEFAULT_MONTHLY_POINTS: [number, number, number] = [2000, 1200, 600];

const ADMIN_ENTRY_SELECT = {
  id: true,
  cycleId: true,
  roundId: true,
  userId: true,
  submittedAt: true,
  qualified: true,
  phase1Tally: true,
  phase1Rank: true,
  finalTally: true,
  finalRank: true,
  round: { select: { weekNumber: true } },
  user: { select: PUBLIC_NAME_SELECT },
  post: {
    select: { id: true, contentText: true, mediaUrls: true, createdAt: true, likeCount: true, commentCount: true },
  },
  winner: { select: { position: true } },
} satisfies Prisma.ContestEntrySelect;
type AdminEntryRow = Prisma.ContestEntryGetPayload<{ select: typeof ADMIN_ENTRY_SELECT }>;

/**
 * The Admin Console's side of the Contest (B-091; Decision Log #381, #399, #402; spec sections 4, 4a).
 *
 * An admin CREATES a contest for a London calendar month and EDITS it within the locking rules; that
 * is all. There is no judging, no "open the final", no "crown": those endpoints are gone because
 * contests are not admin-judged (spec section 3). Every date is derived from the month and cannot be
 * changed.
 */
@Injectable()
export class ContestAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readModel: ContestReadModel,
    private readonly auditLog: AdminActionLogService,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  // -------------------------------------------------------------------------------------------
  // POST /admin/contest/cycles
  // -------------------------------------------------------------------------------------------
  async createCycle(adminId: string, dto: CreateCycleDto, now: Date = this.clock.now()): Promise<AdminContestCycleDetailResponse> {
    const parsed = parseMonthKey(dto.month);
    if (!parsed) throw new BadRequestException('month must be a valid YYYY-MM');
    const schedule = buildContestSchedule(parsed.year, parsed.month);

    // A contest cannot be created once its first week has opened: weeks 1-3 would have started
    // without it, and dates are never editable.
    if (now.getTime() >= schedule.weeks[0].opensAt.getTime()) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: CONTEST_MONTH_STARTED_CODE,
        message: 'That month’s contest would already have started. Choose a later month.',
      });
    }

    const weeks = [...dto.weeks].sort((a, b) => a.weekNumber - b.weekNumber);
    if (weeks.map((w) => w.weekNumber).join(',') !== '1,2,3') {
      throw new BadRequestException('weeks must cover exactly weeks 1, 2 and 3');
    }
    const weekly = dto.placementPoints?.weekly ?? DEFAULT_WEEKLY_POINTS;
    const monthly = dto.placementPoints?.monthly ?? DEFAULT_MONTHLY_POINTS;

    try {
      const cycle = await this.prisma.contestCycle.create({
        data: {
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          monthKey: schedule.monthKey,
          status: 'active',
          startsAt: schedule.weeks[0].opensAt,
          endsAt: schedule.final.monthEndAt,
          minimumTally: dto.minimumTally,
          weeklyPoints1: weekly[0],
          weeklyPoints2: weekly[1],
          weeklyPoints3: weekly[2],
          monthlyPoints1: monthly[0],
          monthlyPoints2: monthly[1],
          monthlyPoints3: monthly[2],
          followersExcludedWeek4: dto.followersExcludedWeek4 ?? false,
          exposureTolerancePercent: dto.exposureTolerancePercent ?? 10,
          exposureViewerDailyCap: dto.exposureViewerDailyCap ?? 3,
          rounds: {
            create: [
              ...schedule.weeks.map((w) => {
                const input = weeks[w.weekNumber - 1];
                return {
                  weekNumber: w.weekNumber,
                  status: 'open',
                  opensAt: w.opensAt,
                  closesAt: w.votesLockAt,
                  task: input.task.trim(),
                  viewWatchLimitSeconds: input.viewWatchLimitSeconds,
                };
              }),
              {
                weekNumber: 4,
                status: 'open',
                opensAt: schedule.final.opensAt,
                closesAt: schedule.final.revealAt,
                task: dto.finalTask?.trim() || null,
                viewWatchLimitSeconds: null,
              },
            ],
          },
        },
        select: { id: true },
      });
      await this.auditLog.record(
        adminId,
        ADMIN_ACTION_LOG_ACTIONS.CONTEST_CYCLE_CREATED,
        ADMIN_ACTION_LOG_TARGET_TYPES.CONTEST_CYCLE,
        cycle.id,
        `month ${schedule.monthKey}; title "${dto.title.trim()}"`,
      );
      return this.getCycleByIdForAdmin(cycle.id, now);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          code: CONTEST_MONTH_TAKEN_CODE,
          message: `A contest already exists for ${schedule.monthKey}.`,
        });
      }
      throw err;
    }
  }

  // -------------------------------------------------------------------------------------------
  // PATCH /admin/contest/cycles/:id
  // -------------------------------------------------------------------------------------------
  async updateCycle(
    adminId: string,
    cycleId: string,
    dto: UpdateCycleDto,
    now: Date = this.clock.now(),
  ): Promise<AdminContestCycleDetailResponse> {
    const cycle = await this.prisma.contestCycle.findUnique({ where: { id: cycleId }, include: { rounds: true } });
    if (!cycle) throw new NotFoundException('Contest cycle not found');
    if (!cycle.monthKey) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: CONTEST_LEGACY_CYCLE_CODE,
        message: 'This contest pre-dates the self-running Contest and cannot be edited.',
      });
    }
    const parsed = parseMonthKey(cycle.monthKey)!;
    const schedule = buildContestSchedule(parsed.year, parsed.month);
    const editable = computeEditability(schedule, now);

    // ---- which fields does this request actually CHANGE? ------------------------------------
    // A form that posts the whole object back is fine: a locked field only counts as a change if its
    // value differs from what is stored.
    const data: Prisma.ContestCycleUpdateInput = {};
    const locked: string[] = [];
    const changed: string[] = [];
    const track = (name: string, isEditable: boolean, differs: boolean, apply: () => void) => {
      if (!differs) return;
      if (!isEditable) {
        locked.push(name);
        return;
      }
      changed.push(name);
      apply();
    };

    if (dto.title !== undefined) {
      track('title', editable.title, dto.title.trim() !== cycle.title, () => (data.title = dto.title!.trim()));
    }
    if (dto.description !== undefined) {
      const next = dto.description.trim() || null;
      track('description', editable.description, next !== cycle.description, () => (data.description = next));
    }
    if (dto.minimumTally !== undefined) {
      track('minimumTally', editable.minimumTally, dto.minimumTally !== cycle.minimumTally, () => (data.minimumTally = dto.minimumTally));
    }
    if (dto.placementPoints) {
      const w = dto.placementPoints.weekly;
      const m = dto.placementPoints.monthly;
      if (w) {
        const differs = w[0] !== cycle.weeklyPoints1 || w[1] !== cycle.weeklyPoints2 || w[2] !== cycle.weeklyPoints3;
        track('placementPoints.weekly', editable.placementPoints, differs, () => {
          data.weeklyPoints1 = w[0];
          data.weeklyPoints2 = w[1];
          data.weeklyPoints3 = w[2];
        });
      }
      if (m) {
        const differs = m[0] !== cycle.monthlyPoints1 || m[1] !== cycle.monthlyPoints2 || m[2] !== cycle.monthlyPoints3;
        track('placementPoints.monthly', editable.placementPoints, differs, () => {
          data.monthlyPoints1 = m[0];
          data.monthlyPoints2 = m[1];
          data.monthlyPoints3 = m[2];
        });
      }
    }
    if (dto.followersExcludedWeek4 !== undefined) {
      track(
        'followersExcludedWeek4',
        editable.followersExcludedWeek4,
        dto.followersExcludedWeek4 !== cycle.followersExcludedWeek4,
        () => (data.followersExcludedWeek4 = dto.followersExcludedWeek4),
      );
    }
    if (dto.exposureTolerancePercent !== undefined) {
      track(
        'exposureTolerancePercent',
        editable.exposureTolerancePercent,
        dto.exposureTolerancePercent !== cycle.exposureTolerancePercent,
        () => (data.exposureTolerancePercent = dto.exposureTolerancePercent),
      );
    }
    if (dto.exposureViewerDailyCap !== undefined) {
      track(
        'exposureViewerDailyCap',
        editable.exposureViewerDailyCap,
        dto.exposureViewerDailyCap !== cycle.exposureViewerDailyCap,
        () => (data.exposureViewerDailyCap = dto.exposureViewerDailyCap),
      );
    }

    // Per-round fields.
    const roundUpdates: { id: string; data: Prisma.ContestRoundUpdateInput }[] = [];
    const roundOf = (weekNumber: number) => cycle.rounds.find((r) => r.weekNumber === weekNumber);
    const seenWeeks = new Set<number>();
    for (const w of dto.weeks ?? []) {
      if (seenWeeks.has(w.weekNumber)) throw new BadRequestException(`week ${w.weekNumber} appears twice`);
      seenWeeks.add(w.weekNumber);
      const round = roundOf(w.weekNumber);
      if (!round) continue;
      const roundData: Prisma.ContestRoundUpdateInput = {};
      if (w.task !== undefined) {
        track(
          `weeks[${w.weekNumber}].task`,
          editable.taskByWeek[w.weekNumber],
          w.task.trim() !== (round.task ?? ''),
          () => (roundData.task = w.task!.trim()),
        );
      }
      if (w.viewWatchLimitSeconds !== undefined) {
        track(
          `weeks[${w.weekNumber}].viewWatchLimitSeconds`,
          editable.watchLimitByWeek[w.weekNumber],
          w.viewWatchLimitSeconds !== round.viewWatchLimitSeconds,
          () => (roundData.viewWatchLimitSeconds = w.viewWatchLimitSeconds),
        );
      }
      if (Object.keys(roundData).length) roundUpdates.push({ id: round.id, data: roundData });
    }
    if (dto.finalTask !== undefined) {
      const round4 = roundOf(4);
      if (round4) {
        const roundData: Prisma.ContestRoundUpdateInput = {};
        track('finalTask', editable.taskByWeek[4], dto.finalTask.trim() !== (round4.task ?? ''), () => {
          roundData.task = dto.finalTask!.trim() || null;
        });
        if (Object.keys(roundData).length) roundUpdates.push({ id: round4.id, data: roundData });
      }
    }

    if (locked.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: CONTEST_FIELD_LOCKED_CODE,
        message: 'Some of these fields can no longer be edited.',
        fields: locked,
      });
    }

    if (changed.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        if (Object.keys(data).length) await tx.contestCycle.update({ where: { id: cycleId }, data });
        for (const u of roundUpdates) await tx.contestRound.update({ where: { id: u.id }, data: u.data });
      });
      await this.auditLog.record(
        adminId,
        ADMIN_ACTION_LOG_ACTIONS.CONTEST_CYCLE_UPDATED,
        ADMIN_ACTION_LOG_TARGET_TYPES.CONTEST_CYCLE,
        cycleId,
        `changed: ${changed.join(', ')}`,
      );
    }
    return this.getCycleByIdForAdmin(cycleId, now);
  }

  // -------------------------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------------------------

  // GET /admin/contest/cycles -- every contest, newest month first.
  async listCyclesForAdmin(now: Date = this.clock.now()): Promise<AdminContestCycleListResponse> {
    const cycles = await this.prisma.contestCycle.findMany({
      orderBy: [{ monthKey: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      include: {
        ...CYCLE_GRAPH_INCLUDE,
        rounds: { ...CYCLE_GRAPH_INCLUDE.rounds, include: { ...CYCLE_GRAPH_INCLUDE.rounds.include, _count: { select: { entries: true } } } },
      },
    });
    const items: AdminContestCycleListItem[] = [];
    for (const cycle of cycles) {
      const parts = await this.readModel.build(cycle as unknown as CycleGraph, now, 'admin');
      items.push({
        cycle: parts.cycle,
        settings: this.settingsOf(cycle),
        phase: parts.phase,
        calendarState: parts.calendarState,
        rounds: parts.rounds.map((r) => ({
          ...r,
          entryCount: cycle.rounds.find((row) => row.id === r.id)?._count.entries ?? 0,
        })),
        weeklyWinners: parts.weeklyWinners,
        monthlyStandings: parts.monthlyStandings,
        finalOutcome: parts.finalOutcome,
      });
    }
    return { items };
  }

  // GET /admin/contest/cycles/:id
  async getCycleByIdForAdmin(cycleId: string, now: Date = this.clock.now()): Promise<AdminContestCycleDetailResponse> {
    const cycle = await this.prisma.contestCycle.findUnique({ where: { id: cycleId }, include: CYCLE_GRAPH_INCLUDE });
    if (!cycle) throw new NotFoundException('Contest cycle not found');
    return this.detail(cycle, now);
  }

  // GET /admin/contest/current -- the contest of the current London month, else the latest past one,
  // else the nearest upcoming one; all-null only when none has ever been created.
  async getCurrentContestForAdmin(now: Date = this.clock.now()): Promise<AdminCurrentContestResponse> {
    const key = monthKeyOf(now);
    const cycle =
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
      }));
    if (!cycle) {
      return {
        cycle: null,
        settings: null,
        editable: null,
        phase: null,
        calendarState: null,
        rounds: [],
        weeklyWinners: [],
        finalists: [],
        forfeitedWeeks: [],
        finalRanking: null,
        monthlyStandings: [],
        finalOutcome: null,
      };
    }
    return this.detail(cycle, now);
  }

  private async detail(cycle: CycleGraph, now: Date): Promise<AdminContestCycleDetailResponse> {
    const parts = await this.readModel.build(cycle, now, 'admin');
    const entries = await this.prisma.contestEntry.findMany({
      where: { cycleId: cycle.id },
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      select: ADMIN_ENTRY_SELECT,
    });
    const counts = entries.length
      ? await this.prisma.contestVote.groupBy({
          by: ['entryId'],
          where: { round: { cycleId: cycle.id }, voter: CONTEST_ELIGIBLE_USER },
          _count: { _all: true },
        })
      : [];
    const voteCount = new Map(counts.map((c) => [c.entryId, c._count._all]));
    const withdrawn = await this.readModel.getWithdrawnConsentUserIds(entries.map((e) => e.userId));

    const schedule: ContestSchedule | null = parts.schedule;
    const byRound = new Map<string, AdminEntryRow[]>();
    for (const e of entries) {
      const list = byRound.get(e.roundId) ?? [];
      list.push(e);
      byRound.set(e.roundId, list);
    }

    const rounds: AdminContestRoundDetail[] = parts.rounds.map((r) => {
      const rows = byRound.get(r.id) ?? [];
      return {
        ...r,
        entryCount: rows.length,
        entries: rows.map((e) => this.toAdminEntry(e, voteCount.get(e.id) ?? 0, withdrawn.has(e.userId))),
      };
    });

    return {
      cycle: parts.cycle,
      settings: this.settingsOf(cycle),
      editable: schedule ? computeEditability(schedule, now) : this.noEdits(),
      phase: parts.phase,
      calendarState: parts.calendarState,
      rounds,
      weeklyWinners: parts.weeklyWinners,
      finalists: parts.finalists,
      forfeitedWeeks: parts.forfeitedWeeks,
      finalRanking: parts.finalRanking,
      monthlyStandings: parts.monthlyStandings,
      finalOutcome: parts.finalOutcome,
    };
  }

  private settingsOf(cycle: {
    minimumTally: number | null;
    weeklyPoints1: number;
    weeklyPoints2: number;
    weeklyPoints3: number;
    monthlyPoints1: number;
    monthlyPoints2: number;
    monthlyPoints3: number;
    followersExcludedWeek4: boolean;
    exposureTolerancePercent: number;
    exposureViewerDailyCap: number;
  }): AdminContestSettings {
    return {
      minimumTally: cycle.minimumTally,
      weeklyPoints: [cycle.weeklyPoints1, cycle.weeklyPoints2, cycle.weeklyPoints3],
      monthlyPoints: [cycle.monthlyPoints1, cycle.monthlyPoints2, cycle.monthlyPoints3],
      followersExcludedWeek4: cycle.followersExcludedWeek4,
      exposureTolerancePercent: cycle.exposureTolerancePercent,
      exposureViewerDailyCap: cycle.exposureViewerDailyCap,
    };
  }

  // A legacy cycle: nothing about it is editable.
  private noEdits() {
    return {
      beforeLaunch: false,
      title: false,
      description: false,
      minimumTally: false,
      placementPoints: false,
      followersExcludedWeek4: false,
      exposureTolerancePercent: false,
      exposureViewerDailyCap: false,
      taskByWeek: {},
      watchLimitByWeek: {},
    };
  }

  // Decision Log #339: a withdrawn-consent entrant keeps the row (an admin still reconciles
  // rounds from it) but loses the name and the post content.
  private toAdminEntry(row: AdminEntryRow, votes: number, withdrawn: boolean): AdminContestEntry {
    return {
      entryId: row.id,
      kind: row.round.weekNumber === 4 ? 'final' : 'weekly',
      submittedAt: row.submittedAt,
      entrant: {
        userId: row.userId,
        publicName: withdrawn ? WITHDRAWN_CONSENT_ADMIN_PLACEHOLDER : resolvePublicName(row.user),
      },
      post: {
        id: row.post.id,
        contentText: withdrawn ? WITHDRAWN_CONSENT_ADMIN_PLACEHOLDER : row.post.contentText,
        mediaUrls: withdrawn ? [WITHDRAWN_CONSENT_ADMIN_PLACEHOLDER] : row.post.mediaUrls,
        createdAt: row.post.createdAt,
        likeCount: row.post.likeCount,
        commentCount: row.post.commentCount,
      },
      qualified: row.qualified,
      phase1Tally: row.phase1Tally,
      phase1Rank: row.phase1Rank,
      voteCount: votes,
      finalTally: row.finalTally,
      finalRank: row.finalRank,
      position: row.winner?.position ?? null,
    };
  }
}
