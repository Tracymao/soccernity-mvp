import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { notBlockedWith } from '../block/block.util';
import { PostMediaConfig } from './post-media.config';
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

export interface MediaReportResult {
  reported: true;
  alreadyReported: boolean;
}

@Injectable()
export class PostMediaReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PostMediaConfig,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  async report(userId: string, mediaId: string): Promise<MediaReportResult> {
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

    try {
      await this.prisma.$transaction(async (tx) => {
        // First statement, so a duplicate (P2002) aborts nothing that matters and is caught below.
        await tx.postMediaReport.create({ data: { mediaId, reporterId: userId, createdAt: now }, select: { id: true } });
        const updated = await tx.postMedia.update({
          where: { id: mediaId },
          data: { reportCount: { increment: 1 } },
          select: { reportCount: true, reviewEnteredAt: true },
        });
        const threshold = this.config.reportHideThreshold;
        const hide = threshold > 0 && updated.reportCount >= threshold;
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
    return { reported: true, alreadyReported: false };
  }
}
