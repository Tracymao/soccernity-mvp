import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { notBlockedWith } from '../block/block.util';
import { countingWindowFor, loadContestEntryForPost, recordQualifiedView } from '../contest/contest-engagement.util';
import { visibleToViewer } from '../feed/feed.service';
import { awardEngagementPoints } from '../points/engagement-points.util';
import { DEFAULT_POINTS_CAPS, PointsCaps, PointsConfig } from '../points/points-config.service';
import { ViewHeartbeatDto } from './dto/view-heartbeat.dto';
import {
  Beat,
  SESSION_TTL_SECONDS,
  SessionState,
  applyBeat,
  meetsRequirement,
  newSession,
} from './view-session.util';
import { baselineRequiredSeconds, classifyPostMedia, contestRequiredSeconds } from './view-thresholds.util';

// backend/w12-points (B-093; Decision Log #384; docs/contest-spec.md sections 9a, 9b, 9c, 13).
// Server-validated view heartbeats. A viewer's client reports that a post is on screen; the SERVER
// credits only the time it measured itself (view-session.util.ts), and when the credited time meets a
// threshold it fires the outcome ONCE:
//   - the BASELINE view point (the viewer 1 point, the creator 0.25), subject to the points engine's
//     self-exemption, eligibility and daily caps (engagement-points.util.ts); and
//   - the CONTEST view (a ContestEngagement row of kind 'view') when the post is a weeks-1-3 contest
//     entry whose counting window is open, which Phase 1 ranking reads.
//
// WHAT IS STORED ABOUT THE VIEWER (for the DPIA drafter; the report repeats it):
//   Redis, ephemeral, key viewhb:s:<viewerId>:<postId>:<sessionId>, expires 120 s after the last beat:
//     last beat time, last "active" flag, last playhead position, credited seconds, two "done" flags.
//   Redis, 60 s window: a per-viewer beat counter (rate limit).
//   Postgres, only when a threshold is met: the ledger rows (viewer: PointsLedgerEntry given, creator:
//     received) and, for a contest entry, one ContestEngagement row (entry, viewer, 'view', whether the
//     viewer followed the creator at that moment, time). NO dwell seconds, playhead, session id, IP,
//     user agent, device, mute state or scroll position is ever written to Postgres.

export interface ViewHeartbeatResponse {
  /**
   * true when this session has nothing left to earn: the client can stop sending beats for this
   * post. It does NOT say whether a point was awarded (a cap or an ineligible account earns nothing,
   * and the client has no business knowing which).
   */
  done: boolean;
}

// Beats allowed per viewer per minute across all posts (about 4 posts on screen at once at one beat
// per 3 seconds each is 80; the ceiling leaves headroom for a busy feed and stops a flood).
export const MAX_BEATS_PER_MINUTE = 240;
const RATE_WINDOW_SECONDS = 60;
// The per-session lock: two simultaneous beats for ONE session would each be credited the same gap.
const LOCK_PX = 5000;

@Injectable()
export class ViewQualificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
    @Optional() private readonly pointsConfig?: PointsConfig,
  ) {}

  private get caps(): PointsCaps {
    return this.pointsConfig?.caps ?? DEFAULT_POINTS_CAPS;
  }

  async heartbeat(viewerId: string, postId: string, dto: ViewHeartbeatDto): Promise<ViewHeartbeatResponse> {
    await this.enforceRate(viewerId);
    const now = this.clock.now();

    // The post must be one this viewer may see (a block either way, or a final entry before its
    // reveal, is a 404, exactly like a post that does not exist).
    const post = await this.prisma.post.findUnique({
      where: {
        id: postId,
        author: { is: notBlockedWith(viewerId) },
        AND: [visibleToViewer(viewerId, now)],
      },
      select: { id: true, authorId: true, mediaUrls: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    const kind = classifyPostMedia(post.mediaUrls);
    if (kind === 'video' && dto.positionSeconds === undefined) {
      throw new BadRequestException('positionSeconds is required for a video');
    }
    const beat: Beat = {
      active: dto.active,
      position: kind === 'video' ? (dto.positionSeconds ?? null) : null,
    };

    // The contest side applies only to a weeks-1-3 entry while its counting window is open.
    const contest = await loadContestEntryForPost(this.prisma, postId);
    const window = contest ? countingWindowFor(contest) : null;
    const contestApplies =
      contest !== null &&
      contest.weekNumber !== 4 &&
      contest.viewWatchLimitSeconds != null &&
      window !== null &&
      now.getTime() >= window.from.getTime() &&
      now.getTime() < window.before.getTime();
    // Self-engagement is exempt from baseline points (spec 9b) but COUNTS in a contest tally (spec 9a).
    const baselineApplies = viewerId !== post.authorId;

    const sessionKey = `viewhb:s:${viewerId}:${postId}:${dto.sessionId}`;
    const lockKey = `viewhb:lock:${sessionKey}`;
    const locked = await this.redis.set(lockKey, '1', 'PX', LOCK_PX, 'NX');
    if (locked !== 'OK') {
      // A simultaneous beat for the same session is ignored: it would be credited the same gap twice.
      return { done: false };
    }
    try {
      const raw = await this.redis.get(sessionKey);
      let state: SessionState = raw ? (JSON.parse(raw) as SessionState) : newSession(now.getTime(), beat);
      if (raw) state = applyBeat(state, beat, now.getTime(), kind);

      const baselineRequired = baselineRequiredSeconds(kind, dto.durationSeconds);
      const baselineMet = baselineApplies && !state.baselineDone && meetsRequirement(state.creditedSeconds, baselineRequired, kind);
      const contestMet =
        contestApplies &&
        !state.contestDone &&
        meetsRequirement(
          state.creditedSeconds,
          contestRequiredSeconds(kind, dto.durationSeconds, contest!.viewWatchLimitSeconds as number),
          kind,
        );

      if (baselineMet || contestMet) {
        await this.prisma.$transaction(async (tx) => {
          if (baselineMet) {
            await awardEngagementPoints(tx, {
              kind: 'view',
              postId,
              postAuthorId: post.authorId,
              giverId: viewerId,
              now,
              caps: this.caps,
            });
          }
          if (contestMet) {
            await recordQualifiedView(tx, contest, { viewerId, now });
          }
        });
        state = {
          ...state,
          baselineDone: state.baselineDone || baselineMet,
          contestDone: state.contestDone || contestMet,
        };
      }

      await this.redis.set(sessionKey, JSON.stringify(state), 'EX', SESSION_TTL_SECONDS);

      const baselineSettled = !baselineApplies || state.baselineDone;
      const contestSettled = !contestApplies || state.contestDone;
      return { done: baselineSettled && contestSettled };
    } finally {
      await this.redis.del(lockKey);
    }
  }

  private async enforceRate(viewerId: string): Promise<void> {
    const key = `viewhb:rate:${viewerId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, RATE_WINDOW_SECONDS);
    if (count > MAX_BEATS_PER_MINUTE) {
      throw new HttpException('Too many view heartbeats', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
