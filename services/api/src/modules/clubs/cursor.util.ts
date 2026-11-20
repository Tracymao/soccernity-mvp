import { BadRequestException } from '@nestjs/common';

// Keyset-pagination cursor for GET /clubs — adapted from
// feed/cursor.util.ts's (createdAt, id) shape, not a third pagination
// scheme (see clubs/README.md's "why alphabetical, not a timestamp"
// section). ClubPage has no timestamp field at all (no createdAt on the
// model — see schema.prisma), so this browsable catalog is ordered
// alphabetically by `name` instead, with `id` as the keyset tiebreaker
// for two clubs sharing an identical name (real, if rare — nothing in
// Section 3 makes ClubPage.name unique).
//
// Same opaque-base64-of-a-small-JSON-envelope contract as
// feed/cursor.util.ts: a client should treat this as an internal detail,
// never construct or parse one itself.
export interface ClubCursor {
  name: string;
  id: string;
}

export function encodeClubCursor(cursor: ClubCursor): string {
  const payload = JSON.stringify({ name: cursor.name, id: cursor.id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeClubCursor(raw: string): ClubCursor {
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
    typeof (parsed as { name?: unknown }).name !== 'string' ||
    typeof (parsed as { id?: unknown }).id !== 'string'
  ) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  const { name, id } = parsed as { name: string; id: string };
  return { name, id };
}
