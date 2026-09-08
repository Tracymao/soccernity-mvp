import { BadRequestException } from '@nestjs/common';

// Keyset-pagination cursors for the Grassroots Records Service list
// endpoints (Build Plan Section 5.5). Two shapes, because the two list
// endpoints order by different columns:
//
//  - GET /teams?city=    -> alphabetical by name (GrassrootsTeam has no
//                           timestamp column, exactly like ClubPage — see
//                           clubs/cursor.util.ts's reasoning), id tiebreak.
//  - GET /teams/:id/fixtures -> newest scheduled first (scheduledAt desc),
//                           id tiebreak — like the feed's (createdAt, id).
//
// Same opaque-base64-of-a-small-JSON-envelope contract as
// feed/cursor.util.ts and clubs/cursor.util.ts: a client treats these as
// internal detail, never constructs or parses one itself.

// ---------- Team cursor: { name, id } ----------

export interface TeamCursor {
  name: string;
  id: string;
}

export function encodeTeamCursor(cursor: TeamCursor): string {
  return Buffer.from(JSON.stringify({ name: cursor.name, id: cursor.id }), 'utf8').toString('base64url');
}

export function decodeTeamCursor(raw: string): TeamCursor {
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

// ---------- Fixture cursor: { scheduledAt, id } ----------

export interface FixtureCursor {
  scheduledAt: Date;
  id: string;
}

export function encodeFixtureCursor(cursor: FixtureCursor): string {
  return Buffer.from(
    JSON.stringify({ scheduledAt: cursor.scheduledAt.toISOString(), id: cursor.id }),
    'utf8',
  ).toString('base64url');
}

export function decodeFixtureCursor(raw: string): FixtureCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { scheduledAt?: unknown }).scheduledAt !== 'string' ||
    typeof (parsed as { id?: unknown }).id !== 'string'
  ) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  const { scheduledAt, id } = parsed as { scheduledAt: string; id: string };
  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  return { scheduledAt: date, id };
}
