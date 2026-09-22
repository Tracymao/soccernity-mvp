import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  decodeSearchClubCursor,
  decodeSearchPostCursor,
  decodeSearchUserCursor,
  encodeSearchClubCursor,
  encodeSearchPostCursor,
  encodeSearchUserCursor,
} from './cursor.util';
import { SearchQueryDto } from './dto/search-query.dto';
import { SEARCH_DEFAULT_PAGE_SIZE, SEARCH_MAX_PAGE_SIZE } from './search.constants';

// v1 simplification, disclosed rather than silently shipped: matching
// is Postgres ILIKE-equivalent substring matching (Prisma's `contains` +
// `mode: 'insensitive'`, the exact mechanism GET /banter-rooms/search?q=
// already uses — see banter/dto/list-banter-rooms-query.dto.ts's own
// comment), not full-text search. No `tsvector`/GIN full-text index and
// no unaccent extension exist anywhere in this codebase's migration
// history — building that infrastructure (a real schema migration, a
// ranking strategy, accent-folding) is a genuinely separate, larger
// piece of work and is explicitly out of scope for this PR. A search for
// "e" over a table with tens of thousands of rows does a sequential
// LIKE scan, same disclosed cost profile as every other `contains`
// filter already in this codebase (GET /banter-rooms?q=,
// GET /community-groups's city/positionPlayed/careerTrack filters, the
// GrassrootsPage server-side city filter). If/when this needs to scale
// past that, the natural next step is a `pg_trgm` GIN index per searched
// column, not a rewrite of this module's own query shape.

// Narrow, safe-to-expose field set for a User in a search result —
// mirrors feed.service.ts's own POST_AUTHOR_SELECT precedent exactly
// (id + displayName only; not re-imported, since POST_AUTHOR_SELECT
// isn't exported — small local duplicate, same convention
// blog/cursor.util.ts's header comment documents). In particular:
// isMinor is never selected, on purpose — that safeguarding-sensitive
// field must never appear in a payload any other user can read, and
// there is no `username`/handle column anywhere on User (Decision Log
// #58, still parked) to search on or return either.
const SEARCH_USER_SELECT = {
  id: true,
  displayName: true,
} as const;

type SearchUserRow = Prisma.UserGetPayload<{ select: typeof SEARCH_USER_SELECT }>;

export interface SearchUserResult {
  id: string;
  displayName: string;
}

// sprint-4/search-module (Decision Log #139). Every user-returning
// search result is scoped to accounts other modules already treat as
// publicly findable — mirroring users.service.ts's ACTIVE_FOLLOW_ENTRY_FILTER
// and clubs.service.ts's VISIBLE_CLUB_MEMBER_FILTER exactly (same two
// conditions, same reasoning, re-declared locally per this codebase's
// established "small duplicate over cross-module import" convention —
// neither constant is exported from its own module):
//
//  - accountStatus: 'active' — a deactivated, pending_deletion,
//    suspended, OR anonymized ('deleted') account never surfaces by
//    name in search. This is deliberately narrower than
//    ACTIVE_AUTHOR_POST_FILTER below (which allows 'deleted' through for
//    POSTS, because an anonymized author's own content is kept per
//    Decision Log #341) — an anonymized User ROW itself has nothing left
//    worth finding by name (displayName is scrubbed to "[deleted
//    user]"), so there is no reason to ever match it against a query.
//  - restricted-pending minors excluded — a minor with no CONFIRMED
//    guardian consent is invisible here, the same "hide via absence,
//    never a distinct signal" treatment users.service.ts's own
//    assertFollowGraphVisible and clubs.service.ts's
//    VISIBLE_CLUB_MEMBER_FILTER already give this exact case.
//
// There is no dedicated user-to-user "block" feature anywhere in this
// schema (grep confirms it — the only "block" surfaces in this codebase
// are the under-16 messaging restriction, the adult-cannot-message-minor
// rule, and admin-imposed account suspension, none of which are a
// per-pair block a search filter could apply). Those safeguarding rules
// are enforced at the point of ACTION (starting a conversation, sending
// a message — messaging.service.ts's own assertRecipientMessageable),
// not at the point of discovery — the same split GET /users/:id/followers
// already draws between "can this profile be found/listed at all" (this
// filter's job) and "am I specifically allowed to message this person"
// (a separate, later check the messaging module already owns). Search
// does not duplicate that second check.
const VISIBLE_SEARCH_USER_FILTER: Prisma.UserWhereInput = {
  accountStatus: 'active',
  OR: [{ isMinor: false }, { guardian: { consentStatus: 'confirmed' } }],
};

