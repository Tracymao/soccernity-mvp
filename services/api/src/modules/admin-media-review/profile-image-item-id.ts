// backend/b037-profile-image-review (B-037). The id of a PROFILE PICTURE item in the moderator media review queue.
//
//     avatar:<userId>:<file>      cover:<userId>:<file>
//
// <file> is the file NAME of the stored picture (a random uuid plus its extension, e.g. 4f1c....jpg), so the id
// names the exact FILE the moderator was shown, not just the person. That is what makes a decision safe against a
// re-upload: if the person uploads a new picture before the moderator clicks, the stored file name changes, the id
// no longer matches, and the old decision finds nothing (404) instead of being applied to the new picture. A post
// media id is a bare UUID, which never contains ':', so the two forms cannot be confused.
//
// Nothing here is a secret or personal data beyond the user id the queue already shows.

export type ProfileItemKind = 'avatar' | 'cover';

export interface ProfileItemRef {
  kind: ProfileItemKind;
  userId: string;
  file: string;
}

const ID_PATTERN = /^(avatar|cover):([A-Za-z0-9-]{1,64}):([A-Za-z0-9._-]{1,120})$/;

/** The file name of a stored key ("private-profile/<user>/<file>" or a legacy "avatars/<user>/<file>"). */
export function fileNameOf(key: string): string {
  const parts = key.split('/');
  return parts[parts.length - 1];
}

export function formatProfileItemId(kind: ProfileItemKind, userId: string, key: string): string {
  return `${kind}:${userId}:${fileNameOf(key)}`;
}

/** True for an id that names a profile picture (the cheap routing test used before any lookup). */
export function isProfileItemId(id: string): boolean {
  return id.startsWith('avatar:') || id.startsWith('cover:');
}

/** Parses a profile item id; null when it is not a well-formed one (the caller answers 404). */
export function parseProfileItemId(id: string): ProfileItemRef | null {
  const m = ID_PATTERN.exec(id);
  if (!m) return null;
  return { kind: m[1] as ProfileItemKind, userId: m[2], file: m[3] };
}
