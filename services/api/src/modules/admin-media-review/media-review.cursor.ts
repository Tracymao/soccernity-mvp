import { BadRequestException } from '@nestjs/common';

// Cursor for the moderator queue. It carries a POSITION in each of the two streams the queue merges, and nothing
// about any item, its uploader or its age beyond that:
//   sequence  the monotonic PostMedia.sequence of the last POST-MEDIA item returned (insertion order);
//   profile   the position of the last PROFILE-PICTURE item returned: its upload time in milliseconds (0 when the
//             age is unknown) and its "<kind>:<userId>" tie-break.
// A stream not yet reached has no entry. The direction comes from the request's `order`.
//
// Backward compatible: a cursor of only { sequence } (the only shape before B-037) still decodes and means "no
// profile items returned yet", and a page with no profile items encodes to exactly that shape.
export interface ProfilePosition {
  /** Upload time, ms since the epoch; 0 for a picture whose age is unknown. */
  at: number;
  /** "<kind>:<userId>". */
  id: string;
}

export interface MediaReviewPosition {
  sequence?: number;
  profile?: ProfilePosition;
}

export function encodeMediaReviewPosition(position: MediaReviewPosition): string {
  const body: MediaReviewPosition = {};
  if (position.sequence !== undefined) body.sequence = position.sequence;
  if (position.profile !== undefined) body.profile = { at: position.profile.at, id: position.profile.id };
  return Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
}

export function encodeMediaReviewCursor(sequence: number): string {
  return encodeMediaReviewPosition({ sequence });
}

const PROFILE_POSITION_ID = /^(avatar|cover):[A-Za-z0-9-]{1,64}$/;

export function decodeMediaReviewPosition(raw: string): MediaReviewPosition {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      sequence?: unknown;
      profile?: { at?: unknown; id?: unknown };
    };
    const position: MediaReviewPosition = {};
    if (parsed.sequence !== undefined) {
      if (typeof parsed.sequence !== 'number' || !Number.isInteger(parsed.sequence) || parsed.sequence <= 0) throw new Error('sequence');
      position.sequence = parsed.sequence;
    }
    if (parsed.profile !== undefined) {
      const { at, id } = parsed.profile ?? {};
      if (typeof at !== 'number' || !Number.isInteger(at) || at < 0) throw new Error('at');
      if (typeof id !== 'string' || !PROFILE_POSITION_ID.test(id)) throw new Error('id');
      position.profile = { at, id };
    }
    if (position.sequence !== undefined || position.profile !== undefined) return position;
  } catch {
    // fall through
  }
  throw new BadRequestException('Invalid pagination cursor');
}

/** The post-media position of a cursor (kept for callers that only ever see post media). */
export function decodeMediaReviewCursor(raw: string): number {
  const position = decodeMediaReviewPosition(raw);
  if (position.sequence === undefined) throw new BadRequestException('Invalid pagination cursor');
  return position.sequence;
}
