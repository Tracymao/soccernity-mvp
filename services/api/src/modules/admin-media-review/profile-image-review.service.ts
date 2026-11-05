import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaModerationClient } from '../post-media/media-moderation-client';
import { POST_MEDIA_DEFAULTS } from '../post-media/post-media.config';
import { MEDIA_REVIEW_CODES, postMediaError } from '../post-media/post-media.errors';
import { ModeratorDecisionResult } from '../post-media/post-media-decision.service';
import { ProfileImagePublishService } from '../users/profile-image-publish.service';
import { ProfileImageViewService } from '../users/profile-image-view.service';
import { PUBLIC_NAME_SELECT, toPublicUser } from '../users/public-name.util';
import { UserImageReviewService } from '../users/user-image-review.service';
import { MediaReviewOrder } from './dto/list-media-review-query.dto';
import { ProfilePosition } from './media-review.cursor';
import { MediaReviewItem } from './media-review.types';
import { fileNameOf, formatProfileItemId, parseProfileItemId, ProfileItemKind, ProfileItemRef } from './profile-image-item-id';

// backend/b037-profile-image-review (B-037; Decision Log #411 item 1, #468). The PROFILE PICTURE half of the
// moderator media review queue: a user's avatar or cover photo that the automatic check (B-036) could not decide.
//
// WHAT IS IN THE QUEUE. An avatar / cover whose status is 'pending' AND
//   - the automatic check looked at it and left it uncertain ('review') or failed every attempt ('gave_up'), or
//   - the automatic check is NOT configured at all, so nothing would ever decide it.
// A picture the check is still retrying, or has not picked up yet while the check IS configured, is not shown: the
// check will decide it. The source is always "the automatic check" (there is no route for a user to report a profile
// picture, and none is added here).
//
// WHAT A MODERATOR SEES. The uploader's PUBLIC name and id (never an email or a real name), the type, the age, and a
// short-lived signed link to the PRIVATE file. No label percentages: the check does not store them.
//
// THE ID NAMES THE FILE (profile-image-item-id.ts): "<avatar|cover>:<userId>:<file>". A decision is applied to
// exactly that file; if the person has since uploaded another, the id matches nothing (404) and the old decision can
// never reach the new picture.
//
// DECISIONS REUSE THE EXISTING CODE: Approve is ProfileImagePublishService.publish (the very code the automatic check
// runs: copy to the public prefix, verify, then flip the status, only while the row still points at that file) and
// Reject is UserImageReviewService.rejectProfileImage (reason stored, ONE notification to the uploader, the guardian
// notice for a minor). Approve sends no notification, as the automatic approval sends none.

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** A candidate row of the queue, before the uploader and the link are filled in. */
export interface ProfileQueueRow {
  kind: ProfileItemKind;
  userId: string;
  key: string;
  uploadedAt: Date | null;
}

export interface ProfileRejectResult extends ModeratorDecisionResult {
  userId: string;
  kind: ProfileItemKind;
}

@Injectable()
export class ProfileImageReviewService {
  private readonly logger = new Logger(ProfileImageReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: MediaModerationClient,
    private readonly publisher: ProfileImagePublishService,
    private readonly review: UserImageReviewService,
    private readonly view: ProfileImageViewService,
  ) {}

  /** Position of a queue row in the profile stream (what a cursor remembers). */
  static positionOf(row: ProfileQueueRow): ProfilePosition {
    return {
      at: row.uploadedAt?.getTime() ?? 0,
      id: `${row.kind}:${row.userId}`,
    };
  }

  // ---- listing ---------------------------------------------------------------------------------------

