import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { decodeClubCursor, encodeClubCursor } from './cursor.util';
import { CLUBS_DEFAULT_PAGE_SIZE, CLUBS_MAX_PAGE_SIZE, ListClubsQueryDto } from './dto/list-clubs-query.dto';

// Response shape for every GET /clubs and GET /clubs/:id entry (Build
// Plan Section 4.4). Deliberately does NOT select `members` or
// `affiliatedPlayers` — same low-bandwidth discipline Section 5.5
// already applied to feed/comment lists (see feed.service.ts's
// POST_SELECT comment): a club with thousands of members returned
// inline on every page would be exactly the unbounded payload that
// discipline exists to prevent. Section 4.4 has no `GET
// /clubs/:id/members` endpoint either, so there's no substitute route
// this omission is deferring to — member data simply isn't exposed by
// this module at all yet.
const CLUB_SELECT = {
  id: true,
  name: true,
  league: true,
  country: true,
  logoUrl: true,
  memberCount: true,
} as const;

export type ClubSummary = Prisma.ClubPageGetPayload<{ select: typeof CLUB_SELECT }>;

export interface ClubPageResult {
  items: ClubSummary[];
  nextCursor: string | null;
}

export interface JoinState {
  clubId: string;
  joined: true;
  memberCount: number;
}

@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}

  // GET /clubs. Ordered alphabetically by `name` (ClubPage has no
  // timestamp field to order most-recent-first by, unlike every other
  // list endpoint in this codebase — see cursor.util.ts), `id` as the
  // keyset tiebreaker for two clubs sharing an identical name. Keyset
  // (not offset) pagination, same Section 5.5 discipline as every other
  // list endpoint here — see dto/list-clubs-query.dto.ts.
  async listClubs(query: ListClubsQueryDto): Promise<ClubPageResult> {
    const limit = Math.min(query.limit ?? CLUBS_DEFAULT_PAGE_SIZE, CLUBS_MAX_PAGE_SIZE);

    const filters: Prisma.ClubPageWhereInput[] = [];
    if (query.league) filters.push({ league: query.league });
    if (query.country) filters.push({ country: query.country });
    if (query.cursor) filters.push(this.buildCursorFilter(query.cursor));

    const where: Prisma.ClubPageWhereInput = filters.length > 0 ? { AND: filters } : {};

    // take: limit + 1 — the standard "fetch one extra row" trick to know
    // whether a next page exists without a separate COUNT() query, same
    // as every other paginated query in this codebase.
    const rows = await this.prisma.clubPage.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      select: CLUB_SELECT,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? encodeClubCursor({ name: last.name, id: last.id }) : null;

    return { items, nextCursor };
  }

  private buildCursorFilter(rawCursor: string): Prisma.ClubPageWhereInput {
    const cursor = decodeClubCursor(rawCursor);
    // Ascending-order (alphabetical) counterpart of feed.service.ts's
    // buildCursorFilter: "greater than" instead of "less than", since
    // GET /clubs pages A-to-Z rather than newest-first.
    return {
      OR: [{ name: { gt: cursor.name } }, { name: cursor.name, id: { gt: cursor.id } }],
    };
  }

  // GET /clubs/:id. Same CLUB_SELECT as the list entries — no divergence
  // needed, nothing about viewing a single club calls for more or fewer
  // fields than viewing it in the catalog list. A non-existent :id is a
  // 404, never a silent null 200, matching FeedService.getPostById's
  // precedent.
  async getClubById(clubId: string): Promise<ClubSummary> {
    const club = await this.prisma.clubPage.findUnique({ where: { id: clubId }, select: CLUB_SELECT });
    if (!club) {
      throw new NotFoundException('Club not found');
    }
    return club;
  }

  // Shared existence check for getClubById and joinClub, mirroring
  // FeedService.assertPostExists / UsersService.assertUserExists's exact
  // shape/intent: "does :id reference a real ClubPage" is the first move,
  // and a well-formed but non-existent id must 404, never a raw FK
  // violation surfaced as 400/500.
  private async assertClubExists(clubId: string): Promise<void> {
    const club = await this.prisma.clubPage.findUnique({ where: { id: clubId }, select: { id: true } });
    if (!club) {
      throw new NotFoundException('Club not found');
    }
  }

  // POST /clubs/:id/join. See clubs/README.md's "verified Prisma
  // behavior" section for the full investigation this implementation
  // rests on. Short version: this repo's Prisma version does NOT throw
  // on a duplicate implicit-many-to-many `connect` (verified directly
  // against a live client, not assumed) — unlike Like/SavedPost/Follow's
  // own idempotency, which all rely on catching a real Postgres P2002
  // unique-constraint violation. That means the P2002-catch pattern
  // likePost/followUser use is NOT available here; a different atomicity
  // mechanism is needed to avoid double-incrementing `memberCount` on a
  // duplicate join.
  //
  // This method issues a raw parameterized INSERT ... ON CONFLICT DO
  // NOTHING directly against "_ClubMembership" (the implicit join table
  // Prisma generates for the ClubPage.members <-> User.clubMemberships
  // relation — see schema.prisma's @relation("ClubMembership") comment
  // and this PR's migration, 20260819204443_fix_club_membership_relation,
  // for the exact table/column names this relies on: "A" = ClubPage.id,
  // "B" = User.id, alphabetized by model name). $executeRaw returns the
  // number of affected rows, which for ON CONFLICT DO NOTHING is exactly
  // 1 on a genuine new insert and 0 on a duplicate — an atomic,
  // race-safe signal enforced by the join table's own unique index at
  // the database engine level, not by an application-level
  // findFirst-then-conditionally-update inside the transaction (which
  // was considered and rejected: under Postgres's default READ COMMITTED
  // isolation, two concurrent joinClub calls could both observe "not yet
  // a member" before either commits, double-incrementing memberCount
  // even though the join row itself would stay singular). memberCount is
  // only incremented when the raw insert actually affected a row, inside
  // the same transaction, so the two writes can never drift apart.
  async joinClub(userId: string, clubId: string): Promise<JoinState> {
    await this.assertClubExists(clubId);

    await this.prisma.$transaction(async (tx) => {
      const affected = await tx.$executeRaw`INSERT INTO "_ClubMembership" ("A", "B") VALUES (${clubId}, ${userId}) ON CONFLICT DO NOTHING`;
      if (affected > 0) {
        await tx.clubPage.update({ where: { id: clubId }, data: { memberCount: { increment: 1 } } });
      }
      // affected === 0 means this user was already a member — idempotent
      // success, memberCount left untouched, matching the codebase's
      // established idempotency convention for join/like/follow-style
      // actions (never double-count a repeat call).
    });

    return { clubId, joined: true, memberCount: await this.currentMemberCount(clubId) };
  }

  private async currentMemberCount(clubId: string): Promise<number> {
    const club = await this.prisma.clubPage.findUnique({ where: { id: clubId }, select: { memberCount: true } });
    return club?.memberCount ?? 0;
  }
}
