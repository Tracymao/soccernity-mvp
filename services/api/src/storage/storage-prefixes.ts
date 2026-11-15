// B-265 (two-bucket media storage). Which key prefixes live in the PUBLIC bucket (the one S3_PUBLIC_BASE_URL
// serves). This is an explicit ALLOW-LIST: every key that does not start with one of these prefixes is PRIVATE
// by default (private-media/, private-profile/, quarantine/, data-export/, the legacy avatars/ and covers/, and
// any prefix added later), so a new prefix can never become publicly readable by accident.
//
// A leaf file (no imports) on purpose: the modules that build keys import their prefix constants FROM here, so
// there is one source of truth and no import cycle with the storage service.

/** Approved post and contest-entry media (post-media-objects.service.ts). */
export const PUBLIC_POST_MEDIA_PREFIX = 'post-media';
/** Approved profile pictures and covers (profile-image.util.ts). */
export const PUBLIC_PROFILE_MEDIA_PREFIX = 'profile-media';
/** The admin media library (media.service.ts). */
export const PUBLIC_ADMIN_MEDIA_PREFIX = 'media';

export const PUBLIC_KEY_PREFIXES: readonly string[] = [
  PUBLIC_POST_MEDIA_PREFIX,
  PUBLIC_PROFILE_MEDIA_PREFIX,
  PUBLIC_ADMIN_MEDIA_PREFIX,
];

/** True when the object key belongs in the public bucket. Everything else is private. */
export function isPublicKey(key: string): boolean {
  return PUBLIC_KEY_PREFIXES.some((p) => key.startsWith(`${p}/`));
}

/**
 * True when a LIST prefix points into the public bucket ("post-media/" or "post-media/<user>/"). An empty prefix
 * or any other prefix is private.
 */
export function isPublicPrefix(prefix: string): boolean {
  return PUBLIC_KEY_PREFIXES.some((p) => prefix === p || prefix.startsWith(`${p}/`));
}
