import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { UploadedProfileImage, uploadProfileImage, validateProfileImage } from './profile-image.util';

// B-196 (Decision Log #411 item 4, #371, #394 A2): the cover photo, built on the
// avatar pipeline with the SAME rules -- not a second design:
//   - the same StorageService, so with no object store configured the upload is
//     a 503 and NOTHING is written (the message a person sees is the friendly one
//     from profile-image.util.ts; the S3_* detail stays in the server log);
//   - the same file rules (profile-image.util.ts: JPEG/PNG/WebP, 5 MB, magic bytes);
//   - the same PENDING-AND-INVISIBLE rule: a new upload is stored 'pending' and
//     is visible to its owner only; only an 'approved' cover is ever served to
//     another user, and nothing in this codebase sets 'approved' until the
//     automatic image check (B-036) and the review queue (B-037) exist;
//   - the same object removal on replacement, delete and anonymization.
// It does NOT create a MediaAsset row (that table is the admin media library).
// The bytes are stored AS UPLOADED: EXIF is not stripped (B-205).
// NOT decided (a frontend concern until a frame draws it): cover dimensions and
// aspect ratio.

export interface CoverResult {
  // rejectionReason (B-214): always null here -- an upload clears any earlier reason; a
  // reason exists only on a 'rejected' cover and is read from the owner's GET /users/:id.
  cover: { url: string; status: 'pending' | 'approved' | 'rejected'; rejectionReason: string | null } | null;
}

@Injectable()
export class UserCoverService {
  private readonly logger = new Logger(UserCoverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // POST /users/:id/cover (self only). Same order as the avatar: validate the
  // file, store it (an unconfigured store is a 503 BEFORE any database write),
  // point the row at it, then remove the previous object best-effort.
  async uploadCover(userId: string, file: UploadedProfileImage | undefined): Promise<CoverResult> {
    const type = validateProfileImage(file);
    const upload = file as UploadedProfileImage;

    const key = `covers/${userId}/${randomUUID()}.${type.ext}`;
    const url = await uploadProfileImage(this.storage, this.logger, upload.buffer, key, upload.mimetype);

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

    return { cover: { url, status: 'pending', rejectionReason: null } };
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
