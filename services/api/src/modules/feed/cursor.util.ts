import { BadRequestException } from '@nestjs/common';

// Keyset-pagination cursor for GET /posts/feed — see feed-query.dto.ts
// for why keyset (not offset) pagination was chosen. The cursor encodes
// the exact (createdAt, id) position of the last row a client already
// received, so the next page's query can resume with a strict
// "everything after this point in the same order" WHERE clause instead
// of an offset that drifts as new posts are inserted concurrently.
//
// Deliberately opaque (base64 of a small JSON envelope) rather than a
// raw "createdAt,id" string a client is expected to construct — this
// keeps the encoding an internal implementation detail that can change
// without being a breaking API contract change, and avoids a client
// hand-crafting a cursor that doesn't correspond to a real row.
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
