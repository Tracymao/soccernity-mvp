import { BadRequestException } from '@nestjs/common';

// Keyset-pagination cursor for GET /leaderboard (Build Plan Section 5.5)
// — same opaque-base64-of-a-small-JSON-envelope contract as every other
// cursor util in this codebase: a client treats this as internal detail,
// never constructs or parses one itself.
//
// Ordered by (rank ASC, userId ASC). `rank` alone is not a unique
// tiebreak — RANK() OVER (ORDER BY points DESC) deliberately gives TWO
// users the same rank on a tie (Decision Log #61(c): ties are allowed),
// so `userId` is the keyset tiebreaker, mirroring every other
// two-column cursor in this codebase (feed's (createdAt, id), clubs'/
// grassroots'/banter's (name, id)).
export interface LeaderboardCursor {
  rank: number;
  userId: string;
}

export function encodeLeaderboardCursor(cursor: LeaderboardCursor): string {
  return Buffer.from(JSON.stringify({ rank: cursor.rank, userId: cursor.userId }), 'utf8').toString(
    'base64url',
  );
}

export function decodeLeaderboardCursor(raw: string): LeaderboardCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { rank?: unknown }).rank !== 'number' ||
    typeof (parsed as { userId?: unknown }).userId !== 'string'
  ) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  const { rank, userId } = parsed as { rank: number; userId: string };
  return { rank, userId };
}