function toSearchUserResult(row: SearchUserRow): SearchUserResult {
  return { id: row.id, displayName: row.displayName };
}

// Same field set GET /clubs itself returns (clubs.service.ts's own
// CLUB_SELECT — not exported, so re-declared locally). No viewer-state
// (`joined`) is attached — GET /search carries no auth at all, so there
// is no calling user to compute a per-caller boolean against, unlike
// GET /clubs's own ClubSummaryWithViewerState (Decision Log #154).
const SEARCH_CLUB_SELECT = {
  id: true,
  name: true,
  league: true,
  country: true,
  logoUrl: true,
  memberCount: true,
} as const;

export type SearchClubResult = Prisma.ClubPageGetPayload<{ select: typeof SEARCH_CLUB_SELECT }>;

// Narrow author field set, mirroring SEARCH_USER_SELECT above (id +
// displayName only — never isMinor).
const SEARCH_POST_AUTHOR_SELECT = { id: true, displayName: true } as const;

const SEARCH_POST_SELECT = {
  id: true,
  contentText: true,
  author: { select: SEARCH_POST_AUTHOR_SELECT },
  createdAt: true,
  // Denormalized caches — same "safe to expose as plain ints on a lean
  // list payload" precedent as feed.service.ts's own POST_SELECT
  // comment.
  likeCount: true,
  commentCount: true,
} as const;

type SearchPostRow = Prisma.PostGetPayload<{ select: typeof SEARCH_POST_SELECT }>;

export interface SearchPostResult {
  id: string;
  contentText: string;
  author: SearchUserResult;
  createdAt: Date;
  likeCount: number;
  commentCount: number;
}

function toSearchPostResult(row: SearchPostRow): SearchPostResult {
  return {
    id: row.id,
    contentText: row.contentText,
    author: toSearchUserResult(row.author),
    createdAt: row.createdAt,
    likeCount: row.likeCount,
    commentCount: row.commentCount,
  };
}

// sprint-2/account-deactivation-backend (Decision Log #221) /
// sprint-2/account-anonymization-reconsideration (Decision Log #341) —
// this module's own copy of feed.service.ts's ACTIVE_AUTHOR_POST_FILTER
// (not exported, so re-declared locally, same convention as every other
// duplicate in this file). 'active' AND 'deleted' (anonymized) authors'
// posts are searchable — an anonymized author's own content is
// deliberately kept per Decision Log #341, only their attribution is
// gone (the embedded `author.displayName` a match returns will already
// read "[deleted user]" for those rows, exactly as it does in the real
// feed). deactivated / pending_deletion / suspended authors' posts are
// excluded, same as every other post-reading surface in this codebase.
const ACTIVE_AUTHOR_SEARCH_FILTER: Prisma.PostWhereInput = {
  author: { accountStatus: { in: ['active', 'deleted'] } },
};

export interface SearchResultPage<T> {
  items: T[];
  nextCursor: string | null;
}

// GET /search's response shape when `scope` is omitted — all three
// result types, each independently keyset-paginated (its own
// `nextCursor`). To page further into just one of the three, the client
// switches to a scoped request (`?scope=users&cursor=...`) using that
// group's own `nextCursor` — see search.service.ts's `search()` and
// SearchQueryDto's own header comment for why a single shared cursor
// across three differently-ordered result sets isn't offered.
export interface SearchAllResult {
  users: SearchResultPage<SearchUserResult>;
  clubs: SearchResultPage<SearchClubResult>;
  posts: SearchResultPage<SearchPostResult>;
}

