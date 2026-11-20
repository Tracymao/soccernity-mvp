import { ConflictException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { CHECK_BACKOFF_BASE_MS, CHECK_BACKOFF_MAX_MS, MediaCheckService } from '../post-media/media-check.service';
import { AUTO_REJECTION_REASON } from '../post-media/media-moderation-decision.util';
import { MediaModerationClient } from '../post-media/media-moderation-client';
import { POST_MEDIA_DEFAULTS, PostMediaConfig } from '../post-media/post-media.config';
import { ProfileImageKind, UserImageReviewService } from './user-image-review.service';
import { ProfileImagePublishService } from './profile-image-publish.service';

// backend/b036-avatar-cover-check (B-036; Decision Log #411 item 1, #394 A2, #468). The automatic image check for
// avatars and cover photos. It REUSES the post-media check -- the same Amazon Rekognition client, the same label
// thresholds (stricter for a minor), the same download / shrink / decide steps (MediaCheckService.checkStoredImage),
// the same back-off schedule, and the same generic rejection reason -- and adds only what is specific to a profile
// picture: where the state lives and what an outcome does to the User row.
//
// A background sweep takes every avatar and cover whose status is 'pending', reads the stored file from the PRIVATE
// prefix (profile-image.util.ts) and decides:
//
//   clearly fine                       -> PUBLISH: copy the file to the public prefix, verify the copy, and only then
//                                         flip the status to 'approved' (and point avatarKey / coverKey at the public
//                                         key). Written only while the row still points at the key that was checked,
//                                         so a re-upload that landed during the check can never be approved by the old
//                                         file's result (the stale public copy is discarded).
//   a reject category, high confidence -> UserImageReviewService.rejectProfileImage with the generic automatic reason
//                                         and the checked key: status 'rejected', one notification to the uploader and,
//                                         for a minor, the guardian notice. The file stays private.
//   anything in between                -> stays 'pending' (state 'review' in ProfileImageCheck) for the moderator
//                                         queue (B-037, not built).
//
// NOTHING IS APPROVED BY DEFAULT. If Rekognition is not configured the sweep does not run at all and every picture
// stays pending. A check that throws is retried with back-off and, after the configured number of failures
// (PostMediaConfig.checkMaxAttempts), is left pending ('gave_up') for a moderator. An outcome is only ever written
// while the image is still the one that was checked.

export type ProfileCheckOutcome = 'approved' | 'rejected' | 'pending' | 'retry' | 'gave_up' | 'skipped';

export interface DueProfileImage {
  userId: string;
  kind: ProfileImageKind;
  key: string;
}

@Injectable()
export class ProfileImageCheckService {
  private readonly logger = new Logger(ProfileImageCheckService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: ProfileImagePublishService,
    private readonly checks: MediaCheckService,
    private readonly moderation: MediaModerationClient,
    private readonly config: PostMediaConfig,
    private readonly review: UserImageReviewService,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  /**
   * One pass: removes bookkeeping for images that are no longer pending, then claims up to a batch of due images and
   * checks each. Does NOTHING when Rekognition is not configured (every picture simply stays pending).
   */
  async runDueChecks(now: Date = this.clock.now()): Promise<{ checked: number; outcomes: Record<string, number> }> {
    if (!this.moderation.isConfigured) return { checked: 0, outcomes: {} };

    await this.removeStaleBookkeeping();

    const due = await this.findDue(now, this.config.checkBatchSize);
    const outcomes: Record<string, number> = {};
    for (const image of due) {
      const outcome = await this.checkOne(image, now);
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    }
    return { checked: due.length, outcomes };
  }

  /** Pending avatars and covers with no current check row, or whose retry is due. Raw SQL: it joins a table with no relation. */
  private async findDue(now: Date, limit: number): Promise<DueProfileImage[]> {
    const avatars = await this.prisma.$queryRaw<Array<{ userId: string; key: string }>>(Prisma.sql`
      SELECT u."id" AS "userId", u."avatarKey" AS "key"
      FROM "User" u
      LEFT JOIN "ProfileImageCheck" c ON c."userId" = u."id" AND c."kind" = 'avatar'
      WHERE u."avatarStatus" = 'pending' AND u."avatarKey" IS NOT NULL
        AND (c."userId" IS NULL OR c."objectKey" <> u."avatarKey"
             OR (c."state" = 'retry' AND c."nextAttemptAt" <= ${now}))
      ORDER BY u."id"
      LIMIT ${limit}
    `);
    const covers = await this.prisma.$queryRaw<Array<{ userId: string; key: string }>>(Prisma.sql`
      SELECT u."id" AS "userId", u."coverKey" AS "key"
      FROM "User" u
      LEFT JOIN "ProfileImageCheck" c ON c."userId" = u."id" AND c."kind" = 'cover'
      WHERE u."coverStatus" = 'pending' AND u."coverKey" IS NOT NULL
        AND (c."userId" IS NULL OR c."objectKey" <> u."coverKey"
             OR (c."state" = 'retry' AND c."nextAttemptAt" <= ${now}))
      ORDER BY u."id"
      LIMIT ${limit}
    `);
    return [
      ...avatars.map((r) => ({ ...r, kind: 'avatar' as const })),
      ...covers.map((r) => ({ ...r, kind: 'cover' as const })),
    ].slice(0, limit);
  }

  /** Bookkeeping rows whose image is no longer the pending one (approved, rejected, replaced, deleted, account anonymised). */
  private async removeStaleBookkeeping(): Promise<void> {
    await this.prisma.$executeRaw`
      DELETE FROM "ProfileImageCheck" c
      WHERE NOT EXISTS (
        SELECT 1 FROM "User" u
        WHERE u."id" = c."userId"
          AND ((c."kind" = 'avatar' AND u."avatarStatus" = 'pending' AND u."avatarKey" = c."objectKey")
            OR (c."kind" = 'cover' AND u."coverStatus" = 'pending' AND u."coverKey" = c."objectKey"))
      )
    `;
  }

  /** Claims and checks one image. Safe to call from several workers: only one wins the claim. */
  async checkOne(image: DueProfileImage, now: Date = this.clock.now()): Promise<ProfileCheckOutcome> {
    if (!(await this.claim(image, now))) return 'skipped';

    const user = await this.prisma.user.findUnique({
      where: { id: image.userId },
      select: { isMinor: true, avatarKey: true, avatarStatus: true, coverKey: true, coverStatus: true },
    });
    const currentKey = user ? (image.kind === 'avatar' ? user.avatarKey : user.coverKey) : null;
    const currentStatus = user ? (image.kind === 'avatar' ? user.avatarStatus : user.coverStatus) : null;
    // Replaced, deleted, decided by someone else, or the account is gone between the query and the claim.
    if (!user || currentKey !== image.key || currentStatus !== 'pending') return 'skipped';

    try {
      const decision = await this.checks.checkStoredImage(image.key, user.isMinor);
      return await this.apply(image, decision.outcome);
    } catch (err) {
      return this.recordFailure(image, err, now);
    }
  }

  /**
   * Takes the image for this worker by writing its bookkeeping row with the lease as nextAttemptAt (no separate lease
   * column). Returns false when another worker holds it, or when it is already settled ('review' / 'gave_up').
   */
  private async claim(image: DueProfileImage, now: Date): Promise<boolean> {
    const { userId, kind, key } = image;
    const lease = new Date(now.getTime() + POST_MEDIA_DEFAULTS.checkLeaseSeconds * 1000);

    // 1. A row for an OLDER file (the picture was replaced): start over for this one.
    const stale = await this.prisma.profileImageCheck.updateMany({
      where: { userId, kind, NOT: { objectKey: key } },
      data: { objectKey: key, state: 'retry', attempts: 0, nextAttemptAt: lease },
    });
    if (stale.count === 1) return true;

    // 2. Our own row, due for another try.
    const retry = await this.prisma.profileImageCheck.updateMany({
      where: { userId, kind, objectKey: key, state: 'retry', nextAttemptAt: { lte: now } },
      data: { nextAttemptAt: lease },
    });
    if (retry.count === 1) return true;

    // 3. No row yet. A concurrent claim, or a settled row, makes this a P2002 -> not ours.
    try {
      await this.prisma.profileImageCheck.create({
        data: { userId, kind, objectKey: key, state: 'retry', attempts: 0, nextAttemptAt: lease },
      });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
      throw err;
    }
  }

  private async apply(image: DueProfileImage, outcome: 'approved' | 'rejected' | 'pending'): Promise<ProfileCheckOutcome> {
    const { userId, kind, key } = image;

    if (outcome === 'approved') {
      // FAIL CLOSED: publishing copies the file first. If the copy fails this throws, the caller records it as a
      // check failure, and the picture stays pending and private.
      const written = await this.publisher.publish(image);
      if (written) await this.dropBookkeeping(image);
      return written ? 'approved' : 'skipped';
    }

    if (outcome === 'rejected') {
      try {
        await this.review.rejectProfileImage(userId, kind, AUTO_REJECTION_REASON, key);
      } catch (err) {
        // The picture changed under the check (replaced, removed, already decided): nothing to reject any more.
        if (err instanceof ConflictException || err instanceof NotFoundException) return 'skipped';
        throw err;
      }
      await this.dropBookkeeping(image);
      return 'rejected';
    }

    // Between the thresholds: stays pending and waits for the moderator queue (B-037).
    await this.prisma.profileImageCheck.updateMany({
      where: { userId, kind, objectKey: key },
      data: { state: 'review', nextAttemptAt: null },
    });
    return 'pending';
  }

  private async dropBookkeeping(image: DueProfileImage): Promise<void> {
    await this.prisma.profileImageCheck
      .deleteMany({ where: { userId: image.userId, kind: image.kind } })
      .catch(() => undefined);
  }

  private async recordFailure(image: DueProfileImage, err: unknown, now: Date): Promise<ProfileCheckOutcome> {
    const { userId, kind, key } = image;
    const row = await this.prisma.profileImageCheck.findUnique({ where: { userId_kind: { userId, kind } } });
    // Only the row this worker claimed (same file) is touched; a replaced picture has its own row.
    if (!row || row.objectKey !== key) return 'skipped';
    const attempts = row.attempts + 1;
    this.logger.warn(
      `Profile ${kind} check for user ${userId} failed (attempt ${attempts}): ${err instanceof Error ? err.message : String(err)}`,
    );
    if (attempts >= this.config.checkMaxAttempts) {
      // Gave up: it stays pending for a moderator.
      await this.prisma.profileImageCheck.updateMany({
        where: { userId, kind, objectKey: key },
        data: { state: 'gave_up', attempts, nextAttemptAt: null },
      });
      return 'gave_up';
    }
    const delay = Math.min(CHECK_BACKOFF_BASE_MS * 2 ** (attempts - 1), CHECK_BACKOFF_MAX_MS);
    await this.prisma.profileImageCheck.updateMany({
      where: { userId, kind, objectKey: key },
      data: { state: 'retry', attempts, nextAttemptAt: new Date(now.getTime() + delay) },
    });
    return 'retry';
  }
}

// The schedule, kept apart from the logic (as the post-media sweeps are) so specs call the service with a fixed clock.
@Injectable()
export class ProfileImageCheckSweepService {
  private readonly logger = new Logger(ProfileImageCheckSweepService.name);

  constructor(private readonly checks: ProfileImageCheckService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run(): Promise<void> {
    try {
      const r = await this.checks.runDueChecks();
      if (r.checked > 0) this.logger.log(`Profile image check pass: ${JSON.stringify(r.outcomes)}`);
    } catch (err) {
      this.logger.error(`Profile image check pass failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
