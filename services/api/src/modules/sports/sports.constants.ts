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
export const DEFAULT_LIVE_CACHE_TTL_SECONDS = 60;
// Box score refreshes less often than live stats on purpose: Highlightly documents its own Match Box
// Score as refreshed every 5 minutes, and it is only read from the Match Centre's Statistics tab, so
// polling it every minute would spend the free-tier budget for no visible gain.
export const DEFAULT_BOX_SCORE_LIVE_CACHE_TTL_SECONDS = 5 * 60; // matches Highlightly's own documented ~once-a-minute live-data refresh cadence
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

// League ordering (league-priority.constants.ts). League metadata (country, logo) is refreshed from
// Highlightly's Leagues endpoint at most once a day, only when a league on screen has no metadata yet,
// and never more than this many pages per refresh. SHAPE UNVERIFIED against the live API (no key here).
export const DEFAULT_LEAGUE_META_MAX_PAGES = 10;
export const LEAGUE_META_PAGE_SIZE = 100;
export const LEAGUE_META_LOCK_TTL_SECONDS = 24 * 60 * 60;
// GET /sports/results/recent looks back at most this many days for the latest day with finished matches.
export const SPORTS_RESULTS_LOOKBACK_DAYS = 7;
// Matches read into memory for one ranked page (a day or all live matches; far below this in practice).
export const SPORTS_RANKED_READ_CAP = 2000;
export const SPORTS_STATUS_FILTERS = ['scheduled', 'live', 'finished'] as const;
export type SportsStatusFilter = (typeof SPORTS_STATUS_FILTERS)[number];
