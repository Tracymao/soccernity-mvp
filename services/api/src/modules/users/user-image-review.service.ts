import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// B-214 (Decision Log #412 item 2, #398 D2, #371): the storage half of "tell the
// uploader why their profile picture or cover was not approved".
//
// This is the method the image review queue (B-037) and the automatic image check
// (B-036) will call. Neither exists yet and the admin reject endpoint and screen
// are NOT built here, so nothing in the running app calls it today; the unit and
// e2e tests call it directly.
//
// One call does three things in ONE transaction, so they cannot land apart:
//   1. moves the image to status 'rejected' (it was 'pending' or 'approved'),
//   2. stores the reason on the same user row (<kind>RejectionReason),
//   3. writes ONE Notification (type 'profile_image_rejected', payloadRefId = the
//      kind). The Notification does NOT copy the reason: it lives on the owner's
//      record only, so a stale copy can never outlive the next upload.
// The reason is shown to the owner alone: it is returned on the owner's own
// GET /users/:id and is never selected by any read about another user.
// No email and no push (#412 item 2).

export type ProfileImageKind = 'avatar' | 'cover';
export const PROFILE_IMAGE_KINDS: readonly ProfileImageKind[] = ['avatar', 'cover'];

export const PROFILE_IMAGE_REJECTED_NOTIFICATION_TYPE = 'profile_image_rejected';

// Adopted default, veto-able (B-214): admin-written text, required, trimmed, at most
// 300 characters. It is an application rule on purpose; the database only enforces
// "present only on a rejected image, never blank".
export const PROFILE_IMAGE_REJECTION_REASON_MAX_LENGTH = 300;

export interface ProfileImageRejection {
  userId: string;
  kind: ProfileImageKind;
  status: 'rejected';
}

@Injectable()
export class UserImageReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async rejectProfileImage(userId: string, kind: ProfileImageKind, reason: unknown): Promise<ProfileImageRejection> {
    const cleaned = this.cleanReason(reason);

    await this.prisma.$transaction(async (tx) => {
      // Race-safe: the status test lives in the WHERE of the write itself, so two
      // moderators rejecting the same image cannot both succeed (one notification).
      const changed =
        kind === 'avatar'
          ? await tx.user.updateMany({
              where: { id: userId, avatarUrl: { not: null }, avatarStatus: { in: ['pending', 'approved'] } },
              data: { avatarStatus: 'rejected', avatarRejectionReason: cleaned },
            })
          : await tx.user.updateMany({
              where: { id: userId, coverUrl: { not: null }, coverStatus: { in: ['pending', 'approved'] } },
              data: { coverStatus: 'rejected', coverRejectionReason: cleaned },
            });

      if (changed.count === 0) {
        // Nothing was written, so nothing needs rolling back; work out why.
        const row = await tx.user.findUnique({
          where: { id: userId },
          select: { avatarStatus: true, coverStatus: true },
        });
        const status = row ? (kind === 'avatar' ? row.avatarStatus : row.coverStatus) : null;
        if (status === 'rejected') throw new ConflictException(`This ${kind} has already been rejected`);
        throw new NotFoundException(row ? `This user has no ${kind} to reject` : 'User not found');
      }

      await tx.notification.create({
        data: { userId, type: PROFILE_IMAGE_REJECTED_NOTIFICATION_TYPE, payloadRefId: kind },
        select: { id: true },
      });
    });

    return { userId, kind, status: 'rejected' };
  }

  private cleanReason(reason: unknown): string {
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      throw new BadRequestException('A rejection reason is required');
    }
    const trimmed = reason.trim();
    if (trimmed.length > PROFILE_IMAGE_REJECTION_REASON_MAX_LENGTH) {
      throw new BadRequestException(
        `The rejection reason must be at most ${PROFILE_IMAGE_REJECTION_REASON_MAX_LENGTH} characters`,
      );
    }
    return trimmed;
  }
}
