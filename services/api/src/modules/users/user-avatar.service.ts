import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';

// backend/w5-profile-block (B-035; Decision Log #371, #394 A2, #307).
//
// 5 MB: an avatar is a small square picture, not media. Adopted default (the
// Decision Log fixes no size); the admin media route's 50 MB is for video.
export const AVATAR_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

// JPEG, PNG and WebP only. No GIF (animated avatars are a moderation burden the
// automatic image check, B-036, is not designed for) and no video. Adopted
// default, veto-able.
const AVATAR_TYPES = {
  'image/jpeg': { ext: 'jpg', magic: (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': {
    ext: 'png',
    magic: (b: Buffer) =>
      b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a,
  },
  'image/webp': {
    ext: 'webp',
    magic: (b: Buffer) =>
      b.length > 12 &&
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
} as const;
type AvatarMime = keyof typeof AVATAR_TYPES;

export const AVATAR_UNSUPPORTED_MESSAGE = 'Please choose a JPEG, PNG or WebP picture.';

export interface UploadedAvatarFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

export interface AvatarResult {
  avatar: { url: string; status: 'pending' | 'approved' | 'rejected' } | null;
}

// An avatar is the owner's picture on their profile. It reuses the SAME
// StorageService the admin media upload uses (S3-compatible, R2 per #307), so
// with no storage configured it answers the same 503 and writes nothing. It
// does NOT create a MediaAsset row: that table is the admin media library
// (uploaderId is an admin id, the admin list shows every row) and an end-user
// picture must not appear in it.
//
// VISIBILITY. A new upload is stored with avatarStatus 'pending'. Only an
// 'approved' avatar is ever served to other users (UsersService.getPublicProfile),
// and nothing in this codebase sets 'approved' yet: the automatic image check
// (Amazon Rekognition, B-036) and the EXIF-stripping re-encode do not exist, and
// #371 says flagged images must not go live. Serving an unchecked picture of a
// child is the unsafe default, so until B-036 flips the status an avatar is
// visible to its owner only. (OPEN in docs/backend-w5-report.md: the founder may
// instead choose to serve unchecked avatars; that is one line in
// getPublicProfile.) The bytes are stored AS UPLOADED, so embedded EXIF/location
// metadata is not stripped here either (B-036).
@Injectable()
export class UserAvatarService {
  private readonly logger = new Logger(UserAvatarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // POST /users/:id/avatar (self only). Order matters: validate the file, then
  // store it (so an unconfigured store is a 503 BEFORE any database write), then
  // point the row at it, then remove the previous object best-effort.
  async uploadAvatar(userId: string, file: UploadedAvatarFile | undefined): Promise<AvatarResult> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('No file was attached to this upload.');
    }
    const type = AVATAR_TYPES[file.mimetype as AvatarMime];
    // The declared type must be allowed AND the bytes must really start like that
    // format, so a renamed or mislabelled file is refused (same message either way).
    if (!type || !type.magic(file.buffer)) {
      throw new BadRequestException(AVATAR_UNSUPPORTED_MESSAGE);
    }

    const key = `avatars/${userId}/${randomUUID()}.${type.ext}`;
    const url = await this.storage.upload(file.buffer, key, file.mimetype);

    const previous = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarKey: true } });
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: url, avatarKey: key, avatarStatus: 'pending' },
        select: { id: true },
      });
    } catch (err) {
      await this.removeObject(key);
      throw err;
    }
    if (previous?.avatarKey) await this.removeObject(previous.avatarKey);

    return { avatar: { url, status: 'pending' } };
  }

  // DELETE /users/:id/avatar (self only). Idempotent: no avatar is a 200 no-op.
  async deleteAvatar(userId: string): Promise<AvatarResult> {
    const current = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarKey: true } });
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null, avatarKey: null, avatarStatus: null },
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
