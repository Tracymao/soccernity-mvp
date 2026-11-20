import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EngagementEvent, EngagementKind } from './contest-ranking.util';
import { buildContestScheduleForKey } from './contest-schedule.util';

// backend/w7-contest (B-091, Decision Log #382, #386, #400; docs/contest-spec.md sections 9a, 10).
// The contest side of a like or a comment, as plain functions that take a Prisma client -- the same
// shape as points/points.util.ts and for the same reason: FeedService writes the Like / Comment, and
// the contest's engagement row must land in THAT transaction without FeedModule importing
// ContestModule (ContestModule already depends on FeedModule for creating the final entry's post).
//
// What is recorded: ONE ContestEngagement row per (entry, giver, kind) -- but only for engagement
// that falls INSIDE the entry's counting window:
//   weeks 1-3  from the entry's submission to the end of Phase 1 (00:00 on day 5/12/19)
//   final      from the reveal (00:00 day 25) to the end of the month
// Anything outside is ordinary engagement: it still happens (a like is a like), it just does not
// count toward the contest. Before the reveal a final entry refuses engagement outright (below).

export const CONTEST_FINAL_LOCKED_CODE = 'contest_final_locked';

/** The contest facts about a post, or nothing if the post is not a contest entry. */
export interface ContestEntryContext {
  entryId: string;
  weekNumber: number;
  authorId: string;
  submittedAt: Date;
  /** The cycle's "YYYY-MM"; null for a legacy admin-judged cycle (which never records engagement). */
  monthKey: string | null;
  /** Weeks 1-3: the round's view-qualifying watch limit L in seconds (spec 9c); null for week 4. */
  viewWatchLimitSeconds?: number | null;
}

type EntryReader = Pick<Prisma.TransactionClient, 'contestEntry'>;
type EngagementWriter = Pick<Prisma.TransactionClient, 'contestEngagement' | 'follow'>;
type CommentCounter = Pick<Prisma.TransactionClient, 'contestEngagement' | 'comment'>;

export async function loadContestEntryForPost(
  db: EntryReader,
  postId: string,
): Promise<ContestEntryContext | null> {
  const entry = await db.contestEntry.findUnique({
    where: { postId },
    select: {
      id: true,
      userId: true,
      submittedAt: true,
      round: { select: { weekNumber: true, viewWatchLimitSeconds: true } },
      cycle: { select: { monthKey: true } },
    },
  });
  if (!entry) return null;
  return {
    entryId: entry.id,
    weekNumber: entry.round.weekNumber,
    authorId: entry.userId,
    submittedAt: entry.submittedAt,
    monthKey: entry.cycle.monthKey,
    viewWatchLimitSeconds: entry.round.viewWatchLimitSeconds,
  };
}

export interface CountingWindow {
  /** Inclusive. */
  from: Date;
  /** Exclusive. */
  before: Date;
}

export function countingWindowFor(ctx: ContestEntryContext): CountingWindow | null {
  if (!ctx.monthKey) return null;
  const schedule = buildContestScheduleForKey(ctx.monthKey);
  if (!schedule) return null;
  if (ctx.weekNumber === 4) {
    return { from: schedule.final.revealAt, before: schedule.final.monthEndAt };
  }
  const week = schedule.weeks[ctx.weekNumber - 1];
  if (!week) return null;
  return { from: ctx.submittedAt, before: week.phase1EndsAt };
}

/** The reveal instant of a final entry, or null for any other post. */
export function finalEntryRevealAt(ctx: ContestEntryContext | null): Date | null {
  if (!ctx || ctx.weekNumber !== 4 || !ctx.monthKey) return null;
  return buildContestScheduleForKey(ctx.monthKey)?.final.revealAt ?? null;
}

/**
 * Engagement on a FINAL entry is refused, and not recorded, before the reveal (Decision Log #400
 * E10): "buttons disabled, counts hidden, nothing recorded". That includes the author's own
 * engagement on their hidden entry. Anyone else cannot even reach the post (Post.visibleFrom hides
 * it behind a 404), so this is the owner's case and a defence in depth for everyone else.
 */
export function assertFinalEntryUnlocked(ctx: ContestEntryContext | null, now: Date): void {
  const revealAt = finalEntryRevealAt(ctx);
  if (revealAt && now.getTime() < revealAt.getTime()) {
    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: CONTEST_FINAL_LOCKED_CODE,
      message: 'This entry is locked until the final is revealed.',
    });
  }
}

