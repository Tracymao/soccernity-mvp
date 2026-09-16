// sprint-4/sports-hub-highlightly-backend — the SportsDataClient abstraction. Mirrors
// StorageService's own established shape (src/storage/storage.service.ts): an ABSTRACT CLASS, not a
// plain TS interface + string/Symbol injection token, so NestJS resolves it as a real DI token on
// its own (`useClass: HighlightlyClient` in sports-data.module.ts), and a unit test can construct
// SportsService directly with any object satisfying this shape cast `as SportsDataClient`, with no
// Nest TestingModule and no real network access.
//
// The Raw* shapes below are grounded in Highlightly's own public football-API documentation
// (https://highlightly.net/football-api/documentation/), fetched live during this task and checked
// against the page's own literal example JSON blocks for /matches, /matches/{id}, /statistics,
// /lineups, /events, /head-2-head, /standings, and /highlights — not guessed from memory, and not a
// vendor SDK's own types (this codebase has no Highlightly SDK dependency). Field names below match
// those literal examples exactly. Two real, disclosed uncertainties the public docs did not resolve
// (both handled defensively in highlightly-client.service.ts, not silently assumed):
//   1. GET /matches/{id}'s own example response is wrapped in a top-level array (`[{...}]`) even
//      though it's a single-match lookup — this may be a documentation-generator artifact rather
//      than the real runtime shape. The client accepts EITHER a bare object or a one-element array.
//   2. The direct highlightly.net host's own auth header name for non-RapidAPI usage is not
//      explicitly documented separately from the RapidAPI one — the docs page states `x-rapidapi-key`
//      as the required auth header for "Highlightly or RapidAPI" API keys alike, with
//      `x-rapidapi-host` required ONLY for RapidAPI. See highlightly-client.service.ts's own header
//      comment for how this is handled.
export interface RawTeamRef {
  id: string | number;
  name: string;
  logo?: string | null;
  type?: string | null;
}

// Highlightly's own /matches response nests match status under a `state` object — `description` is
// a free-text phase string ("Not started", "First half", "Half time", "Second half", "Finished",
// "Postponed", "Cancelled", etc.), not a fixed enum; `score.current` is a ready display string like
// "3 - 1". See sports.service.ts's `derivePhase`/`parseScoreString` for how this raw shape is
// normalized into MatchData's own `status`/`statusDetail`/`homeScore`/`awayScore` columns.
export interface RawMatchState {
  description: string;
  clock?: string | number | null;
  score?: {
    current?: string | null;
    penalties?: string | null;
  } | null;
}

export interface RawLeagueRef {
  id: string | number;
  name: string;
  season?: string | number | null;
  logo?: string | null;
}

export interface RawVenue {
  name?: string | null;
  city?: string | null;
  country?: string | null;
  capacity?: string | number | null;
}

// The common match shape shared by /matches, /matches/{id} (base fields), and /head-2-head — `round`
// is TOP-LEVEL on the match object, not nested inside `league` (confirmed from the docs' own literal
// example). /matches/{id} additionally carries `events`/`statistics`/`referee`/`forecast`/
// `predictions`/`news` — NONE of which this integration surfaces (no Section 4.6 endpoint or Figma
// screen asks for a weather forecast, referee bio, or match predictions), so RawMatch deliberately
// stops at the fields this module actually uses. A future pass wanting those needs its own
// extension, not a silent one here.
export interface RawMatch {
  id: string | number;
  round?: string | null;
  date: string; // ISO kickoff timestamp
  homeTeam: RawTeamRef;
  awayTeam: RawTeamRef;
  league?: RawLeagueRef | null;
  state: RawMatchState;
  venue?: RawVenue | null;
}

export interface RawMatchesPage {
  items: RawMatch[];
  totalCount?: number;
}

// GET /statistics/{matchId} — bare top-level array, one entry per team, each carrying an array of
// {value, displayName} pairs. Highlightly's docs don't enumerate a fixed stat-key catalog (different
// competitions return different stat sets) — this client passes displayName through verbatim rather
// than mapping it onto a fixed internal key set, matching this schema's own "JSON document, not
// normalized rows" design (see schema.prisma's MatchData comment).
export interface RawStatisticItem {
  displayName: string;
  value: number | string | null;
}

export interface RawTeamStatistics {
  team: RawTeamRef;
  statistics: RawStatisticItem[];
}

