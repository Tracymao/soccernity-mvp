import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { ProfileImageKind } from './user-image-review.service';
import { publicProfileKeyFor } from './profile-image.util';

// backend/b036-avatar-cover-check + backend/b037-profile-image-review (B-036, B-037; Decision Log #411 item 1).
// The ONE place a pending profile picture is PUBLISHED. Used by the automatic check (ProfileImageCheckService,
// when the result is clearly fine) and by the moderator queue (ProfileImageReviewService, on Approve), so the
// two can never publish differently.

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export interface PendingProfileImage {
  userId: string;
  kind: ProfileImageKind;
  /** The private key the decision was made on. */
  key: string;
}

@Injectable()
export class ProfileImagePublishService {
  private readonly logger = new Logger(ProfileImagePublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DirectUploadStorageService,
  ) {}

  /**
   * Copies the checked file to the public prefix, verifies the copy, then flips the row to 'approved' pointing at the
   * public key -- ONLY if the row still points at the key that was checked and is still 'pending'. Returns false (and
   * removes the copy) when it does not: the picture was replaced, removed or decided while the copy was made. The old
   * private object is removed afterwards, best effort.
   *
   * FAIL CLOSED: if the copy fails or does not match, this throws and nothing is approved (the picture stays pending
   * and private).
   */
  async publish(image: PendingProfileImage): Promise<boolean> {
    const { userId, kind, key } = image;
    const publicKey = publicProfileKeyFor(key);

    const original = await this.storage.head(key);
    if (!original) throw new Error(`The stored ${kind} ${key} is missing`);
    const contentType = original.contentType ?? CONTENT_TYPE_BY_EXT[key.split('.').pop() ?? ''] ?? 'application/octet-stream';
    await this.storage.copyObject(key, publicKey, contentType);
    const copy = await this.storage.head(publicKey);
    if (!copy || copy.size !== original.size) {
      await this.deleteQuietly(publicKey, `Bad public copy of ${kind}`);
      throw new Error(`The public copy of ${kind} ${key} does not match the original`);
    }

    const url = this.storage.publicUrlFor(publicKey);
    let written: number;
    try {
      const result =
        kind === 'avatar'
          ? await this.prisma.user.updateMany({
              where: { id: userId, avatarKey: key, avatarStatus: 'pending' },
              data: {
                avatarKey: publicKey,
                avatarStatus: 'approved',
                avatarUrl: url,
              },
            })
          : await this.prisma.user.updateMany({
              where: { id: userId, coverKey: key, coverStatus: 'pending' },
              data: {
                coverKey: publicKey,
                coverStatus: 'approved',
                coverUrl: url,
              },
            });
      written = result.count;
    } catch (err) {
      await this.deleteQuietly(publicKey, `Unrecorded public copy of ${kind}`);
      throw err;
    }

    if (written === 0) {
      // The picture was replaced, removed or decided while the copy was made. The public copy is not the live file.
      await this.discardUnrecordedCopy(userId, kind, publicKey);
      return false;
    }
    await this.deleteQuietly(key, `Private original of ${kind}`);
    return true;
  }

  /** Removes a public copy that was made but never recorded -- unless something else has since made it the live file. */
  private async discardUnrecordedCopy(userId: string, kind: ProfileImageKind, publicKey: string): Promise<void> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarKey: true, coverKey: true },
    });
    const live = row ? (kind === 'avatar' ? row.avatarKey : row.coverKey) : null;
    if (live === publicKey) return;
    await this.deleteQuietly(publicKey, `Unrecorded public copy of ${kind}`);
  }

  private async deleteQuietly(key: string, context: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (err) {
      this.logger.warn(`${context}: ${key} not deleted (${err instanceof Error ? err.message : String(err)}).`);
    }
  }
}