/**
 * A comment counts toward a contest only if it passes the existing content screening (spec 9a).
 * THERE IS NO SUCH SCREENING ON COMMENTS TODAY (the only text screen in the codebase,
 * sensitive-content.util.ts, is scoped to Grassroots records), so this is a seam that is always
 * true. OPEN, listed in docs/backend-w7-contest-report.md: when comment screening exists, this is
 * the one place to call it.
 */
export function commentCountsForContest(_contentText: string): boolean {
  return true;
}

/**
 * Records one engagement, if it falls inside the entry's counting window. Idempotent: a repeat of
 * the same (entry, giver, kind) is swallowed, so the FIRST occurrence keeps its timestamp (the
 * "earliest reached" tie-break reads it). The follow snapshot is taken now and never revisited.
 */
export async function recordEntryEngagement(
  db: EngagementWriter,
  ctx: ContestEntryContext | null,
  input: { giverId: string; kind: EngagementKind; now: Date },
): Promise<void> {
  if (!ctx) return;
  const window = countingWindowFor(ctx);
  if (!window) return;
  const t = input.now.getTime();
  if (t < window.from.getTime() || t >= window.before.getTime()) return;

  // Nobody follows themselves, so the author's own engagement is never a follower's.
  let followed = false;
  if (input.giverId !== ctx.authorId) {
    const follow = await db.follow.findUnique({
      where: { followerId_followeeId: { followerId: input.giverId, followeeId: ctx.authorId } },
      select: { id: true },
    });
    followed = follow !== null;
  }

  await db.contestEngagement.createMany({
    data: [
      {
        entryId: ctx.entryId,
        userId: input.giverId,
        kind: input.kind,
        followedAtEngagement: followed,
        occurredAt: input.now,
      },
    ],
    skipDuplicates: true,
  });
}

/** Removes an engagement ("removed engagement excluded"): an unlike. Safe to call for a non-entry. */
export async function removeEntryEngagement(
  db: Pick<Prisma.TransactionClient, 'contestEngagement'>,
  ctx: ContestEntryContext | null,
  input: { giverId: string; kind: EngagementKind },
): Promise<void> {
  if (!ctx) return;
  await db.contestEngagement.deleteMany({
    where: { entryId: ctx.entryId, userId: input.giverId, kind: input.kind },
  });
}

/**
 * After a comment is deleted or hidden: the account's single comment point stays while it still has
 * ANY visible comment on the post ("ten comments = 1"), and goes when the last one goes. The
 * surviving row keeps its original timestamp and follow snapshot (spec silent; default recorded in
 * the report).
 */
export async function syncCommentEngagement(
  db: CommentCounter,
  ctx: ContestEntryContext | null,
  input: { postId: string; commentAuthorId: string },
): Promise<void> {
  if (!ctx) return;
  const remaining = await db.comment.count({
    where: { postId: input.postId, authorId: input.commentAuthorId, hidden: false },
  });
  if (remaining === 0) {
    await removeEntryEngagement(db, ctx, { giverId: input.commentAuthorId, kind: 'comment' });
  }
}

/**
 * Records a QUALIFIED view of a contest entry. Called by ViewQualificationService (backend/w12-points,
 * B-093) once a viewer has met the contest view threshold of spec 9c (min(video length, L) for a video,
 * 5 seconds for a photo), so Phase 1 now ranks on views + likes + comments.
 */
export async function recordQualifiedView(
  db: EngagementWriter,
  ctx: ContestEntryContext | null,
  input: { viewerId: string; now: Date },
): Promise<void> {
  // Views are not counted in the final (spec 9c): a final entry never records one.
  if (!ctx || ctx.weekNumber === 4) return;
  await recordEntryEngagement(db, ctx, { giverId: input.viewerId, kind: 'view', now: input.now });
}

/** The row shape the tally queries select, and the grouping of those rows into per-entry event lists. */
export interface EngagementRow {
  entryId: string;
  userId: string;
  kind: string;
  followedAtEngagement: boolean;
  occurredAt: Date;
}

export function groupEngagementRows(rows: readonly EngagementRow[]): Map<string, EngagementEvent[]> {
  const byEntry = new Map<string, EngagementEvent[]>();
  for (const r of rows) {
    const list = byEntry.get(r.entryId) ?? [];
    list.push({
      userId: r.userId,
      kind: r.kind as EngagementKind,
      followedAtEngagement: r.followedAtEngagement,
      occurredAt: r.occurredAt,
    });
    byEntry.set(r.entryId, list);
  }
  return byEntry;
}
