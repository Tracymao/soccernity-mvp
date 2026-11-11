import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import {
  POST_MEDIA_APPROVED_NOTIFICATION_TYPE,
  POST_MEDIA_REJECTED_NOTIFICATION_TYPE,
} from './post-media-review.constants';
import { MEDIA_REVIEW_CODES, postMediaError } from './post-media.errors';
import { POST_NOT_REMOVED_BY_MODERATION, PostMediaObjectsService } from './post-media-objects.service';
import { GuardianSecurityNoticeService } from '../guardian-security-notice/guardian-security-notice.service';

// backend/w15-media-review-queue (B-037; Decision Log #419 items 4 and 6). A MODERATOR's decision on one
// item. (The automatic check writes its own decisions in media-check.service.ts; both write the same
// uploader Notification through writeDecisionNotification below.)
//
// What a decision does, all in ONE transaction so the status, the reports and the notification cannot land
// apart:
//
//   approve  a pending item            -> approved (decisionSource 'moderator'); uploader notified "approved"
//            an approved, reported one -> KEPT: the reports are resolved and the hold lifted; the uploader is
//                                         NOT told (they never knew it was reported)
//   reject   a pending item, or an approved item with open reports
//                                      -> rejected (reason required); reports resolved; uploader notified
//
// Anything else is a 409 already_decided: the item is not waiting for a decision. The status test is in the
// WHERE of every write, so two moderators acting at once cannot both succeed (one notification, one winner)
// and repeating a request cannot duplicate its effects.
//
// A post becomes visible when ALL its media are approved and none is held (post-media-visibility.util.ts),
// so approving the last outstanding item publishes the post with no further write; a rejected item keeps
// the post author-only until the uploader removes that file.
//
// backend/media-privacy-vetting-followups (B-257; Decision Log #430 item 2). WHERE the file lives follows the
// decision (post-media-objects.service.ts):
//   approve  copies the file private -> public and VERIFIES it BEFORE writing 'approved'. FAILS CLOSED: if the
//            copy fails nothing changes, the item stays pending, and the moderator gets a retryable 503.
//   reject   writes 'rejected' first (the database gate hides the file at once), then moves a published file
//            back to the private prefix. A failed move is logged and retried by the reconciler. A moderator
//            Reject does not itself delete the file: it stays private until its post or upload is deleted or
//            its account is anonymised or purged, and is then deleted (B-283, Decision Log #464) unless the
//            uploader is under an active hold or the post has a report not yet closed.

export type ModeratorOutcome = 'approved' | 'kept' | 'rejected';

export interface ModeratorDecisionResult {
  id: string;
  outcome: ModeratorOutcome;
  /** The item's status after the decision. */
  status: 'approved' | 'rejected';
}

/** The uploader's Notification for a decision (auto or moderator). Call inside the deciding transaction. */
export async function writeDecisionNotification(
  tx: Pick<Prisma.TransactionClient, 'notification'>,
  uploaderId: string,
  mediaId: string,
  outcome: 'approved' | 'rejected',
): Promise<void> {
  await tx.notification.create({
    data: {
      userId: uploaderId,
      type: outcome === 'approved' ? POST_MEDIA_APPROVED_NOTIFICATION_TYPE : POST_MEDIA_REJECTED_NOTIFICATION_TYPE,
      payloadRefId: mediaId,
    },
    select: { id: true },
  });
}

const alreadyDecided = () =>
  postMediaError(409, MEDIA_REVIEW_CODES.alreadyDecided, 'This item has already been decided or is not waiting for review.');

@Injectable()
export class PostMediaDecisionService {
  private readonly logger = new Logger(PostMediaDecisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly objects: PostMediaObjectsService,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
    // B-279 (Decision Log #456 A): a moderator REJECTING a minor's file is a platform action, so the minor's
    // guardian is told the kind of action (never the reason). Optional only so a spec that builds this service
    // without it keeps its shape; PostMediaModule always provides it.
    @Optional() private readonly guardianNotices?: GuardianSecurityNoticeService,
  ) {}

