import { POST_MEDIA_ALL_APPROVED } from '../post-media/post-media-visibility.util';
import { ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { PUBLIC_NAME_SELECT, resolvePublicName } from '../users/public-name.util';
import { blockedPairWhere } from '../block/block.util';
import { CONTEST_ELIGIBLE_USER } from './contest-eligibility';
import {
  CAROUSEL_DEFAULT_LIMIT,
  CAROUSEL_MAX_LIMIT,
  ExposureStatus,
  computeExposureSpread,
  londonDayKey,
  orderByBalancedRotation,
} from './contest-exposure.util';
import { buildContestScheduleForKey, ContestSchedule, monthKeyOf } from './contest-schedule.util';
import { RecordImpressionDto } from './dto/record-impression.dto';

// Code of the 409 a client branches on: there is no live final week right now.
export const CONTEST_EXPOSURE_NOT_LIVE_CODE = 'contest_exposure_not_live';

/** One tile of the Community-feed "Final week" carousel. Deliberately NO counts of any kind. */
export interface FinalWeekCarouselItem {
  entryId: string;
  postId: string;
  finalist: { userId: string; publicName: string };
  post: { id: string; contentText: string; mediaUrls: string[]; createdAt: Date };
}

export interface FinalWeekCarouselResponse {
  /** false outside a live final week (and for a restricted viewer): the client hides the module. */
  live: boolean;
  items: FinalWeekCarouselItem[];
}

export interface RecordImpressionResponse {
  /** true when this event is (now or already) a counted impression; false when it is validly ignored. */
  counted: boolean;
}

export interface AdminExposureEntry {
  entryId: string;
  finalist: { userId: string; publicName: string };
  /** false: the author is no longer eligible, so the video is out of the rotation and out of the mean. */
  inRotation: boolean;
  impressions: number;
  /** Against the tolerance band around the mean; null when the video is not in the rotation. */
  status: ExposureStatus | null;
  /** Signed deviation from the mean, percent of the mean; null when the mean is 0 or not in rotation. */
  deviationPercent: number | null;
}

export interface AdminExposureResponse {
  cycleId: string;
  title: string;
  monthKey: string | null;
  settings: { tolerancePercent: number; viewerDailyCap: number };
  /** true while the final week is live (reveal <= now < month end). */
  live: boolean;
  revealed: boolean;
  /** 'live': counted from the per-viewer rows; 'final_totals': the per-entry totals kept at the crown. */
  source: 'live' | 'final_totals';
  finalistCount: number;
  mean: number;
  lowerBound: number;
  upperBound: number;
  min: number;
  max: number;
  outsideTolerance: number;
  entries: AdminExposureEntry[];
}

interface LiveFinal {
  cycleId: string;
  round4Id: string;
  tolerancePercent: number;
  viewerDailyCap: number;
  schedule: ContestSchedule;
}

const LIVE_ENTRY_SELECT = {
  id: true,
  postId: true,
  userId: true,
  user: { select: PUBLIC_NAME_SELECT },
  post: { select: { id: true, contentText: true, mediaUrls: true, createdAt: true } },
} satisfies Prisma.ContestEntrySelect;

/**
 * The Week-4 finalist exposure engine (B-092; Decision Log #388, #400, #403 item 11, #404 items 6
 * and 15, #405 item 7, #406 item 6; docs/contest-spec.md section 10b).
 *
 * Goal: every finalist gets comparable community exposure, independent of follower count, prior
 * engagement or upload time. So the carousel is ordered by IMPRESSIONS ALREADY SERVED (the video that
 * has had the fewest goes first, within a tolerance), then shuffled per viewer per day inside each
 * band -- never by engagement, rank, follower count or recency. No impression count is ever returned
 * to a user; only the admin distribution view (aggregates, no per-viewer data) shows counts.
 *
 * "Live" is a function of the Europe/London CLOCK -- from the reveal (00:00 on day 25) to the end of
 * the month (00:00 on the 1st, exclusive) -- not of any status column, so a late lifecycle tick can
 * neither open nor extend the window.
 */
@Injectable()
export class ContestExposureService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  // -------------------------------------------------------------------------------------------
  // GET /contest/final-week/carousel
  // -------------------------------------------------------------------------------------------
  async getCarousel(
    viewerId: string,
    limit: number = CAROUSEL_DEFAULT_LIMIT,
    now: Date = this.clock.now(),
  ): Promise<FinalWeekCarouselResponse> {
    const notLive: FinalWeekCarouselResponse = { live: false, items: [] };
    const live = await this.resolveLiveFinal(now);
    if (!live) return notLive;

    // The audience is "all logged-in accounts that are not restricted" (spec 10b). A restricted
    // viewer simply gets no module -- a 403 on a read the feed makes on every load would be noise.
    if (await this.isRestricted(viewerId)) return notLive;

    // Every live finalist video: revealed, author still eligible. NOT filtered by this viewer's
    // blocks, because the tolerance is defined against the whole field (the mean must not depend on
    // who is asking).
    const liveEntries = await this.prisma.contestEntry.findMany({
      where: {
        roundId: live.round4Id,
        // Revealed AND every uploaded file approved (Decision Log #419): an unapproved video is never exposed.
        post: { is: { AND: [{ OR: [{ visibleFrom: null }, { visibleFrom: { lte: now } }] }, POST_MEDIA_ALL_APPROVED] } },
        user: { is: CONTEST_ELIGIBLE_USER },
      },
      select: LIVE_ENTRY_SELECT,
    });
    if (liveEntries.length === 0) return { live: true, items: [] };

    const ids = liveEntries.map((e) => e.id);
    const dayKey = londonDayKey(now);
    const authorIds = [...new Set(liveEntries.map((e) => e.userId))];
    const [totals, today, blocks] = await Promise.all([
      this.prisma.contestImpression.groupBy({ by: ['entryId'], where: { entryId: { in: ids } }, _count: { _all: true } }),
      this.prisma.contestImpression.groupBy({
        by: ['entryId'],
        where: { entryId: { in: ids }, viewerId, dayKey },
        _count: { _all: true },
      }),
      this.prisma.block.findMany({
        where: {
          OR: [
            { blockerId: viewerId, blockedId: { in: authorIds } },
            { blockedId: viewerId, blockerId: { in: authorIds } },
          ],
        },
        select: { blockerId: true, blockedId: true },
      }),
    ]);

    const countOf = new Map(totals.map((t) => [t.entryId, t._count._all]));
    const seenToday = new Map(today.map((t) => [t.entryId, t._count._all]));
    const blockedAuthors = new Set(blocks.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId)));
    const mean = ids.reduce((sum, id) => sum + (countOf.get(id) ?? 0), 0) / ids.length;

    // The viewer never sees their own entry here, a blocked pair never sees each other's, and a
    // video this viewer has already seen N times today is out for the rest of the day.
    const candidates = liveEntries.filter(
      (e) => e.userId !== viewerId && !blockedAuthors.has(e.userId) && (seenToday.get(e.id) ?? 0) < live.viewerDailyCap,
    );
    const order = orderByBalancedRotation(
      candidates.map((e) => ({ entryId: e.id, impressions: countOf.get(e.id) ?? 0 })),
      {
        meanImpressions: mean,
        tolerancePercent: live.tolerancePercent,
        // Seeded per viewer per day: stable within a session, different between viewers and days.
        seed: `${viewerId}:${live.cycleId}:${dayKey}`,
      },
    );

    const byId = new Map(candidates.map((e) => [e.id, e]));
    const take = Math.min(Math.max(1, limit), CAROUSEL_MAX_LIMIT);
    const items = order.slice(0, take).map((id): FinalWeekCarouselItem => {
      const e = byId.get(id)!;
      return {
        entryId: e.id,
        postId: e.postId,
        finalist: { userId: e.userId, publicName: resolvePublicName(e.user) },
        post: e.post,
      };
    });
    return { live: true, items };
  }

  // -------------------------------------------------------------------------------------------
  // POST /contest/entries/:entryId/impression
  // -------------------------------------------------------------------------------------------
  async recordImpression(
    viewerId: string,
    entryId: string,
    dto: RecordImpressionDto,
    now: Date = this.clock.now(),
  ): Promise<RecordImpressionResponse> {
    const live = await this.resolveLiveFinal(now);
    if (!live) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: CONTEST_EXPOSURE_NOT_LIVE_CODE,
        message: 'There is no live final week.',
      });
    }

    // Unknown, hidden, not-a-final-entry, ineligible author and blocked pair are ALL the same 404:
    // nothing here tells a caller that a hidden or blocked entry exists.
    const entry = await this.prisma.contestEntry.findFirst({
      where: {
        id: entryId,
        roundId: live.round4Id,
        // Revealed AND every uploaded file approved (Decision Log #419): an unapproved video is never exposed.
        post: { is: { AND: [{ OR: [{ visibleFrom: null }, { visibleFrom: { lte: now } }] }, POST_MEDIA_ALL_APPROVED] } },
        user: { is: CONTEST_ELIGIBLE_USER },
      },
      select: { id: true, userId: true },
    });
    if (!entry) throw new NotFoundException('Contest entry not found');
    if (entry.userId !== viewerId) {
      const blocked = await this.prisma.block.findFirst({ where: blockedPairWhere(viewerId, entry.userId), select: { id: true } });
      if (blocked) throw new NotFoundException('Contest entry not found');
    }

    // A finalist looking at their own video is not exposure.
    if (entry.userId === viewerId) return { counted: false };

    const dayKey = londonDayKey(now);
    return this.prisma.$transaction(async (tx) => {
      // Serialise one viewer's impressions of one entry for one day, so two concurrent events with
      // different eventIds cannot both pass a cap check that only one of them should.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`impression:${viewerId}:${entryId}:${dayKey}`}))`;

      const existing = await tx.contestImpression.findUnique({
        where: { viewerId_entryId_eventId: { viewerId, entryId, eventId: dto.eventId } },
        select: { id: true },
      });
      if (existing) return { counted: true };

      const seen = await tx.contestImpression.count({ where: { viewerId, entryId, dayKey } });
      if (seen >= live.viewerDailyCap) return { counted: false };

      try {
        await tx.contestImpression.create({
          data: { entryId, viewerId, eventId: dto.eventId, dayKey, occurredAt: now },
        });
      } catch (err) {
        // The advisory lock makes this unreachable for two requests in this process family; a
        // unique violation on the idempotency key still means "this event is already counted".
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return { counted: true };
        throw err;
      }
      return { counted: true };
    });
  }

  // -------------------------------------------------------------------------------------------
  // GET /admin/contest/cycles/:id/exposure -- the impression distribution (admin only)
  // -------------------------------------------------------------------------------------------
  // Aggregates per finalist and the spread against the tolerance. NO per-viewer data: the query
  // never selects a viewerId, and the response has no field that could carry one.
  async getAdminExposure(cycleId: string, now: Date = this.clock.now()): Promise<AdminExposureResponse> {
    const cycle = await this.prisma.contestCycle.findUnique({
      where: { id: cycleId },
      select: {
        id: true,
        title: true,
        monthKey: true,
        status: true,
        exposureTolerancePercent: true,
        exposureViewerDailyCap: true,
      },
    });
    if (!cycle) throw new NotFoundException('Contest cycle not found');

    const schedule = cycle.monthKey ? buildContestScheduleForKey(cycle.monthKey) : null;
    const live = !!schedule && now.getTime() >= schedule.final.revealAt.getTime() && now.getTime() < schedule.final.monthEndAt.getTime();
    const revealed = !!schedule && now.getTime() >= schedule.final.revealAt.getTime();
    const completed = cycle.status === 'completed';

    const entries = await this.prisma.contestEntry.findMany({
      where: { cycleId, round: { is: { weekNumber: 4 } } },
      select: {
        id: true,
        userId: true,
        impressionTotal: true,
        user: { select: PUBLIC_NAME_SELECT },
      },
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
    });

    // After the crown the per-viewer rows are gone: the totals kept on the entries are the record.
    const source: 'live' | 'final_totals' = completed ? 'final_totals' : 'live';
    const liveCounts = !completed && entries.length
      ? await this.prisma.contestImpression.groupBy({
          by: ['entryId'],
          where: { entryId: { in: entries.map((e) => e.id) } },
          _count: { _all: true },
        })
      : [];
    const liveCountOf = new Map(liveCounts.map((c) => [c.entryId, c._count._all]));
    const countOf = (e: { id: string; impressionTotal: number | null }) =>
      completed ? (e.impressionTotal ?? 0) : (liveCountOf.get(e.id) ?? 0);

    // Who is still in the rotation: the same eligibility the carousel applies.
    const eligible = entries.length
      ? new Set(
          (
            await this.prisma.user.findMany({
              where: { id: { in: entries.map((e) => e.userId) }, ...CONTEST_ELIGIBLE_USER },
              select: { id: true },
            })
          ).map((u) => u.id),
        )
      : new Set<string>();

    const inRotation = entries.filter((e) => eligible.has(e.userId));
    const spread = computeExposureSpread(
      inRotation.map((e) => ({ item: e, impressions: countOf(e) })),
      cycle.exposureTolerancePercent,
    );
    const rows: AdminExposureEntry[] = [
      ...spread.rows.map((r): AdminExposureEntry => ({
        entryId: r.item.id,
        finalist: { userId: r.item.userId, publicName: resolvePublicName(r.item.user) },
        inRotation: true,
        impressions: r.impressions,
        status: r.status,
        deviationPercent: r.deviationPercent,
      })),
      ...entries
        .filter((e) => !eligible.has(e.userId))
        .map((e): AdminExposureEntry => ({
          entryId: e.id,
          finalist: { userId: e.userId, publicName: resolvePublicName(e.user) },
          inRotation: false,
          impressions: countOf(e),
          status: null,
          deviationPercent: null,
        })),
    ].sort((a, b) => a.impressions - b.impressions || (a.entryId < b.entryId ? -1 : 1));

    return {
      cycleId: cycle.id,
      title: cycle.title,
      monthKey: cycle.monthKey,
      settings: { tolerancePercent: cycle.exposureTolerancePercent, viewerDailyCap: cycle.exposureViewerDailyCap },
      live,
      revealed,
      source,
      finalistCount: entries.length,
      mean: spread.mean,
      lowerBound: spread.lower,
      upperBound: spread.upper,
      min: spread.min,
      max: spread.max,
      outsideTolerance: spread.outsideTolerance,
      entries: rows,
    };
  }

  // -------------------------------------------------------------------------------------------

  /** The current month's contest, if (and only if) its final week is live by the clock right now. */
  private async resolveLiveFinal(now: Date): Promise<LiveFinal | null> {
    const monthKey = monthKeyOf(now);
    const schedule = buildContestScheduleForKey(monthKey);
    if (!schedule) return null;
    if (now.getTime() < schedule.final.revealAt.getTime() || now.getTime() >= schedule.final.monthEndAt.getTime()) {
      return null;
    }
    const cycle = await this.prisma.contestCycle.findUnique({
      where: { monthKey },
      select: {
        id: true,
        exposureTolerancePercent: true,
        exposureViewerDailyCap: true,
        rounds: { where: { weekNumber: 4 }, select: { id: true } },
      },
    });
    const round4 = cycle?.rounds[0];
    if (!cycle || !round4) return null;
    return {
      cycleId: cycle.id,
      round4Id: round4.id,
      tolerancePercent: cycle.exposureTolerancePercent,
      viewerDailyCap: cycle.exposureViewerDailyCap,
      schedule,
    };
  }

  // The same test GuardianConsentGuard applies, read fresh: a minor is restricted until the
  // guardian has CONFIRMED consent.
  private async isRestricted(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isMinor: true, guardian: { select: { consentStatus: true } } },
    });
    if (!user) return true;
    return user.isMinor && user.guardian?.consentStatus !== 'confirmed';
  }
}
