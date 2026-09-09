import { BadRequestException } from '@nestjs/common';

// Keyset-pagination cursors for the Banter Rooms list endpoints (Build
// Plan Section 5.5). Two shapes, because the two list surfaces order by
// different columns — exactly the same "two cursor shapes, one per
// ordering" split grassroots/cursor.util.ts already makes:
//
//  - GET /banter-rooms + GET /banter-rooms/search -> alphabetical by
//    `name` (BanterRoom has no timestamp column, like ClubPage — see
//    clubs/cursor.util.ts's reasoning), `id` tiebreak.
//  - GET /banter-rooms/mine ("My Bants") -> most-recently-joined first
//    (BanterRoomMember.joinedAt desc), `banterRoomId` tiebreak — the
//    natural "my rooms" read, mirroring GET /users/:id/saved-posts's own
//    savedAt-desc ordering.
//
// Same opaque-base64-of-a-small-JSON-envelope contract as
// feed/clubs/grassroots cursor utils: a client treats these as internal
// detail, never constructs or parses one itself.

// ---------- Room catalog cursor: { name, id } ----------

export interface BanterRoomCursor {
  name: string;
  id: string;
}

export function encodeBanterRoomCursor(cursor: BanterRoomCursor): string {
  return Buffer.from(JSON.stringify({ name: cursor.name, id: cursor.id }), 'utf8').toString('base64url');
}

export function decodeBanterRoomCursor(raw: string): BanterRoomCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { name?: unknown }).name !== 'string' ||
    typeof (parsed as { id?: unknown }).id !== 'string'
  ) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  const { name, id } = parsed as { name: string; id: string };
  return { name, id };
}

// ---------- "My Bants" cursor: { joinedAt, id } ----------
// `id` here is the BanterRoomMember's banterRoomId — @@unique([userId,
// banterRoomId]) guarantees it's unique within one caller's rows, so it
// serves as the keyset tiebreaker without selecting the member row's own
// id (the same trick SavedPost pagination uses with postId).

export interface MyBantsCursor {
  joinedAt: Date;
  id: string;
}

export function encodeMyBantsCursor(cursor: MyBantsCursor): string {
  return Buffer.from(
    JSON.stringify({ joinedAt: cursor.joinedAt.toISOString(), id: cursor.id }),
    'utf8',
  ).toString('base64url');
}

export function decodeMyBantsCursor(raw: string): MyBantsCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { joinedAt?: unknown }).joinedAt !== 'string' ||
    typeof (parsed as { id?: unknown }).id !== 'string'
  ) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  const { joinedAt, id } = parsed as { joinedAt: string; id: string };
  const date = new Date(joinedAt);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  return { joinedAt: date, id };
}
