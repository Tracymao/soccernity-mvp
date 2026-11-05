import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { StorageService } from '../../storage/storage.service';
import { MediaProcessor, UnprocessableMediaError } from '../post-media/media-processor';
import { PostMediaContentType } from '../post-media/media-signature.util';

// Shared file rules for the two profile pictures: the avatar (B-035) and the
// cover photo (B-196, Decision Log #411 item 4: "built on the avatar pipeline
// with the same rule"). One definition so the two can never drift apart.
//
// 5 MB: a profile picture is a small image, not media. Adopted default (the
// Decision Log fixes no size); the admin media route's 50 MB is for video.
export const PROFILE_IMAGE_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

// JPEG, PNG and WebP only. No GIF (animated pictures are a moderation burden the
// automatic image check, B-036, is not designed for) and no video. Adopted
// default, veto-able.
export const PROFILE_IMAGE_TYPES = {
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
export type ProfileImageMime = keyof typeof PROFILE_IMAGE_TYPES;

// ---- where a profile picture lives (backend/b036-avatar-cover-check; Decision Log #411 item 1, B-257 design) ----
//
// The same private-then-public design post media uses, so an unchecked picture of a child is never readable
// through the public address:
//
//     a picture is in the PUBLIC prefix (profile-media/) only while it is APPROVED;
//     a picture that is pending, rejected or awaiting review lives in the PRIVATE prefix (private-profile/).
//
// User.avatarKey / coverKey always hold the file's CURRENT key, so the prefix says which state it is in.
// User.avatarUrl / coverUrl hold the file's FUTURE public URL (what publicUrlFor returns for the public key; no
// network call, built at upload time), and are served to other users only while the status is 'approved'.
// The owner sees a pending or rejected picture through a short-lived signed link to the private object
// (ProfileImageViewService), never through the public address.
//
// Both prefixes are NEW on purpose and neither starts with "post-media" or "private-media": the post-media stray
// sweep (RejectedMediaSweepService) lists those prefixes and deletes any object with no PostMedia row, which would
// destroy profile pictures. LAUNCH-GATE CONSEQUENCE (B-265): the public address must serve post-media/ AND
// profile-media/ (and nothing else), or the private files must live in a separate bucket.
export const PRIVATE_PROFILE_PREFIX = 'private-profile';
export const PUBLIC_PROFILE_PREFIX = 'profile-media';

/** The private key a new upload is stored under. */
export function privateProfileKey(userId: string, uuid: string, ext: string): string {
  return `${PRIVATE_PROFILE_PREFIX}/${userId}/${uuid}.${ext}`;
}

/**
 * The public key a picture is copied to when approved: the same user and file name under the public prefix. A key
 * written before this design (avatars/<user>/<file>, covers/<user>/<file>) maps the same way, so a legacy pending
 * picture is published by the same code path.
 */
export function publicProfileKeyFor(currentKey: string): string {
  const parts = currentKey.split('/');
  const file = parts[parts.length - 1];
  const user = parts[parts.length - 2];
  return `${PUBLIC_PROFILE_PREFIX}/${user}/${file}`;
}

/** True when the key is already in the public prefix (the picture is published). */
export function isPublicProfileKey(key: string): boolean {
  return key.startsWith(`${PUBLIC_PROFILE_PREFIX}/`);
}

export const PROFILE_IMAGE_UNSUPPORTED_MESSAGE = 'Please choose a JPEG, PNG or WebP picture.';

export interface UploadedProfileImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

// Throws 400 for a missing or empty file, a type that is not allowed, or bytes
// that do not really start like the declared format (a renamed or mislabelled
// file; same message either way). Returns the matched type.
export function validateProfileImage(
  file: UploadedProfileImage | undefined,
): (typeof PROFILE_IMAGE_TYPES)[ProfileImageMime] {
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new BadRequestException('No file was attached to this upload.');
  }
  const type = PROFILE_IMAGE_TYPES[file.mimetype as ProfileImageMime];
  if (!type || !type.magic(file.buffer)) {
    throw new BadRequestException(PROFILE_IMAGE_UNSUPPORTED_MESSAGE);
  }
  return type;
}

// What a person sees when no object store is available (QA second run D-20). The
// storage layer's own 503 names the S3_* variables, which is configuration detail
// for the server logs and for POST /admin/media/upload, not for an end user.
export const PROFILE_IMAGE_UNAVAILABLE_MESSAGE = "Picture uploads aren't available right now. Please try again later.";

// Re-encodes a validated profile picture through the SAME MediaProcessor.sanitizeImage the post-image
// pipeline uses (B-205; Decision Log #468 item 3: no second implementation). Orientation is applied to the
// pixels first, then ALL metadata (EXIF, GPS, XMP, IPTC) is dropped, so the stored bytes carry none of it.
// What is reused from the post-image pipeline, with nothing new invented:
//   - the output format: the same type as the input (JPEG -> JPEG at quality 90 with mozjpeg, PNG -> PNG,
//     WebP -> WebP at quality 90);
//   - the decode limit: 100 megapixels (a decompression-bomb guard). There is no resize or dimension cap,
//     as for post images, and the 5 MB upload limit above is unchanged (it applies to the original upload).
// The sanitizer reads from a file path, so the bytes go through a temp file that is always removed.
// Bytes that decode as nothing (a corrupt file whose first bytes pass the magic-byte check) are a 400 with
// the same unsupported-file message, before anything is stored.
export async function sanitizeProfileImage(
  processor: MediaProcessor,
  buffer: Buffer,
  contentType: string,
): Promise<Buffer> {
  const file = path.join(tmpdir(), `profile-image-${randomUUID()}`);
  try {
    await writeFile(file, buffer);
    const clean = await processor.sanitizeImage(file, contentType as PostMediaContentType);
    return clean.buffer;
  } catch (err) {
    if (err instanceof UnprocessableMediaError) throw new BadRequestException(PROFILE_IMAGE_UNSUPPORTED_MESSAGE);
    throw err;
  } finally {
    await rm(file, { force: true });
  }
}

// Uploads a profile picture: first re-encodes it without metadata (sanitizeProfileImage), then stores ONLY
// the re-encoded bytes (the original is never stored), turning the storage layer's 503 into the friendly
// message above. The original message (with the S3_* detail) goes to the server log only. Any other
// failure is rethrown unchanged. Both the avatar and the cover go through here, so they cannot drift.
export async function uploadProfileImage(
  storage: StorageService,
  processor: MediaProcessor,
  logger: Logger,
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
  const clean = await sanitizeProfileImage(processor, buffer, contentType);
  try {
    return await storage.upload(clean, key, contentType);
  } catch (err) {
    if (err instanceof ServiceUnavailableException) {
      logger.warn(`Profile image upload refused (storage unavailable): ${err.message}`);
      throw new ServiceUnavailableException(PROFILE_IMAGE_UNAVAILABLE_MESSAGE);
    }
    throw err;
  }
}
