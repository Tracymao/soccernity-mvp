import { BadRequestException } from '@nestjs/common';

// Keyset-pagination cursors for Community Groups (Build Plan Sprint 3,
// Section 5.5). Two shapes, because the two list surfaces order by
// different columns — the same "two cursor shapes, one per ordering"
// split banter/cursor.util.ts and grassroots/cursor.util.ts already make:
//
//  - GET /community-groups -> newest-first (CommunityGroup.createdAt
//    desc), `id` tiebreak. Judgment call, flagged in
//    community-groups/README.md: unlike ClubPage/BanterRoom (which have
//    NO timestamp column and so are ordered alphabetically by name — see
//    clubs/cursor.util.ts's own reasoning), CommunityGroup DOES have a
//    real createdAt column, so this follows the majority convention this
//    codebase's OTHER list endpoints use (feed, notifications, messages,
//    "My Bants") rather than the alphabetical fallback that was only ever
//    forced on ClubPage/BanterRoom by their own lack of a timestamp.
//  - GET /community-groups/:id/members -> alphabetical by the member's
//    displayName, `id` tiebreak — mirrors
//    ClubsService.getClubMembers/clubs/cursor.util.ts's { name, id }
//    envelope exactly, per this task's own "mirror GET /clubs/:id/members
//    exactly" instruction.
//
// Same opaque-base64-of-a-small-JSON-envelope contract as every other
// cursor util in this codebase: a client treats these as internal detail,
// never constructs or parses one itself.

// ---------- Group catalog cursor: { createdAt, id } ----------

export interface CommunityGroupCursor {
  createdAt: Date;
  id: string;
}

export function encodeCommunityGroupCursor(cursor: CommunityGroupCursor): string {
  return Buffer.from(
    JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }),
    'utf8',
  ).toString('base64url');
}

export function decodeCommunityGroupCursor(raw: string): CommunityGroupCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
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

// ---------- Member roster cursor: { name, id } ----------
// `name` here is the member User's displayName — same envelope shape as
// clubs/cursor.util.ts's own { name, id }, re-declared locally rather
// than imported across the module boundary (the same small deliberate
// duplicate ListClubMembersQueryDto's own comment already argues for).

export interface CommunityGroupMemberCursor {
  name: string;
  id: string;
}

export function encodeCommunityGroupMemberCursor(cursor: CommunityGroupMemberCursor): string {
  return Buffer.from(JSON.stringify({ name: cursor.name, id: cursor.id }), 'utf8').toString(
    'base64url',
  );
}

export function decodeCommunityGroupMemberCursor(raw: string): CommunityGroupMemberCursor {
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
