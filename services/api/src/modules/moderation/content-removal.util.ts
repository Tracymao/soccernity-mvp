import { Prisma } from '@prisma/client';
import { onContestEntryPostRemoved, onContestEntryPostRestored } from '../contest/contest-entry-removal.util';

// backend/b289-content-removal (B-289, Decision Log #483). A moderator's `content_removed` is ENFORCED for exactly
// three target types. It is a SOFT removal: the row, its text, its media and its engagement rows stay (evidence,
// and the retention/report exceptions depend on them); `removedByModerationAt` is what every user-facing read
// honours, and only staff reads (the reported item, the report detail) still return the full row.

/** The report target types `content_removed` can be recorded against. Any other type is a 400. */
export const CONTENT_REMOVAL_TARGET_TYPES = ['post', 'comment', 'message'] as const;
export type ContentRemovalTargetType = (typeof CONTENT_REMOVAL_TARGET_TYPES)[number];

export function isContentRemovalTarget(targetType: string): targetType is ContentRemovalTargetType {
  return (CONTENT_REMOVAL_TARGET_TYPES as readonly string[]).includes(targetType);
}

/** Stable 400 code for `content_removed` on a report whose target is not a post, a comment or a message. */
export const CONTENT_REMOVAL_NOT_APPLICABLE_CODE = 'content_removal_not_applicable';

/** What `actionReport` tells the admin about the removal it performed (key absent for every other action). */
export type ContentRemovalOutcome = 'removed' | 'already_removed' | 'target_not_found';

// The three read fragments live in content-removal.filters.ts (no imports, so the contest removal seam below can
// use them without an import cycle). Re-exported so every existing import from this file is unchanged.
export { POST_NOT_REMOVED, COMMENT_NOT_REMOVED, MESSAGE_NOT_REMOVED } from './content-removal.filters';

/** The text-less stand-in a client gets for a removed comment or message (no text, no author for a comment). */
export const REMOVED_BY_MODERATION = true as const;

interface ReportRef {
  id: string;
  targetType: string;
  targetId: string;
}

/**
 * Removes the ONE reported target, inside the caller's transaction (the same one that records the action).
 * Returns 'already_removed' when another report removed it first (that report keeps the claim) and
 * 'target_not_found' when the row no longer exists (nothing to remove; the action is still recorded).
 * A context message attached to a message report is never touched: only `report.targetId` is.
 */
export async function applyContentRemoval(
  tx: Prisma.TransactionClient,
  report: ReportRef,
  now: Date,
): Promise<ContentRemovalOutcome> {
  const claim = { removedByModerationAt: now, removedByReportId: report.id };
  switch (report.targetType) {
    case 'post': {
      const claimed = await tx.post.updateMany({ where: { id: report.targetId, removedByModerationAt: null }, data: claim });
      if (claimed.count === 1) {
        // B-300 (Decision Log #488): if this post is a CONTEST ENTRY, the contest follows in the SAME transaction
        // (ranking, votes, podiums, points). A post that is not an entry costs one indexed lookup.
        await onContestEntryPostRemoved(tx, report.targetId, now);
        return 'removed';
      }
      const row = await tx.post.findUnique({ where: { id: report.targetId }, select: { id: true } });
      return row ? 'already_removed' : 'target_not_found';
    }
    case 'message': {
      const claimed = await tx.message.updateMany({ where: { id: report.targetId, removedByModerationAt: null }, data: claim });
      if (claimed.count === 1) return 'removed';
      const row = await tx.message.findUnique({ where: { id: report.targetId }, select: { id: true } });
      return row ? 'already_removed' : 'target_not_found';
    }
    case 'comment': {
      const row = await tx.comment.findUnique({
        where: { id: report.targetId },
        select: { id: true, postId: true, hidden: true },
      });
      if (!row) return 'target_not_found';
      const claimed = await tx.comment.updateMany({ where: { id: row.id, removedByModerationAt: null }, data: claim });
      if (claimed.count === 0) return 'already_removed';
      // A removed comment, like a hidden one, does not count toward Post.commentCount. A hidden comment was
      // already subtracted when it was hidden, so it is not subtracted a second time.
      if (!row.hidden) {
        await tx.post.updateMany({ where: { id: row.postId, commentCount: { gt: 0 } }, data: { commentCount: { decrement: 1 } } });
      }
      return 'removed';
    }
    default:
      return 'target_not_found';
  }
}

/**
 * The inverse, run when an appeal on a content_removed report is OVERTURNED: clears the removal ONLY if this very
 * report is the one that removed the target (another report's claim is never undone). Returns true if a row was
 * restored. A restored comment is counted again unless it is hidden.
 */
export async function restoreContentRemoval(
  tx: Prisma.TransactionClient,
  report: ReportRef,
  now: Date = new Date(),
): Promise<boolean> {
  const cleared = { removedByModerationAt: null, removedByReportId: null };
  switch (report.targetType) {
    case 'post': {
      const done = await tx.post.updateMany({ where: { id: report.targetId, removedByReportId: report.id }, data: cleared });
      if (done.count !== 1) return false;
      // B-300: an overturned appeal brings a removed contest entry back with its points, in the same transaction.
      await onContestEntryPostRestored(tx, report.targetId, now);
      return true;
    }
    case 'message': {
      const done = await tx.message.updateMany({ where: { id: report.targetId, removedByReportId: report.id }, data: cleared });
      return done.count === 1;
    }
    case 'comment': {
      const row = await tx.comment.findFirst({
        where: { id: report.targetId, removedByReportId: report.id },
        select: { id: true, postId: true, hidden: true },
      });
      if (!row) return false;
      const done = await tx.comment.updateMany({ where: { id: row.id, removedByReportId: report.id }, data: cleared });
      if (done.count === 0) return false;
      if (!row.hidden) {
        await tx.post.update({ where: { id: row.postId }, data: { commentCount: { increment: 1 } } });
      }
      return true;
    }
    default:
      return false;
  }
}