// GET /events/{matchId} — bare top-level array. `time` is Highlightly's own minute-string format,
// e.g. "45+1" for first-half stoppage time — parsed by momentum.util.ts's `parseEventMinute`, never
// assumed to be a bare integer.
export interface RawMatchEvent {
  team?: RawTeamRef | null;
  time: string;
  type: string; // "Goal" | "Yellow Card" | "Red Card" | "Substitution" | a VAR-decision string | ...
  player?: string | null;
  playerId?: string | number | null;
  assist?: string | null;
  assistingPlayerId?: string | number | null;
  substituted?: string | null; // the player coming OFF, on a Substitution event
}

export interface RawLineupPlayer {
  id?: string | number | null;
  name: string;
  number?: number | null;
  position?: string | null;
}

// Confirmed from the docs' own literal example: each side of /lineups/{matchId} is the team's own
// identity (id/logo/name) MERGED with its lineup data, not two separate objects — and
// `initialLineup` is a NESTED array of arrays, grouped by tactical row (goalkeeper row, defensive
// row, midfield row, attacking row), not a flat 11-player list. Stored verbatim in this nested shape
// in MatchData.lineups (a JSON column) since Section 4.6's own lineups endpoint just returns the
// whole document — see momentum.util.ts/sports.service.ts for the one place this gets flattened,
// only for a player COUNT sanity check, never for display.
export interface RawLineupTeam extends RawTeamRef {
  formation?: string | null;
  initialLineup: RawLineupPlayer[][];
  substitutes: RawLineupPlayer[];
  missingPlayers?: RawLineupPlayer[] | null;
  coach?: string | null;
}

export interface RawLineups {
  homeTeam: RawLineupTeam;
  awayTeam: RawLineupTeam;
}

// GET /standings — one row per team, confirmed from the docs' own literal example. NOTE, stated
// plainly per this PR's own task brief: Highlightly's own documented standings row has NO "recent
// form" field anywhere (no `form`, no last-5-results string) — see
// sports.service.ts/modules/sports/README.md for how this is handled (not faked).
export interface RawStandingSplit {
  wins: number;
  draws: number;
  games: number;
  loses: number;
  scoredGoals: number;
  receivedGoals: number;
}

export interface RawStandingRow {
  position: number;
  points: number;
  team: RawTeamRef;
  total: RawStandingSplit;
  home?: RawStandingSplit | null;
  away?: RawStandingSplit | null;
}

export interface RawStandingsGroup {
  name?: string | null;
  standings: RawStandingRow[];
}

// GET /highlights — item shape confirmed from the docs' own literal example.
export interface RawHighlight {
  id: string | number;
  type: string; // "VERIFIED" | "UNVERIFIED"
  title: string;
  description?: string | null;
  imgUrl?: string | null;
  url: string;
  embedUrl?: string | null;
  channel?: string | null;
  source?: string | null;
  category?: string | null; // "match-highlights" | "goal-clip" | "post-match-content" | ...
}

export interface RawHighlightsPage {
  items: RawHighlight[];
  totalCount?: number;
}

export interface ListMatchesParams {
  date?: string; // YYYY-MM-DD
  leagueId?: string;
  limit?: number;
  offset?: number;
}

export interface ListHighlightsParams {
  matchId: string;
  limit?: number;
  offset?: number;
}

// Thrown when Highlightly itself reported "no such resource" (a genuine upstream 404) — as opposed
// to a network failure / non-2xx server error / the daily budget being exhausted (see
// sports-data.errors.ts for those). SportsService relies on this specific type to decide "return
// 404, don't fall back to a stale cache" vs. every other failure mode, where a stale cached row (if
// one exists) is served instead of failing the request outright.
export class SportsDataNotFoundError extends Error {
  constructor(message = 'Resource not found upstream') {
    super(message);
    this.name = 'SportsDataNotFoundError';
  }
}

export abstract class SportsDataClient {
  abstract getMatches(params: ListMatchesParams): Promise<RawMatchesPage>;
  abstract getMatchById(externalRef: string): Promise<RawMatch>;
  abstract getMatchStatistics(externalRef: string): Promise<RawTeamStatistics[]>;
  abstract getMatchLineups(externalRef: string): Promise<RawLineups>;
  abstract getMatchEvents(externalRef: string): Promise<RawMatchEvent[]>;
  abstract getHeadToHead(homeTeamId: string, awayTeamId: string): Promise<RawMatch[]>;
  abstract getStandings(leagueId: string, season: string): Promise<RawStandingsGroup[]>;
  abstract getHighlights(params: ListHighlightsParams): Promise<RawHighlightsPage>;
}
