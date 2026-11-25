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

// League-ranked paging (league-priority.constants.ts): the order is computed in memory, so the cursor
// is the id of the last item returned plus its offset in the sorted list. The id wins; the offset is
// only a fallback if that row has since vanished. A pre-ranking cursor (kickoffTime + id) still
// decodes: its id is found in the sorted list, so an old client keeps paging.
export interface RankedCursor {
  id: string;
  offset: number | null;
}

export function encodeRankedCursor(cursor: RankedCursor): string {
  return Buffer.from(JSON.stringify({ id: cursor.id, offset: cursor.offset }), 'utf8').toString('base64url');
}

export function decodeRankedCursor(raw: string): RankedCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }
  if (typeof parsed !== 'object' || parsed === null || typeof (parsed as { id?: unknown }).id !== 'string') {
    throw new BadRequestException('Invalid pagination cursor');
  }
  const { id, offset } = parsed as { id: string; offset?: unknown };
  const safeOffset = typeof offset === 'number' && Number.isInteger(offset) && offset >= 0 ? offset : null;
  return { id, offset: safeOffset };
}