  /**
   * The next `limit` profile pictures in the queue after `after`, in the queue's order: upload time (a picture of
   * unknown age counts as the oldest), then "<kind>:<userId>". `vetted` false leaves out a minor's pictures.
   */
  async listCandidates(args: {
    order: MediaReviewOrder;
    after?: ProfilePosition;
    limit: number;
    vetted: boolean;
  }): Promise<ProfileQueueRow[]> {
    const newest = args.order === 'newest';
    const dir = newest ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    // The check never runs when it is not configured, so then every pending picture is waiting for a person.
    const unconfigured = !this.moderation.isConfigured;

    const cursorAt = args.after ? new Date(args.after.at) : null;
    const cursorId = args.after ? args.after.id : null;
    const cursor =
      args.after === undefined
        ? Prisma.empty
        : newest
          ? Prisma.sql`AND (t."sortAt" < ${cursorAt} OR (t."sortAt" = ${cursorAt} AND t."sortId" COLLATE "C" < ${cursorId}::text COLLATE "C"))`
          : Prisma.sql`AND (t."sortAt" > ${cursorAt} OR (t."sortAt" = ${cursorAt} AND t."sortId" COLLATE "C" > ${cursorId}::text COLLATE "C"))`;

    const rows = await this.prisma.$queryRaw<
      Array<{
        kind: ProfileItemKind;
        userId: string;
        key: string;
        uploadedAt: Date | null;
      }>
    >(Prisma.sql`
      SELECT t."kind", t."userId", t."key", t."uploadedAt"
      FROM (
        SELECT 'avatar'::text AS "kind", u."id" AS "userId", u."avatarKey" AS "key", u."avatarUploadedAt" AS "uploadedAt",
               COALESCE(u."avatarUploadedAt", TIMESTAMP '1970-01-01') AS "sortAt", ('avatar:' || u."id") AS "sortId",
               u."isMinor" AS "isMinor"
        FROM "User" u
        LEFT JOIN "ProfileImageCheck" c ON c."userId" = u."id" AND c."kind" = 'avatar' AND c."objectKey" = u."avatarKey"
        WHERE u."avatarStatus" = 'pending' AND u."avatarKey" IS NOT NULL
          AND (c."state" IN ('review', 'gave_up') OR ${unconfigured}::boolean)
        UNION ALL
        SELECT 'cover'::text AS "kind", u."id" AS "userId", u."coverKey" AS "key", u."coverUploadedAt" AS "uploadedAt",
               COALESCE(u."coverUploadedAt", TIMESTAMP '1970-01-01') AS "sortAt", ('cover:' || u."id") AS "sortId",
               u."isMinor" AS "isMinor"
        FROM "User" u
        LEFT JOIN "ProfileImageCheck" c ON c."userId" = u."id" AND c."kind" = 'cover' AND c."objectKey" = u."coverKey"
        WHERE u."coverStatus" = 'pending' AND u."coverKey" IS NOT NULL
          AND (c."state" IN ('review', 'gave_up') OR ${unconfigured}::boolean)
      ) t
      WHERE (${args.vetted}::boolean OR t."isMinor" = false)
      ${cursor}
      ORDER BY t."sortAt" ${dir}, t."sortId" COLLATE "C" ${dir}
      LIMIT ${args.limit}
    `);
    return rows;
  }

