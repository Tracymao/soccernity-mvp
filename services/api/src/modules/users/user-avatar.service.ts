import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { MediaProcessor } from '../post-media/media-processor';
import { ProfileImageViewService } from './profile-image-view.service';
import {
  PROFILE_IMAGE_MAX_FILE_SIZE_BYTES,
  PROFILE_IMAGE_UNSUPPORTED_MESSAGE,
  privateProfileKey,
  publicProfileKeyFor,
  uploadProfileImage,
  validateProfileImage,
} from './profile-image.util';

// backend/w5-profile-block (B-035; Decision Log #371, #394 A2, #307).
//
// File rules are shared with the cover photo (profile-image.util.ts, B-196):
// JPEG/PNG/WebP only, 5 MB, magic bytes must match the declared type.
export const AVATAR_MAX_FILE_SIZE_BYTES = PROFILE_IMAGE_MAX_FILE_SIZE_BYTES;
export const AVATAR_UNSUPPORTED_MESSAGE = PROFILE_IMAGE_UNSUPPORTED_MESSAGE;

export interface UploadedAvatarFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

export interface AvatarResult {
  // rejectionReason (B-214): always null here -- an upload clears any earlier reason; a
  // reason exists only on a 'rejected' avatar and is read from the owner's GET /users/:id.
  avatar: { url: string | null; status: 'pending' | 'approved' | 'rejected'; rejectionReason: string | null } | null;
}

// An avatar is the owner's picture on their profile. It reuses the SAME
// StorageService the admin media upload uses (S3-compatible, R2 per #307), so
// with no storage configured it answers the same 503 and writes nothing. It
// does NOT create a MediaAsset row: that table is the admin media library
// (uploaderId is an admin id, the admin list shows every row) and an end-user
// picture must not appear in it.
//
// VISIBILITY. A new upload is stored with avatarStatus 'pending' in the PRIVATE prefix (private-profile/,
// profile-image.util.ts): no public base URL maps it, so nobody who holds its address can fetch it. Only an
// 'approved' avatar is ever served to other users (UsersService.getPublicProfile), and the only thing that sets
// 'approved' is the automatic image check (ProfileImageCheckService, B-036), which first copies the file to the
// public prefix (profile-media/) and only then flips the status -- or a moderator (B-037, not built). The OWNER
// sees a pending or rejected picture through a short-lived signed link to the private file
// (ProfileImageViewService); the response's url is that link, never a public address. The bytes are RE-ENCODED
// before they are stored (B-205, profile-image.util.ts): orientation applied, all EXIF/GPS/XMP/IPTC removed,
// the original never stored.
@Injectable()
export class UserAvatarService {
  private readonly logger = new Logger(UserAvatarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DirectUploadStorageService,
    private readonly view: ProfileImageViewService,
    private readonly processor: MediaProcessor,
  ) {}

  // POST /users/:id/avatar (self only). Order matters: validate the file, then
  // store it (so an unconfigured store is a 503 BEFORE any database write), then
  // point the row at it, then remove the previous object best-effort.
  async uploadAvatar(userId: string, file: UploadedAvatarFile | undefined): Promise<AvatarResult> {
    const type = validateProfileImage(file);
    const upload = file as UploadedAvatarFile;

    // Stored in the PRIVATE prefix: nothing at the public address can serve it until the check approves it.
    const key = privateProfileKey(userId, randomUUID(), type.ext);
    await uploadProfileImage(this.storage, this.processor, this.logger, upload.buffer, key, upload.mimetype);
    // The URL the file WILL have once approved (built, not fetched). It is served to other users only while the
    // status is 'approved'; the owner is given a signed link to the private file instead.
    const url = this.storage.publicUrlFor(publicProfileKeyFor(key));

    const previous = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarKey: true } });
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: url, avatarKey: key, avatarStatus: 'pending', avatarRejectionReason: null },
        select: { id: true },
      });
    } catch (err) {
      await this.removeObject(key);
      throw err;
    }
    if (previous?.avatarKey) await this.removeObject(previous.avatarKey);

    return { avatar: { url: await this.view.signedLink(key), status: 'pending', rejectionReason: null } };
  }

  // DELETE /users/:id/avatar (self only). Idempotent: no avatar is a 200 no-op.
  async deleteAvatar(userId: string): Promise<AvatarResult> {
    const current = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarKey: true } });
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null, avatarKey: null, avatarStatus: null, avatarRejectionReason: null },
      select: { id: true },
    });
    if (current?.avatarKey) await this.removeObject(current.avatarKey);
    return { avatar: null };
  }

  // Best effort: the row is the source of truth for what the user sees, so a
  // storage failure must not fail the request. A leftover object is logged with
  // its key so it can be cleaned up.
  private async removeObject(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (err) {
      this.logger.warn(
        `Avatar object ${key} was not removed from storage (${err instanceof Error ? err.message : String(err)}).`,
      );
    }
  }
}
