import { Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { notBlockedWith } from '../block/block.util';
import { PostMediaConfig } from './post-media.config';
import { PostMediaObjectsService } from './post-media-objects.service';
import { postMediaVisibleTo } from './post-media-visibility.util';
import { MEDIA_REVIEW_CODES, postMediaError } from './post-media.errors';

// backend/w15-media-review-queue (B-037; Decision Log #419 item 4). POST /media/:id/report -- a user
// reports a picture or video they can see.
//
// The rules, in the order they are checked (each failure that could leak is the SAME 404 a missing item gets):
//   1. your own item -> 400 cannot_report_own_media (you already know it exists)
//   2. the item must be a ready, APPROVED file attached to a post that THIS viewer can see right now (not
//      author-only, not a final entry before the reveal, not by a deactivated author, no block between the
//      pair, and not already held pending review) -> else 404. A pending or rejected file is invisible to
//      everyone but its uploader, so a stranger gets the same 404 as for an id that does not exist.
//   3. one report per user per item, ever -> a repeat is a 200 { alreadyReported: true } that changes nothing.
//
// What a report does (one transaction): inserts the PostMediaReport row, increments reportCount, puts the
// item in the moderator queue (reviewEnteredAt / 'user_report' the first time), and -- when the open report
// count reaches MEDIA_REPORT_HIDE_THRESHOLD (default 3; 0 = never) -- sets hiddenPendingReview so the item and
// its post are hidden from everyone but the author until a moderator decides. Below the threshold the item
// stays visible.
//
// backend/media-privacy-vetting-followups (Decision Log #430 items 2, 3 and 4):
//   - a PER-ACCOUNT DAILY LIMIT: at most POST_MEDIA_REPORT_DAILY_LIMIT (default 20, a founder-veto-able
//     default) reports in any rolling 24 hours, counted from the report records themselves; over it, a 429
//     with the stable code media_report_daily_limit. The hold threshold above is unchanged.
//   - an optional free-text reason, trimmed, at most 500 characters, stored on the report and shown to
//     moderators ONLY (never to the uploader or any other user).
//   - when a report newly HOLDS the item, the file is moved from the public prefix back to the private one
//     (post-media-objects.service.ts). The database gate hides it at once; a failed move is retried by the
//     reconciler and never fails the report.

export interface MediaReportResult {
  reported: true;
  alreadyReported: boolean;
}

@Injectable()
export class PostMediaReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PostMediaConfig,
    private readonly objects: PostMediaObjectsService,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  private readonly logger = new Logger(PostMediaReportService.name);

  async report(userId: string, mediaId: string, rawReason?: string): Promise<MediaReportResult> {
    const reason = rawReason?.trim() ? rawReason.trim() : null;
    const own = await this.prisma.postMedia.findFirst({ where: { id: mediaId }, select: { uploaderId: true } });
    if (own?.uploaderId === userId) {
      throw postMediaError(400, MEDIA_REVIEW_CODES.cannotReportOwn, "You can't report your own file.");
    }

    const now = this.clock.now();
    const visiblePost: Prisma.PostWhereInput = {
      AND: [
        { OR: [{ visibleFrom: null }, { visibleFrom: { lte: now } }] },
        { author: { accountStatus: { in: ['active', 'deleted'] } } },
        postMediaVisibleTo(userId),
      ],
    };
    const media = await this.prisma.postMedia.findFirst({
      where: {
        id: mediaId,
        uploadState: 'ready',
        status: 'approved',
        hiddenPendingReview: false,
        uploader: { is: notBlockedWith(userId) },
        postId: { not: null },
        post: { is: visiblePost },
      },
      select: { id: true },
    });
    if (!media) throw new NotFoundException('Media not found');

    // The rolling-24-hours limit, from the report records (B-258).
    const limit = this.config.reportDailyLimit;
    const filed = await this.prisma.postMediaReport.count({
      where: { reporterId: userId, createdAt: { gt: new Date(now.getTime() - 24 * 3600 * 1000) } },
    });
    if (filed >= limit) {
      throw postMediaError(
        429,
        MEDIA_REVIEW_CODES.reportDailyLimit,
        "You've sent a lot of reports today. Please try again tomorrow, or use the general report option for anything urgent.",
      );
    }

    let newlyHeld = false;
    try {
      await this.prisma.$transaction(async (tx) => {
        // First statement, so a duplicate (P2002) aborts nothing that matters and is caught below.
        await tx.postMediaReport.create({ data: { mediaId, reporterId: userId, createdAt: now, reason }, select: { id: true } });
        const updated = await tx.postMedia.update({
          where: { id: mediaId },
          data: { reportCount: { increment: 1 } },
          select: { reportCount: true, reviewEnteredAt: true, hiddenPendingReview: true },
        });
        const threshold = this.config.reportHideThreshold;
        const hide = threshold > 0 && updated.reportCount >= threshold;
        newlyHeld = hide && !updated.hiddenPendingReview;
        if (updated.reviewEnteredAt === null || hide) {
          await tx.postMedia.update({
            where: { id: mediaId },
            data: {
              ...(updated.reviewEnteredAt === null ? { reviewEnteredAt: now, reviewEntrySource: 'user_report' } : {}),
              ...(hide ? { hiddenPendingReview: true } : {}),
            },
            select: { id: true },
          });
        }
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { reported: true, alreadyReported: true };
      }
      throw err;
    }
    if (newlyHeld) {
      // Held by reports: take the file out of the public prefix. Never fails the report.
      await this.objects.withdraw(mediaId).catch((err) => {
        this.logger.warn(`Held media ${mediaId} not yet moved to the private prefix (${err instanceof Error ? err.message : String(err)}).`);
      });
    }
    return { reported: true, alreadyReported: false };
  }
}