  async approve(mediaId: string, adminId: string): Promise<ModeratorDecisionResult> {
    // Publish FIRST, outside any transaction (a storage copy must not hold a database transaction open).
    const before = await this.prisma.postMedia.findFirst({
      where: { id: mediaId, uploadState: 'ready' },
      select: {
        id: true,
        status: true,
        reportCount: true,
        reviewEnteredAt: true,
        contentType: true,
        privateKey: true,
        publicKey: true,
        publishedAt: true,
        // B-296: whether the post is removed by moderation decides whether the file may go public at all.
        post: { select: { removedByModerationAt: true } },
      },
    });
    if (!before) throw postMediaError(404, 'media_not_found', 'Media not found');
    if (before.reviewEnteredAt === null) {
      throw postMediaError(409, MEDIA_REVIEW_CODES.notInQueue, 'This item is not in the review queue.');
    }
    const willBeVisible = before.status === 'pending' || (before.status === 'approved' && before.reportCount > 0);
    if (!willBeVisible) throw alreadyDecided();
    // B-296 (Decision Log #484): a file whose post is removed by moderation is approved but NOT published, so it
    // stays private (republishForPost brings it back if the removal is overturned). No copy is made at all.
    const copied = !before.post?.removedByModerationAt;
    try {
      if (copied) await this.objects.copyToPublic(before);
    } catch (err) {
      // FAIL CLOSED: nothing was approved and nothing is public. The moderator can simply try again.
      this.logger.error(`Approval of media ${mediaId} not applied: publishing failed (${err instanceof Error ? err.message : String(err)}).`);
      throw postMediaError(503, MEDIA_REVIEW_CODES.publishFailed, "The file couldn't be published right now. It is still waiting for review; please try again.");
    }

    let outcome: { result: ModeratorDecisionResult; published: boolean };
    try {
      outcome = await this.approveInTransaction(mediaId, adminId, copied);
    } catch (err) {
      // Lost a race (or the write failed): the public copy was never recorded.
      if (copied && before.publicKey && !before.publishedAt) await this.objects.discardUnrecordedCopy(mediaId, before.publicKey);
      throw err;
    }
    if (outcome.published) {
      await this.objects.finishPublish(mediaId);
    } else if (copied && before.publicKey && !before.publishedAt) {
      // The post was removed between the check above and the write: the copy made is not live. Take it out again.
      await this.objects.discardUnrecordedCopy(mediaId, before.publicKey);
    }
    return outcome.result;
  }