// Build Plan Section 4.7 — GET /search. Resolves Decision Log #139's
// parked need: no people-search endpoint existed anywhere in
// services/api, so apps/web's NewConversationPage.tsx currently fakes
// person-search via a client-side filter over the caller's own
// GET /users/:id/following page (a real, disclosed limitation —
// see that file's own header comment). This module is backend-only;
// wiring the frontend to it is a separate, later PR.
//
// Genuinely public — no guard anywhere on SearchController, mirroring
// GET /sports/fixtures's own "no login gate" precedent (Build Plan
// Section 4.6) and GET /articles's (Section 4, sprint-4/public-blog-articles-feed):
// same category of read as Blog, not a private, caller-scoped feed like
// GET /posts/feed.
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    query: SearchQueryDto,
  ): Promise<SearchResultPage<SearchUserResult> | SearchResultPage<SearchClubResult> | SearchResultPage<SearchPostResult> | SearchAllResult> {
    const q = this.normalizeQuery(query.q);
    const limit = Math.min(query.limit ?? SEARCH_DEFAULT_PAGE_SIZE, SEARCH_MAX_PAGE_SIZE);
    // Captured into a local const so the narrowing below (undefined vs.
    // each literal) is unambiguous regardless of what runs in between —
    // narrowing a local const is always preserved, unlike re-narrowing a
    // parameter's property on every access.
    const scope = query.scope;

    if (!scope) {
      if (query.cursor) {
        // See SearchQueryDto's own header comment — a single opaque
        // cursor can't disambiguate which of the three differently-
        // ordered lists it continues.
        throw new BadRequestException('cursor requires scope to be specified');
      }
      const [users, clubs, posts] = await Promise.all([
        this.searchUsers(q, undefined, limit),
        this.searchClubs(q, undefined, limit),
        this.searchPosts(q, undefined, limit),
      ]);
      return { users, clubs, posts };
    }

    switch (scope) {
      case 'users':
        return this.searchUsers(q, query.cursor, limit);
      case 'clubs':
        return this.searchClubs(q, query.cursor, limit);
      case 'posts':
        return this.searchPosts(q, query.cursor, limit);
    }
  }

  // Alphabetical by displayName (displayName asc, id asc) — see
  // cursor.util.ts's header comment for why this differs from posts'
  // own newest-first order.
  async searchUsers(
    q: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<SearchResultPage<SearchUserResult>> {
    const filters: Prisma.UserWhereInput[] = [
      VISIBLE_SEARCH_USER_FILTER,
      { displayName: { contains: q, mode: 'insensitive' } },
    ];
    if (cursor) {
      const c = decodeSearchUserCursor(cursor);
      filters.push({
        OR: [
          { displayName: { gt: c.displayName } },
          { displayName: c.displayName, id: { gt: c.id } },
        ],
      });
    }

    const rows = await this.prisma.user.findMany({
      where: { AND: filters },
      select: SEARCH_USER_SELECT,
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map(toSearchUserResult);
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && last ? encodeSearchUserCursor({ displayName: last.displayName, id: last.id }) : null;

    return { items, nextCursor };
  }

  // Alphabetical by name (name asc, id asc) — matches GET /clubs's own
  // ordering exactly (clubs/cursor.util.ts).
  async searchClubs(
    q: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<SearchResultPage<SearchClubResult>> {
    const filters: Prisma.ClubPageWhereInput[] = [{ name: { contains: q, mode: 'insensitive' } }];
    if (cursor) {
      const c = decodeSearchClubCursor(cursor);
      filters.push({
        OR: [{ name: { gt: c.name } }, { name: c.name, id: { gt: c.id } }],
      });
    }

    const rows = await this.prisma.clubPage.findMany({
      where: { AND: filters },
      select: SEARCH_CLUB_SELECT,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    const nextCursor = hasMore && last ? encodeSearchClubCursor({ name: last.name, id: last.id }) : null;

    return { items: pageRows, nextCursor };
  }

  // Newest-first (createdAt desc, id desc) — matches GET /posts/feed /
  // GET /clubs/:id/feed / GET /banter-rooms/:id/posts's own direction.
  async searchPosts(
    q: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<SearchResultPage<SearchPostResult>> {
    const filters: Prisma.PostWhereInput[] = [
      ACTIVE_AUTHOR_SEARCH_FILTER,
      { contentText: { contains: q, mode: 'insensitive' } },
    ];
    if (cursor) {
      const c = decodeSearchPostCursor(cursor);
      filters.push({
        OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }],
      });
    }

    const rows = await this.prisma.post.findMany({
      where: { AND: filters },
      select: SEARCH_POST_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map(toSearchPostResult);
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && last ? encodeSearchPostCursor({ createdAt: last.createdAt, id: last.id }) : null;

    return { items, nextCursor };
  }

  // `q` is validated at the DTO layer on its RAW length (2-100,
  // SearchQueryDto) — this re-checks the TRIMMED length, the same
  // cross-field/business-rule-lives-in-the-service pattern
  // GrassrootsService.createFixture uses for its own teamBId/opponentName
  // check. Covers the edge case a raw-length check alone can't: a query
  // like "  a" (raw length 3, passes MinLength(2)) trims to a 1-char "a".
  // Trimming matters for correctness, not just cosmetics — a leading or
  // trailing space embedded in an ILIKE pattern narrows the match
  // (`contains: ' chelsea'` would not match "Chelsea FC"), so this is the
  // one normalization every search method below actually depends on.
  private normalizeQuery(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.length < 2) {
      throw new BadRequestException('q must be at least 2 characters');
    }
    return trimmed;
  }
}
