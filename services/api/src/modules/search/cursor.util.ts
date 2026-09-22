import { BadRequestException } from '@nestjs/common';

// Keyset-pagination cursors for GET /search — this module's own copy of
// the (field, id) shape established across this codebase (feed/cursor.util.ts,
// clubs/cursor.util.ts, blog/cursor.util.ts, etc.), per the established
// per-module-cursor-util convention (see clubs/cursor.util.ts's own
// header comment on why it's an adapted copy rather than a shared
// import).
//
// Three separate cursor types, one file — same shape blog/cursor.util.ts
// already uses for ArticleCursor/CategoryCursor. Each entity type is
// ordered differently, deliberately:
//
//  - Users, alphabetically by displayName (displayName asc, id asc) —
//    same "browsable catalog, no good recency field to order by"
//    reasoning as ClubPage (see clubs/cursor.util.ts) and BanterRoom
//    (see banter/cursor.util.ts). User.createdAt exists on the schema
//    but is not exposed by any other list endpoint in this codebase
//    (feed.service.ts's own POST_AUTHOR_SELECT deliberately narrows to
//    id + displayName only) — reusing it here for ordering only, with
//    no plan to ever expose it, would be a needless asymmetry against
//    every other place a User shows up in a list response.
//  - Clubs, alphabetically by name (name asc, id asc) — matches
//    GET /clubs's own ordering exactly (clubs/cursor.util.ts), so the
//    same club sorts identically whether a client found it via
//    GET /clubs or GET /search?scope=clubs.
//  - Posts, newest-first (createdAt desc, id desc) — matches
//    GET /posts/feed / GET /clubs/:id/feed / GET /banter-rooms/:id/posts's
//    own direction (feed/cursor.util.ts): a post is activity-feed
//    content, not a browsable catalog entity, per
//    grassroots/dto/list-fixtures-query.dto.ts's own reasoning for the
//    identical browsable-vs-activity-feed distinction.
//
// Deliberately opaque (base64url of a small JSON envelope) — same
// contract as every other cursor util in this codebase: a client should
// treat this as an internal detail, never construct or parse one
// itself. A cursor from one scope is never valid for another (each
// decode function only accepts its own field name) — a client that
// mixes them up gets a clean 400, not a silently wrong query.

export interface SearchUserCursor {
  displayName: string;
  id: string;
}

export function encodeSearchUserCursor(cursor: SearchUserCursor): string {
  const payload = JSON.stringify({ displayName: cursor.displayName, id: cursor.id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeSearchUserCursor(raw: string): SearchUserCursor {
  const parsed = parseCursorPayload(raw);
  if (
    typeof (parsed as { displayName?: unknown }).displayName !== 'string' ||
    typeof (parsed as { id?: unknown }).id !== 'string'
  ) {
    throw new BadRequestException('Invalid pagination cursor');
  }
  const { displayName, id } = parsed as { displayName: string; id: string };
  return { displayName, id };
}

export interface SearchClubCursor {
  name: string;
  id: string;
}

export function encodeSearchClubCursor(cursor: SearchClubCursor): string {
  const payload = JSON.stringify({ name: cursor.name, id: cursor.id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeSearchClubCursor(raw: string): SearchClubCursor {
  const parsed = parseCursorPayload(raw);
  if (
    typeof (parsed as { name?: unknown }).name !== 'string' ||
    typeof (parsed as { id?: unknown }).id !== 'string'
  ) {
    throw new BadRequestException('Invalid pagination cursor');
  }
  const { name, id } = parsed as { name: string; id: string };
  return { name, id };
}

export interface SearchPostCursor {
  createdAt: Date;
  id: string;
}

export function encodeSearchPostCursor(cursor: SearchPostCursor): string {
  const payload = JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeSearchPostCursor(raw: string): SearchPostCursor {
  const parsed = parseCursorPayload(raw);
  if (
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

// Shared base64url-decode + JSON.parse + non-null-object check every
// decode* function above starts with — the only part that's genuinely
// identical across all three cursor shapes (the per-field shape check
// that follows differs per type, so it stays in each function, matching
// blog/cursor.util.ts's own choice not to over-abstract three-field-shape
// validation into one generic helper). The non-null-object check here
// matters: without it, a cursor decoding to a JSON primitive (e.g. "5" or
// "null") would throw an unhandled TypeError on property access below,
// not the clean 400 every other invalid-cursor shape gets.
function parseCursorPayload(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    parsed = JSON.parse(json);
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new BadRequestException('Invalid pagination cursor');
  }
  return parsed as Record<string, unknown>;
}
