// GET /users/suggested (Build Plan Section 4.7's Search & Trending
// "Suggested" follow panel — Decision Log #139). Same deliberate
// default/max shape as TrendingQueryDto's own limit
// (search/trending.constants.ts) — a small, fixed-size panel, not a
// browsable/paginated catalog. Re-declared locally rather than importing
// from the search module, per this codebase's established "small
// duplicate over cross-module import" convention (search/README.md's own
// "Exclusion rules" section documents the same pattern for
// VISIBLE_SEARCH_USER_FILTER / ACTIVE_AUTHOR_SEARCH_FILTER).
export const SUGGESTED_USERS_DEFAULT_LIMIT = 10;
export const SUGGESTED_USERS_MAX_LIMIT = 50;
