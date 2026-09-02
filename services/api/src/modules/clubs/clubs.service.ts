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

// What GET /clubs and GET /clubs/:id actually return to a client: the
// lean club row plus ONE per-request-user-computed boolean (Decision Log
// #154). `joined` is NOT a stored column — it's `true` iff a
// `ClubPage.members` relation row exists for (this club, the CALLING
// user). Same discipline as feed.service.ts's `FeedPostWithViewerState`
// (Decision Log #153): the field is an intersection on top, never added
// to CLUB_SELECT itself.
//
// Resolved WITHOUT an N+1: `listClubs()` resolves a whole page with a
// single batched `clubPage.findMany({ where: { id: { in: [...] },
// members: { some: { id: userId } } } })`; `getClubById()` resolves the
// single club with one `findFirst`. Both use a plain Prisma relation
// filter — a read-only existence check needs none of the raw-SQL
// atomicity `joinClub`/`leaveClub` require for their INSERT/DELETE.
export type ClubSummaryWithViewerState = ClubSummary & { joined: boolean };

export interface ClubPageResult {
  items: ClubSummaryWithViewerState[];
  nextCursor: string | null;
}

// `joined` is a plain boolean (not the `true`/`false` literal split you
// might expect from separate join/leave types) — mirroring
// FeedService.LikeState's own precedent (`liked: boolean`, shared by
// both likePost and unlikePost) rather than inventing a parallel
// JoinState/LeaveState pair for a single-field difference.
export interface JoinState {
  clubId: string;
  joined: boolean;
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
  async listClubs(query: ListClubsQueryDto, userId: string): Promise<ClubPageResult> {
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
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const last = trimmed[trimmed.length - 1];
    const nextCursor = hasMore && last ? encodeClubCursor({ name: last.name, id: last.id }) : null;

    const joinedIds = await this.membershipSubset(
      userId,
      trimmed.map((c) => c.id),
    );
    const items = trimmed.map((club) => ({ ...club, joined: joinedIds.has(club.id) }));

    return { items, nextCursor };
  }

  // Decision Log #154 — the subset of `clubIds` the caller is a member
  // of, resolved in ONE batched query, never one lookup per club (no
  // N+1). Empty input → empty Set with no query issued (same
  // zero-item short-circuit feed.service.ts's attachViewerState uses).
  // A plain Prisma relation filter (`members: { some: { id } }`) is the
  // right tool for a read-only existence check — `joinClub`/`leaveClub`
  // only needed raw SQL against "_ClubMembership" for the atomicity an
  // INSERT/DELETE + memberCount update requires, which doesn't apply to
  // a read.
  private async membershipSubset(userId: string, clubIds: string[]): Promise<Set<string>> {
    if (clubIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.clubPage.findMany({
      where: { id: { in: clubIds }, members: { some: { id: userId } } },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
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
  //
  // Takes `userId` (the caller, from @CurrentUser() — a real controller-
  // signature change made alongside this, see clubs.controller.ts) so the
  // response can carry the same per-caller `joined` flag `listClubs` does
  // (Decision Log #154). One club, so a single `findFirst` existence
  // check — no batching needed. The 404 for a missing club is still
  // thrown before the membership lookup.
  async getClubById(clubId: string, userId: string): Promise<ClubSummaryWithViewerState> {
    const club = await this.prisma.clubPage.findUnique({ where: { id: clubId }, select: CLUB_SELECT });
    if (!club) {
      throw new NotFoundException('Club not found');
    }
    const membership = await this.prisma.clubPage.findFirst({
      where: { id: clubId, members: { some: { id: userId } } },
      select: { id: true },
    });
    return { ...club, joined: membership !== null };
  }

  // Shared existence check for getClubById and joinClub, mirroring
  // FeedService.assertPostExists / UsersService.assertUserExists's exact
  // shape/intent: "does :id reference a real ClubPage" is the first move,
  // and a well-formed but non-existent id must 404, never a raw FK
  // violation surfaced as 400/500.
  //
  // Deliberately public (not private, as originally written) as of
  // sprint-2/auto-join-on-signup: RegistrationService needs to validate
  // a caller-supplied clubId *before* committing the new User row, so a
  // bad clubId 404s the whole registration without leaving an orphaned,
  // club-less User behind (see registration.service.ts's own comment on
  // this ordering). Reusing this exact check — rather than duplicating
  // it or calling the heavier getClubById (which selects the full club
  // record RegistrationService has no use for) — keeps "does this
  // clubId exist" defined in exactly one place.
  async assertClubExists(clubId: string): Promise<void> {
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

  // DELETE /clubs/:id/join. Symmetric with joinClub above — mirrors its
  // exact structure and idempotency discipline (assertClubExists first,
  // same raw-SQL-against-"_ClubMembership" mechanism, same
  // interactive-transaction pairing of the row mutation with the
  // memberCount update) rather than inventing a different approach for
  // the reverse direction. See clubs/README.md's "join-only, no leave"
  // section (now closed) for the full history of why this didn't exist
  // until now.
  //
  // Two things combine to guard memberCount against ever going negative,
  // deliberately layered rather than relying on either alone:
  //
  // 1. The raw DELETE's own affected-row count (`affected > 0`) is
  //    checked before touching memberCount at all — exactly the same
  //    "only mutate the counter when the row mutation actually did
  //    something" discipline joinClub's `INSERT ... ON CONFLICT DO
  //    NOTHING` already established for the insert direction. Leaving a
  //    club you were never a member of (or already left) affects 0 rows,
  //    so memberCount is never touched — that alone makes leaveClub
  //    idempotent, same as joinClub.
  // 2. Even when the DELETE does affect a row, the decrement itself uses
  //    `updateMany` with a `memberCount: { gt: 0 }` where-clause guard —
  //    the exact pattern FeedService.unlikePost uses for `likeCount`, so
  //    a decrement can never push memberCount below 0 even in a
  //    hypothetical drift scenario (e.g. memberCount was already
  //    manually reset to 0 while a stale membership row still existed).
  //    Under normal operation #1 alone would already prevent this, but
  //    #2 is cheap, already-established codebase precedent, and costs
  //    nothing to include as a second line of defense.
  //
  // Leaving a club you're not a member of is treated as idempotent
  // success (joined: false, memberCount unchanged), never a 404 — "you
  // don't have this membership" and "you successfully ensured you don't
  // have this membership" land on the same observable end state, the
  // same reasoning unlikePost/unfollowUser/unsavePost already established
  // for their own DELETE endpoints. A non-existent clubId is still a 404
  // (via assertClubExists), matching joinClub's own 404 case exactly.
  async leaveClub(userId: string, clubId: string): Promise<JoinState> {
    await this.assertClubExists(clubId);

    await this.prisma.$transaction(async (tx) => {
      const affected = await tx.$executeRaw`DELETE FROM "_ClubMembership" WHERE "A" = ${clubId} AND "B" = ${userId}`;
      if (affected > 0) {
        await tx.clubPage.updateMany({
          where: { id: clubId, memberCount: { gt: 0 } },
          data: { memberCount: { decrement: 1 } },
        });
      }
      // affected === 0 means this user was not a member (never joined, or
      // already left) — idempotent success, memberCount left untouched.
    });

    return { clubId, joined: false, memberCount: await this.currentMemberCount(clubId) };
  }

  private async currentMemberCount(clubId: string): Promise<number> {
    const club = await this.prisma.clubPage.findUnique({ where: { id: clubId }, select: { memberCount: true } });
    return club?.memberCount ?? 0;
  }
}
