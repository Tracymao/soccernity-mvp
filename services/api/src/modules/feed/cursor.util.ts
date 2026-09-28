import { BadRequestException } from '@nestjs/common';

// Keyset-pagination cursor, originally built for GET /posts/feed — see
// feed-query.dto.ts for why keyset (not offset) pagination was chosen.
// The cursor encodes the exact (createdAt, id) position of the last row
// a client already received, so the next page's query can resume with a
// strict "everything after this point in the same order" WHERE clause
// instead of an offset that drifts as new posts are inserted
// concurrently.
//
// Deliberately opaque (base64 of a small JSON envelope) rather than a
// raw "createdAt,id" string a client is expected to construct — this
// keeps the encoding an internal implementation detail that can change
// without being a breaking API contract change, and avoids a client
// hand-crafting a cursor that doesn't correspond to a real row.
//
// STILL USED by users.service.ts's getFollowers/getFollowing (Follow.id
// as the tiebreaker, imported directly from here rather than copied —
// an exception to this codebase's usual per-module-cursor-util
// convention). feed.service.ts's own three pagination call sites
// (getFeed/getClubFeed/getBanterRoomFeed, getComments, getSavedPosts) no
// longer use THIS cursor shape — see FeedSequenceCursor below and each
// call site's own comment in feed.service.ts for why: `id` there was a
// random UUID (Post.id/Comment.id) or a foreign key to one (SavedPost's
// old `postId` tiebreaker) with no relation to insertion order, so rows
// sharing the same millisecond-precision timestamp tiebroke in an order
// unrelated to which one was actually created/saved first.
export interface FeedCursor {
  createdAt: Date;
  id: string;
}

export function encodeFeedCursor(cursor: FeedCursor): string {
  const payload = JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeFeedCursor(raw: string): FeedCursor {
  let parsed: unknown;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    parsed = JSON.parse(json);
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { createdAt?: unknown }).createdAt !== 'string' ||
    typeof (parsed as { id?: unknown }).id !== 'string'
  ) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  const { createdAt, id } = parsed as { createdAt: string; id: string };
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  return { createdAt: date, id };
}

// Sequence-tiebreaker counterpart of FeedCursor above, used by
// feed.service.ts's own three pagination call sites
// (paginatePostsWithViewerState for GET /posts/feed + GET /clubs/:id/feed
// + GET /banter-rooms/:id/posts, getComments, getSavedPosts). `sequence`
// is a genuinely monotonically-increasing Postgres-assigned counter (see
// the comment on Post.sequence / Comment.sequence / SavedPost.sequence
// in schema.prisma) — not the row's own `id`, which is a random UUID (or,
// for SavedPost's old tiebreaker, a foreign key to one) with no relation
// to insertion order. A dedicated shape rather than repurposing
// FeedCursor above: users.service.ts imports FeedCursor/encodeFeedCursor/
// decodeFeedCursor directly (Follow.id as its own, unrelated tiebreaker,
// out of this fix's scope) and must keep working unchanged.
//
// Same opaque-base64-of-a-small-JSON-envelope contract as FeedCursor.
export interface FeedSequenceCursor {
  createdAt: Date;
  sequence: number;
}

export function encodeFeedSequenceCursor(cursor: FeedSequenceCursor): string {
  const payload = JSON.stringify({ createdAt: cursor.createdAt.toISOString(), sequence: cursor.sequence });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeFeedSequenceCursor(raw: string): FeedSequenceCursor {
  let parsed: unknown;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    parsed = JSON.parse(json);
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { createdAt?: unknown }).createdAt !== 'string' ||
    typeof (parsed as { sequence?: unknown }).sequence !== 'number'
  ) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  const { createdAt, sequence } = parsed as { createdAt: string; sequence: number };
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime()) || !Number.isInteger(sequence)) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  return { createdAt: date, sequence };
}