  /** Shapes queue rows into items: public name and id, age and a short-lived link to the private file. */
  async toItems(rows: ProfileQueueRow[], now: Date): Promise<MediaReviewItem[]> {
    if (rows.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
      select: { id: true, ...PUBLIC_NAME_SELECT },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return Promise.all(
      rows.map(async (row): Promise<MediaReviewItem> => {
        const user = byId.get(row.userId);
        const url = await this.view.signedLink(row.key);
        const ext = row.key.split('.').pop() ?? '';
        return {
          id: formatProfileItemId(row.kind, row.userId, row.key),
          type: row.kind === 'avatar' ? 'profile_avatar' : 'profile_cover',
          kind: 'image',
          contentType: CONTENT_TYPE_BY_EXT[ext] ?? null,
          sizeBytes: null,
          durationSeconds: null,
          status: 'pending',
          awaitingDecision: true,
          sources: ['auto_check'],
          reportCount: 0,
          hiddenPendingReview: false,
          reportReasons: [],
          // The check does not store its labels, and none is added here.
          checkLabels: [],
          uploader: user ? toPublicUser(user) : { id: row.userId, publicName: 'Unknown' },
          postId: null,
          uploadedAt: row.uploadedAt,
          ageSeconds: row.uploadedAt ? Math.max(0, Math.floor((now.getTime() - row.uploadedAt.getTime()) / 1000)) : null,
          enteredQueueAt: null,
          decidedAt: null,
          decisionSource: null,
          rejectionReason: null,
          viewUrl: url,
          viewUrlExpiresAt: url ? new Date(now.getTime() + POST_MEDIA_DEFAULTS.reviewViewUrlTtlSeconds * 1000) : null,
        };
      }),
    );
  }

  // ---- one item --------------------------------------------------------------------------------------

  /** GET /admin/media-review/:id for a profile picture. Only a picture that is in the queue; anything else is a 404. */
  async get(id: string, vetted: boolean, now: Date): Promise<MediaReviewItem> {
    const target = await this.resolve(id, vetted);
    if (target.status !== 'pending' || !(await this.isWaitingForPerson(target))) throw this.notFound();
    const [item] = await this.toItems(
      [
        {
          kind: target.kind,
          userId: target.userId,
          key: target.key,
          uploadedAt: target.uploadedAt,
        },
      ],
      now,
    );
    return item;
  }

  async approve(id: string, vetted: boolean): Promise<ModeratorDecisionResult> {
    const target = await this.resolveForDecision(id, vetted);
    let written: boolean;
    try {
      written = await this.publisher.publish({
        userId: target.userId,
        kind: target.kind,
        key: target.key,
      });
    } catch (err) {
      // FAIL CLOSED: nothing was approved and nothing is public. The moderator can simply try again.
      this.logger.error(`Approval of ${id} not applied: publishing failed (${err instanceof Error ? err.message : String(err)}).`);
      throw postMediaError(
        503,
        MEDIA_REVIEW_CODES.publishFailed,
        "The file couldn't be published right now. It is still waiting for review; please try again.",
      );
    }
    // false: the picture was replaced, removed or decided while the copy was made.
    if (!written) throw this.alreadyDecided();
    await this.dropBookkeeping(target);
    return { id, outcome: 'approved', status: 'approved' };
  }

  async reject(id: string, vetted: boolean, reason: string): Promise<ProfileRejectResult> {
    const target = await this.resolveForDecision(id, vetted);
    try {
      // The key of the picture the moderator was shown: a re-upload since can never be rejected by this decision.
      await this.review.rejectProfileImage(target.userId, target.kind, reason, target.key);
    } catch (err) {
      if (err instanceof ConflictException) throw this.alreadyDecided();
      if (err instanceof NotFoundException) throw this.notFound();
      throw err;
    }
    await this.dropBookkeeping(target);
    return {
      id,
      outcome: 'rejected',
      status: 'rejected',
      userId: target.userId,
      kind: target.kind,
    };
  }

  // ---- lookup ----------------------------------------------------------------------------------------

  private notFound() {
    return postMediaError(404, 'media_not_found', 'Media not found');
  }

  private alreadyDecided() {
    return postMediaError(409, MEDIA_REVIEW_CODES.alreadyDecided, 'This item has already been decided or is not waiting for review.');
  }

  /**
   * Finds the picture an id names: the person must exist, their CURRENT file for that kind must be the file the id
   * names, and a minor's picture is for a child-safety-vetted admin only (to anyone else it does not exist).
   */
  private async resolve(id: string, vetted: boolean) {
    const ref: ProfileItemRef | null = parseProfileItemId(id);
    if (!ref) throw this.notFound();
    const user = await this.prisma.user.findUnique({
      where: { id: ref.userId },
      select: {
        id: true,
        isMinor: true,
        avatarKey: true,
        avatarStatus: true,
        avatarUploadedAt: true,
        coverKey: true,
        coverStatus: true,
        coverUploadedAt: true,
      },
    });
    if (!user) throw this.notFound();
    const key = ref.kind === 'avatar' ? user.avatarKey : user.coverKey;
    if (!key || fileNameOf(key) !== ref.file) throw this.notFound();
    if (user.isMinor && !vetted) throw this.notFound();
    return {
      kind: ref.kind,
      userId: user.id,
      key,
      status: (ref.kind === 'avatar' ? user.avatarStatus : user.coverStatus) ?? null,
      uploadedAt: (ref.kind === 'avatar' ? user.avatarUploadedAt : user.coverUploadedAt) ?? null,
    };
  }

  /** For Approve / Reject: the picture must be pending and in the queue; a decided one is a 409. */
  private async resolveForDecision(id: string, vetted: boolean) {
    const target = await this.resolve(id, vetted);
    if (target.status !== 'pending') throw this.alreadyDecided();
    if (!(await this.isWaitingForPerson(target))) {
      throw postMediaError(409, MEDIA_REVIEW_CODES.notInQueue, 'This item is not in the review queue.');
    }
    return target;
  }

  /** Same rule as the list: the check left it undecided, or the check is not configured so it never will decide. */
  private async isWaitingForPerson(target: { kind: ProfileItemKind; userId: string; key: string }): Promise<boolean> {
    if (!this.moderation.isConfigured) return true;
    const row = await this.prisma.profileImageCheck.findUnique({
      where: { userId_kind: { userId: target.userId, kind: target.kind } },
    });
    return !!row && row.objectKey === target.key && (row.state === 'review' || row.state === 'gave_up');
  }

  private async dropBookkeeping(target: { kind: ProfileItemKind; userId: string }): Promise<void> {
    await this.prisma.profileImageCheck.deleteMany({ where: { userId: target.userId, kind: target.kind } }).catch(() => undefined);
  }
}