  // `copied` is true when the public copy exists (it was just made, or the file was already published). The write that
  // records publication carries the post-not-removed condition IN ITS WHERE, so a removal that lands after the
  // check in approve() cannot be missed: that write then matches nothing, and the same approval is written without
  // publishing (the file stays private; republishForPost or the reconciler publishes it when the post is restored).
  private async approveInTransaction(
    mediaId: string,
    adminId: string,
    copied: boolean,
  ): Promise<{ result: ModeratorDecisionResult; published: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.load(tx, mediaId);
      const now = this.clock.now();

      if (row.status === 'pending') {
        const guard = { id: mediaId, status: 'pending', decisionSource: null } as const;
        const base = {
          status: 'approved',
          decisionSource: 'moderator',
          decidedAt: now,
          decidedBy: adminId,
          reportCount: 0,
          hiddenPendingReview: false,
        } as const;
        let published = false;
        let count = 0;
        if (copied) {
          count = (
            await tx.postMedia.updateMany({
              where: { ...guard, ...POST_NOT_REMOVED_BY_MODERATION },
              data: { ...base, publishedAt: now },
            })
          ).count;
          published = count === 1;
        }
        if (count === 0) count = (await tx.postMedia.updateMany({ where: guard, data: base })).count;
        if (count === 0) throw alreadyDecided();
        await this.resolveReports(tx, mediaId, now);
        await writeDecisionNotification(tx, row.uploaderId, mediaId, 'approved');
        return { result: { id: mediaId, outcome: 'approved', status: 'approved' } as const, published };
      }

      if (row.status === 'approved' && row.reportCount > 0) {
        const guard = { id: mediaId, status: 'approved', reportCount: { gt: 0 } } as const;
        const base = { reportCount: 0, hiddenPendingReview: false } as const;
        let published = false;
        let count = 0;
        if (copied) {
          count = (
            await tx.postMedia.updateMany({
              where: { ...guard, ...POST_NOT_REMOVED_BY_MODERATION },
              data: { ...base, publishedAt: row.publishedAt ?? now },
            })
          ).count;
          published = count === 1;
        }
        if (count === 0) count = (await tx.postMedia.updateMany({ where: guard, data: base })).count;
        if (count === 0) throw alreadyDecided();
        await this.resolveReports(tx, mediaId, now);
        return { result: { id: mediaId, outcome: 'kept', status: 'approved' } as const, published };
      }

      throw alreadyDecided();
    });
  }

  async reject(mediaId: string, adminId: string, reason: string): Promise<ModeratorDecisionResult> {
    const { result, uploaderId } = await this.rejectInTransaction(mediaId, adminId, reason);
    this.guardianNotices?.notifyInBackground(uploaderId, 'media_not_approved');
    // The status is written, so the database gate already hides the file. If it was published, move it back
    // to the private prefix. Never throws: a failure is retried by the reconciler. Reject does not delete the
    // file (see the header: the lifecycle deletion paths do, B-283).
    await this.objects.withdraw(mediaId).catch((err) => {
      this.logger.warn(`Rejected media ${mediaId} not yet moved back to the private prefix (${err instanceof Error ? err.message : String(err)}).`);
    });
    return result;
  }

  private async rejectInTransaction(
    mediaId: string,
    adminId: string,
    reason: string,
  ): Promise<{ result: ModeratorDecisionResult; uploaderId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.load(tx, mediaId);
      const now = this.clock.now();
      const data = {
        status: 'rejected',
        decisionSource: 'moderator',
        decidedAt: now,
        decidedBy: adminId,
        rejectionReason: reason,
        reportCount: 0,
        hiddenPendingReview: false,
      };

      let changed = 0;
      if (row.status === 'pending') {
        changed = (await tx.postMedia.updateMany({ where: { id: mediaId, status: 'pending', decisionSource: null }, data })).count;
      } else if (row.status === 'approved' && row.reportCount > 0) {
        changed = (await tx.postMedia.updateMany({ where: { id: mediaId, status: 'approved', reportCount: { gt: 0 } }, data })).count;
      }
      if (changed === 0) throw alreadyDecided();

      await this.resolveReports(tx, mediaId, now);
      await writeDecisionNotification(tx, row.uploaderId, mediaId, 'rejected');
      return { result: { id: mediaId, outcome: 'rejected', status: 'rejected' } as const, uploaderId: row.uploaderId };
    });
  }

  /** The item must exist and be a ready file; anything else is the same 404 a missing id gets. */
  private async load(tx: Prisma.TransactionClient, mediaId: string) {
    const row = await tx.postMedia.findFirst({
      where: { id: mediaId, uploadState: 'ready' },
      select: { id: true, uploaderId: true, status: true, reportCount: true, reviewEnteredAt: true, publishedAt: true },
    });
    if (!row) throw postMediaError(404, 'media_not_found', 'Media not found');
    // The queue holds only what the automatic check left to a person, or what users reported: a pending
    // file the check has not finished with is not a moderator's to decide.
    if (row.reviewEnteredAt === null) {
      throw postMediaError(409, MEDIA_REVIEW_CODES.notInQueue, 'This item is not in the review queue.');
    }
    return row;
  }

  private async resolveReports(tx: Prisma.TransactionClient, mediaId: string, now: Date): Promise<void> {
    await tx.postMediaReport.updateMany({ where: { mediaId, resolvedAt: null }, data: { resolvedAt: now } });
  }
}
