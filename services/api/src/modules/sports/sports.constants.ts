// Section 5.5 pagination discipline — default 20 / max 50, same as every other cursor-paginated
// list endpoint in this codebase (feed/, clubs/, blog/, grassroots/, banter/, community-groups/).
export const SPORTS_DEFAULT_PAGE_SIZE = 20;
export const SPORTS_MAX_PAGE_SIZE = 50;

// Caching/refresh-strategy TTLs (seconds), each independently overridable via its own env var (see
// .env.example) so ops can retune once the real paid-tier request budget is known — see
// modules/sports/README.md's "Caching / refresh strategy" section for the full reasoning behind
// each number below. Every one of these is the TTL for the Redis refresh-lock key that gates a real
// Highlightly call for that resource (sports-refresh-lock.ts) — NOT a bare Redis cache-value TTL;
// Postgres (MatchData/Standing) is the actual durable store these numbers gate writes into.
export const DEFAULT_LIVE_CACHE_TTL_SECONDS = 60; // matches Highlightly's own documented ~once-a-minute live-data refresh cadence
export const DEFAULT_SCHEDULED_CACHE_TTL_SECONDS = 6 * 60 * 60; // 6h — a not-yet-started fixture's lineups/details rarely change this often
export const DEFAULT_FINISHED_CACHE_TTL_SECONDS = 24 * 60 * 60; // 24h — final match data is effectively immutable, but not treated as literally infinite (rare post-match corrections, e.g. a VAR review overturning a card after the fact)
export const DEFAULT_STANDINGS_CACHE_TTL_SECONDS = 30 * 60; // 30 min — matches Highlightly's own documented "standings refresh up to an hour after a match"
export const DEFAULT_H2H_CACHE_TTL_SECONDS = 6 * 60 * 60; // 6h — a head-to-head history only grows once per fixture between the two teams, never faster than that
export const DEFAULT_HIGHLIGHTS_CACHE_TTL_SECONDS = 10 * 60; // 10 min — new highlight clips can appear during/shortly after a live match; tempered well below "once a minute" against the daily request budget

// Match-list refresh (GET /sports/fixtures?date=, and the live-scores read built on top of the same
// cached rows — see sports.service.ts) is gated by ONE lock per (date[, leagueId]), not per match —
// a single /matches call from Highlightly can return every match for a whole day across every
// league in one request, so refreshing per-date (not per-match) is what actually keeps this
// rate-limit-conscious.
export type MatchPhase = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';
