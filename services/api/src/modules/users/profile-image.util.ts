import { BadRequestException } from '@nestjs/common';

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
