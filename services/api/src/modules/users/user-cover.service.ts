import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { MediaProcessor } from '../post-media/media-processor';
import { ProfileImageViewService } from './profile-image-view.service';
import {
  UploadedProfileImage,
  privateProfileKey,
  publicProfileKeyFor,
  uploadProfileImage,
  validateProfileImage,
} from './profile-image.util';

// B-196 (Decision Log #411 item 4, #371, #394 A2): the cover photo, built on the
// avatar pipeline with the SAME rules -- not a second design:
//   - the same StorageService, so with no object store configured the upload is
//     a 503 and NOTHING is written (the message a person sees is the friendly one
//     from profile-image.util.ts; the S3_* detail stays in the server log);
//   - the same file rules (profile-image.util.ts: JPEG/PNG/WebP, 5 MB, magic bytes);
//   - the same PENDING-AND-INVISIBLE rule: a new upload is stored 'pending' in the PRIVATE prefix
//     (private-profile/) and is visible to its owner only, through a signed link; only an 'approved' cover is
//     ever served to another user, and only the automatic image check (ProfileImageCheckService, B-036)
//     sets 'approved' -- after copying the file to the public prefix (profile-media/);
//   - the same object removal on replacement, delete and anonymization.
// It does NOT create a MediaAsset row (that table is the admin media library).
// The bytes are RE-ENCODED before they are stored (B-205, profile-image.util.ts), the same
// as the avatar: all metadata removed, the original never stored.
// NOT decided (a frontend concern until a frame draws it): cover dimensions and
// aspect ratio.

export interface CoverResult {
  // rejectionReason (B-214): always null here -- an upload clears any earlier reason; a
  // reason exists only on a 'rejected' cover and is read from the owner's GET /users/:id.
  cover: { url: string | null; status: 'pending' | 'approved' | 'rejected'; rejectionReason: string | null } | null;
}

@Injectable()
export class UserCoverService {
  private readonly logger = new Logger(UserCoverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DirectUploadStorageService,
    private readonly view: ProfileImageViewService,
    private readonly processor: MediaProcessor,
  ) {}

  // POST /users/:id/cover (self only). Same order as the avatar: validate the
  // file, store it (an unconfigured store is a 503 BEFORE any database write),
  // point the row at it, then remove the previous object best-effort.
  async uploadCover(userId: string, file: UploadedProfileImage | undefined): Promise<CoverResult> {
    const type = validateProfileImage(file);
    const upload = file as UploadedProfileImage;

    // Stored in the PRIVATE prefix: nothing at the public address can serve it until the check approves it.
    const key = privateProfileKey(userId, randomUUID(), type.ext);
    await uploadProfileImage(this.storage, this.processor, this.logger, upload.buffer, key, upload.mimetype);
    // The URL the file WILL have once approved (built, not fetched). It is served to other users only while the
    // status is 'approved'; the owner is given a signed link to the private file instead.
    const url = this.storage.publicUrlFor(publicProfileKeyFor(key));

    const previous = await this.prisma.user.findUnique({ where: { id: userId }, select: { coverKey: true } });
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { coverUrl: url, coverKey: key, coverStatus: 'pending', coverRejectionReason: null },
        select: { id: true },
      });
    } catch (err) {
      await this.removeObject(key);
      throw err;
    }
    if (previous?.coverKey) await this.removeObject(previous.coverKey);

    return { cover: { url: await this.view.signedLink(key), status: 'pending', rejectionReason: null } };
  }

  // DELETE /users/:id/cover (self only). Idempotent: no cover is a 200 no-op.
  async deleteCover(userId: string): Promise<CoverResult> {
    const current = await this.prisma.user.findUnique({ where: { id: userId }, select: { coverKey: true } });
    await this.prisma.user.update({
      where: { id: userId },
      data: { coverUrl: null, coverKey: null, coverStatus: null, coverRejectionReason: null },
      select: { id: true },
    });
    if (current?.coverKey) await this.removeObject(current.coverKey);
    return { cover: null };
  }

  // Best effort: the row is the source of truth for what the user sees. A
  // leftover object is logged with its key so it can be cleaned up.
  private async removeObject(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (err) {
      this.logger.warn(
        `Cover object ${key} was not removed from storage (${err instanceof Error ? err.message : String(err)}).`,
      );
    }
  }
}
