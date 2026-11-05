import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { isPublicProfileKey, privateProfileKeyFor } from './profile-image.util';
import { GuardianSecurityNoticeService } from '../guardian-security-notice/guardian-security-notice.service';

// B-214 (Decision Log #412 item 2, #398 D2, #371): the storage half of "tell the
// uploader why their profile picture or cover was not approved".
//
// This is the method the automatic image check (ProfileImageCheckService, B-036) calls
// for a clear reject, and the moderator queue (POST /admin/media-review/:id/reject, B-037) calls.
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
//
// backend/b037-profile-image-review (B-037). An image that is already APPROVED lives in the PUBLIC prefix
// (profile-media/). Rejecting it must leave NO fetchable file behind, so before the database changes the file is
// withdrawn in this order:
//   1. copy it to the private prefix and verify the copy,
//   2. delete the public object,
//   3. in ONE transaction point the row at the private key, mark it rejected and write the notification.
// Any failure in 1 or 2 throws BEFORE anything is rejected (the picture simply stays as it was and the caller can
// retry); a retry after a failure between 2 and 3 finds the file already moved and finishes the job. There is no
// moment at which a rejected picture still has a public object. Only a picture that never was published (pending,
// key already private) needs none of this.

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
  private readonly logger = new Logger(UserImageReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    // B-279 (Decision Log #456 A): rejecting a minor's profile picture or cover is a platform action, so the
    // minor's guardian is told the kind of action (never the reason).
    private readonly guardianNotices: GuardianSecurityNoticeService,
    // B-037: needed only to withdraw an already-published picture. Optional so a caller that never rejects one
    // (and a spec that builds this service without storage) keeps its shape; UsersModule always provides it.
    @Optional() private readonly storage?: DirectUploadStorageService,
  ) {}

  // expectedKey (B-036): when given, the rejection is written ONLY while the user's avatar / cover still points at
  // that stored file. The automatic check passes the key it checked, so a re-upload that landed while the check ran
  // (a different file, new key) can never be rejected by the OLD file's result. The moderator queue (B-037) passes the
  // key of the item the moderator was shown, for the same reason. A key that no longer matches is reported exactly like "no such image" (404).
  async rejectProfileImage(
    userId: string,
    kind: ProfileImageKind,
    reason: unknown,
    expectedKey?: string,
  ): Promise<ProfileImageRejection> {
    const cleaned = this.cleanReason(reason);

    // Is the file currently PUBLISHED? Known from the expected key when the caller has one; otherwise read it.
    const liveKey = expectedKey ?? (await this.currentKey(userId, kind));
    const withdraw = liveKey !== null && isPublicProfileKey(liveKey) ? await this.withdrawPublicObject(liveKey) : null;
    // The key the row is pointed at by this rejection (only when a published file was withdrawn).
    const movedTo = withdraw?.privateKey ?? null;
    const guardKey = withdraw ? liveKey : expectedKey;

    try {
      await this.prisma.$transaction(async (tx) => {
        // Race-safe: the status test lives in the WHERE of the write itself, so two
        // moderators rejecting the same image cannot both succeed (one notification).
        const changed =
          kind === 'avatar'
            ? await tx.user.updateMany({
                where: {
                  id: userId,
                  avatarUrl: { not: null },
                  avatarStatus: { in: ['pending', 'approved'] },
                  ...(guardKey ? { avatarKey: guardKey } : {}),
                },
                data: {
                  avatarStatus: 'rejected',
                  avatarRejectionReason: cleaned,
                  ...(movedTo ? { avatarKey: movedTo } : {}),
                },
              })
            : await tx.user.updateMany({
                where: {
                  id: userId,
                  coverUrl: { not: null },
                  coverStatus: { in: ['pending', 'approved'] },
                  ...(guardKey ? { coverKey: guardKey } : {}),
                },
                data: {
                  coverStatus: 'rejected',
                  coverRejectionReason: cleaned,
                  ...(movedTo ? { coverKey: movedTo } : {}),
                },
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
          data: {
            userId,
            type: PROFILE_IMAGE_REJECTED_NOTIFICATION_TYPE,
            payloadRefId: kind,
          },
          select: { id: true },
        });
      });
    } catch (err) {
      // The rejection was not written. A private copy made for it must not outlive it -- unless another rejection
      // of the same picture won the race and the row now points at exactly that file.
      if (movedTo) await this.discardPrivateCopy(userId, kind, movedTo);
      throw err;
    }

    this.guardianNotices.notifyInBackground(userId, 'profile_image_not_approved');

    return { userId, kind, status: 'rejected' };
  }

  private async currentKey(userId: string, kind: ProfileImageKind): Promise<string | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarKey: true, coverKey: true },
    });
    if (!row) return null;
    return (kind === 'avatar' ? row.avatarKey : row.coverKey) ?? null;
  }

  /**
   * Moves a PUBLISHED picture back to the private prefix and returns its private key. Idempotent, so a retry after a
   * failure part-way finishes the job: if the public object is already gone but the private copy exists, there is
   * nothing left to move. Throws (before anything is rejected) when the file cannot be moved or deleted.
   */
  private async withdrawPublicObject(publicKey: string): Promise<{ privateKey: string }> {
    if (!this.storage)
      throw new ServiceUnavailableException("The picture can't be taken down right now. Please try again.");
    const privateKey = privateProfileKeyFor(publicKey);
    try {
      const original = await this.storage.head(publicKey);
      if (original) {
        const contentType = original.contentType ?? 'application/octet-stream';
        await this.storage.copyObject(publicKey, privateKey, contentType);
        const copy = await this.storage.head(privateKey);
        if (!copy || copy.size !== original.size) {
          await this.discardQuietly(privateKey);
          throw new Error(`The private copy of ${publicKey} does not match the original`);
        }
        await this.storage.delete(publicKey);
      } else if (!(await this.storage.head(privateKey))) {
        // Neither the public nor the private object exists: there is nothing to move and nothing to keep.
        throw new Error(`Neither ${publicKey} nor its private copy exists`);
      }
    } catch (err) {
      this.logger.error(
        `Taking down ${publicKey} failed, nothing was rejected (${err instanceof Error ? err.message : String(err)}).`,
      );
      throw new ServiceUnavailableException(
        "The picture can't be taken down right now. It has not been rejected; please try again.",
      );
    }
    return { privateKey };
  }

  /** Removes the private copy made for a rejection that was not written, unless the row now points at it. */
  private async discardPrivateCopy(userId: string, kind: ProfileImageKind, privateKey: string): Promise<void> {
    try {
      const live = await this.currentKey(userId, kind);
      if (live === privateKey) return;
      await this.discardQuietly(privateKey);
    } catch (err) {
      this.logger.warn(
        `Private copy ${privateKey} was not checked for removal (${err instanceof Error ? err.message : String(err)}).`,
      );
    }
  }

  private async discardQuietly(key: string): Promise<void> {
    try {
      await this.storage?.delete(key);
    } catch (err) {
      this.logger.warn(`Private copy ${key} not deleted (${err instanceof Error ? err.message : String(err)}).`);
    }
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
