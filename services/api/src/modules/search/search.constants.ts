// GET /search (Build Plan Section 4.7). Pagination — the same
// deliberate 20/50 default/max every other list endpoint in this
// codebase uses, re-declared locally per the established "small
// duplicate over cross-module import" convention (see
// clubs/dto/list-clubs-query.dto.ts's own comment, and
// blog/cursor.util.ts's header comment for the same reasoning applied
// to a cursor shape rather than a constant).
export const SEARCH_DEFAULT_PAGE_SIZE = 20;
export const SEARCH_MAX_PAGE_SIZE = 50;

// GET /search?scope= — one of these three, or omitted entirely (meaning
// "all three, grouped in the response" — see search.service.ts). A
// fourth scope was deliberately NOT added for banter rooms / community
// groups / grassroots teams — those already have their own dedicated
// GET /banter-rooms/search / GET /community-groups?... / GET /teams?...
// name filters (Build Plan Section 4.4 / 4.5), and Decision Log #139's
// parked need (the thing this module actually resolves) only ever named
// people-search plus, per this task's brief, clubs and posts alongside
// it.
export const SEARCH_SCOPES = ['users', 'clubs', 'posts'] as const;
export type SearchScope = (typeof SEARCH_SCOPES)[number];
