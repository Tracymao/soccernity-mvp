import { BadRequestException } from '@nestjs/common';

// Keyset-pagination cursor for GET /sports/live-scores and GET /sports/fixtures?date= — this
// module's own copy of the (field, id) shape established across this codebase (blog/cursor.util.ts,
// clubs/cursor.util.ts, etc.), per the established per-module-cursor-util convention.
//
// Ordered `kickoffTime asc, id asc` — deliberately ascending, not the "newest first" convention
// most social-content list endpoints in this codebase use (feed, notifications, blog). A day's
// fixtures read naturally chronologically forward (earliest kickoff first), matching how a
// fixture list / live-scores board is actually displayed.
//
// Single-document endpoints (GET /sports/matches/:id and everything under it — stats, lineups,
// events, momentum, h2h, highlights — plus GET /sports/standings) are NOT paginated at all: each
// returns one whole cached document for one match/league, never a list of many rows the way
// live-scores/fixtures can be (a day can have hundreds of matches across leagues; a single match has
// one set of stats).

export interface MatchCursor {
  kickoffTime: Date;
  id: string;
}

export function encodeMatchCursor(cursor: MatchCursor): string {
  const payload = JSON.stringify({ kickoffTime: cursor.kickoffTime.toISOString(), id: cursor.id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeMatchCursor(raw: string): MatchCursor {
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
    typeof (parsed as { kickoffTime?: unknown }).kickoffTime !== 'string' ||
    typeof (parsed as { id?: unknown }).id !== 'string'
  ) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  const { kickoffTime, id } = parsed as { kickoffTime: string; id: string };
  const date = new Date(kickoffTime);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  return { kickoffTime: date, id };
}
