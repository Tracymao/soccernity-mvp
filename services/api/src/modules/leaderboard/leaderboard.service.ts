import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { decodeLeaderboardCursor, encodeLeaderboardCursor } from './cursor.util';
import { getCurrentIsoWeekPeriod, parseIsoWeekPeriod } from './iso-week.util';
import {
  GLOBAL_BOARD_CLUB_ID,
  LEADERBOARD_DEFAULT_PAGE_SIZE,
  LEADERBOARD_MAX_PAGE_SIZE,
} from './leaderboard.constants';
import { LeaderboardEntryView, LeaderboardPage } from './leaderboard.types';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import { PUBLIC_NAME_SELECT, resolvePublicName } from '../users/public-name.util';

// GET /leaderboard's READ side only — Build Plan Section 4.9. Reads
// EXCLUSIVELY from the materialized LeaderboardEntry table (joined to
// User for displayName and the active-account filter); it never
// aggregates PointsLedgerEntry on read, and never backfills a period the
// rollup hasn't touched yet — a period with no LeaderboardEntry rows
// simply returns an empty page, not an error. See
// LeaderboardRollupService (leaderboard-rollup.service.ts) for the write
// side that populates this table, and leaderboard/README.md for the
// full design.
@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  // JwtAuthGuard-only at the controller (Decision Log #129: no
  // logged-out Leaderboard view) — this method itself is not scoped to
  // any particular caller (no @CurrentUser() needed), matching
  // GET /clubs / GET /banter-rooms's own "reading the directory isn't
  // caller-specific" shape, NOT GET /posts/feed's caller-scoped shape.
  async getLeaderboard(callerId: string, query: LeaderboardQueryDto): Promise<LeaderboardPage> {
    const period = query.period ?? getCurrentIsoWeekPeriod();
    // Throws BadRequestException for a malformed/out-of-range period —
    // see iso-week.util.ts. Return value discarded; this call is purely
    // for validation before it's used as a literal WHERE-clause value.
    parseIsoWeekPeriod(period);

    // Decision Log #128 -- the club board is only ever the caller's OWN
    // represented club. Checked here, server-side, against a fresh read,
    // so the API can't be used as a club-directory browser the UI doesn't
    // offer. A club the caller doesn't represent, or any clubId when they
    // represent none, is a 403.
    const boardClubId = query.clubId ?? GLOBAL_BOARD_CLUB_ID;
    if (query.clubId !== undefined) {
      const caller = await this.prisma.user.findUnique({
        where: { id: callerId },
        select: { representedClubId: true },
      });
      if (caller?.representedClubId !== query.clubId) {
        throw new ForbiddenException('You can only view the leaderboard for the club you represent.');
      }
    }

    const limit = Math.min(query.limit ?? LEADERBOARD_DEFAULT_PAGE_SIZE, LEADERBOARD_MAX_PAGE_SIZE);
    const cursor = query.cursor ? decodeLeaderboardCursor(query.cursor) : null;

    const rows = await this.prisma.leaderboardEntry.findMany({
      where: {
        period,
        clubId: boardClubId,
        // Defensive, second-stage active-account exclusion (Decision Log
        // #221) — mirrors feed.service.ts's ACTIVE_AUTHOR_POST_FILTER /
        // users.service.ts's ACTIVE_FOLLOW_ENTRY_FILTER exactly. The
        // rollup (LeaderboardRollupService) already excludes non-active
        // users from what it WRITES, so in the common case this filter
        // matches everything the rollup wrote for this period anyway —
        // but a user who deactivates in the gap between two 15-minute
        // rollup ticks would otherwise stay visible here with a stale
        // row until the next tick. This filter hides them immediately,
        // at read time, with no dependency on rollup cadence.
        user: { accountStatus: 'active' },
        ...(cursor
          ? {
              OR: [
                { rank: { gt: cursor.rank } },
                { rank: cursor.rank, userId: { gt: cursor.userId } },
              ],
            }
          : {}),
      },
      include: { user: { select: PUBLIC_NAME_SELECT } },
      // rank ASC — ties (RANK() gives equal ranks on a points tie,
      // Decision Log #61(c)) are broken by userId ASC for a
      // deterministic keyset order. Postgres's own default null
      // ordering already puts NULLs last on an ascending sort (the
      // opposite of MySQL's default), which is exactly the "nulls last"
      // requirement — no explicit NULLS LAST needed. In practice no row
      // this query can return has a null rank at all (see
      // LeaderboardEntryView's own comment).
      orderBy: [{ rank: 'asc' }, { userId: 'asc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    const items: LeaderboardEntryView[] = page.map((row) => ({
      userId: row.userId,
      publicName: resolvePublicName(row.user),
      points: row.points,
      rank: row.rank ?? 0,
    }));

    return {
      items,
      nextCursor: hasMore && last ? encodeLeaderboardCursor({ rank: last.rank ?? 0, userId: last.userId }) : null,
    };
  }
}
