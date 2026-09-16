// Sports Hub / Highlightly API client -- Build Plan Section 4.6, the
// SportsService built by sprint-4/sports-hub-highlightly-backend
// (services/api/src/modules/sports/). Every route here is genuinely
// public -- NO Authorization header, matching api/blog.ts's convention
// (no JwtAuthGuard/AdminJwtAuthGuard anywhere in SportsMatchesController
// / SportsStandingsController).
//
// Response shapes mirror sports.service.ts's Public* interfaces exactly
// -- this file never invents a field the backend doesn't return.
//
// Two real, confirmed Highlightly data gaps this client does NOT paper
// over (see modules/sports/README.md's own disclosure):
//   1. PublicMatchStatistics is TEAM-LEVEL only -- there is no per-player
//      box-score endpoint. The Figma redesign this page converts assumed
//      player rows were available; they are not, from this vendor.
//   2. PublicStandingRow carries no `form` (recent-results) field --
//      Highlightly's own /standings response has none. The Figma
//      Standing screen's FORM column has no real data source; this
//      client does not fabricate one.
// Both gaps are surfaced to the page, not hidden here, so the UI can
// render an honest "not available" state instead of silently omitting
// the section.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export type MatchPhase = "scheduled" | "live" | "finished" | "postponed" | "cancelled";

export interface TeamRef {
  id: string;
  name: string;
  logo: string | null;
}

export interface MatchSummary {
  id: string;
  competition: string;
  league: { id: string | null; name: string | null; season: string | null; round: string | null };
  venue: string | null;
  kickoffTime: string;
  status: MatchPhase;
  statusDetail: string | null;
  homeTeam: TeamRef;
  awayTeam: TeamRef;
  homeScore: number | null;
  awayScore: number | null;
  score: string | null;
}

export interface MatchesPage {
  items: MatchSummary[];
  nextCursor: string | null;
}

export interface StatisticItem {
  label: string;
  value: number | string | null;
}

export interface TeamStatistics {
  team: TeamRef;
  statistics: StatisticItem[];
}

// Team-level only -- see this file's own header comment, data gap #1.
export interface MatchStatistics {
  home: TeamStatistics | null;
  away: TeamStatistics | null;
  updatedAt: string | null;
}

export interface LineupPlayer {
  id: string | null;
  name: string;
  number: number | null;
  position: string | null;
}

export interface TeamLineup {
  team: TeamRef;
  formation: string | null;
  rows: LineupPlayer[][];
  startingXI: LineupPlayer[];
  substitutes: LineupPlayer[];
  missingPlayers: LineupPlayer[];
  coach: string | null;
}

export interface Substitution {
  minute: number;
  side: "home" | "away" | null;
  playerOff: string | null;
  playerOn: string | null;
}

export interface Lineups {
  home: TeamLineup;
  away: TeamLineup;
  substitutions: Substitution[];
  updatedAt: string | null;
}

// An automated match-event feed -- NEVER editorial commentary (matching
// the Figma "Live Commentary" design's own on-screen disclosure). Newest
// first.
export interface MatchEvent {
  minute: number;
  addedTime: number;
  displayMinute: string;
  type: string;
  side: "home" | "away" | null;
  player: string | null;
  assist: string | null;
  detail: string | null;
}

export interface MatchEvents {
  items: MatchEvent[];
  updatedAt: string | null;
}

export interface MomentumBar {
  minute: number;
  home: number;
  away: number;
}

export interface MomentumMarker {
  minute: number;
  side: "home" | "away" | null;
  type: string;
  label: string;
}

export interface Momentum {
  bars: MomentumBar[];
  markers: MomentumMarker[];
  updatedAt: string | null;
}

export interface HeadToHeadAggregate {
  played: number;
  homeTeamWins: number;
  awayTeamWins: number;
  draws: number;
  homeTeamGoals: number;
  awayTeamGoals: number;
}

export interface HeadToHead {
  meetings: MatchSummary[];
  aggregate: HeadToHeadAggregate;
  updatedAt: string | null;
}

// No `form` field -- see this file's own header comment, data gap #2.
export interface StandingRow {
  position: number;
  team: TeamRef;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface StandingsGroup {
  name: string | null;
  rows: StandingRow[];
}

export interface Standings {
  leagueId: string;
  season: string;
  groups: StandingsGroup[];
  updatedAt: string | null;
}

export interface Highlight {
  id: string;
  type: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  url: string;
  embedUrl: string | null;
  source: string | null;
  category: string | null;
}

export interface Highlights {
  items: Highlight[];
  updatedAt: string | null;
}

export class SportsApiError extends Error {
  readonly status?: number;

  constructor(message: string, options?: { status?: number }) {
    super(message);
    this.name = "SportsApiError";
    this.status = options?.status;
  }
}

async function get<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`);
  } catch {
    throw new SportsApiError("Couldn't reach the Soccernity server.");
  }

  if (!response.ok) {
    throw new SportsApiError(`Couldn't load that (${response.status}).`, { status: response.status });
  }

  return (await response.json()) as T;
}

// GET /sports/live-scores?league=&cursor= -- reads status='live' MatchData
// rows only. `league` is an additional, optional filter beyond Section
// 4.6's literal contract (flagged in the backend's own README, same
// category as Blog's categoryId/categorySlug).
export async function listLiveScores(options?: { league?: string; cursor?: string }): Promise<MatchesPage> {
  const params = new URLSearchParams();
  if (options?.league) params.set("league", options.league);
  if (options?.cursor) params.set("cursor", options.cursor);
  const qs = params.toString();
  return get<MatchesPage>(`/sports/live-scores${qs ? `?${qs}` : ""}`);
}

// GET /sports/fixtures?date=&league=&cursor= -- `date` is required
// (YYYY-MM-DD).
export async function listFixtures(
  date: string,
  options?: { league?: string; cursor?: string },
): Promise<MatchesPage> {
  const params = new URLSearchParams({ date });
  if (options?.league) params.set("league", options.league);
  if (options?.cursor) params.set("cursor", options.cursor);
  return get<MatchesPage>(`/sports/fixtures?${params.toString()}`);
}

// GET /sports/matches/:id
export async function getMatchById(matchId: string): Promise<MatchSummary> {
  return get<MatchSummary>(`/sports/matches/${matchId}`);
}

// GET /sports/matches/:id/stats
export async function getMatchStatistics(matchId: string): Promise<MatchStatistics> {
  return get<MatchStatistics>(`/sports/matches/${matchId}/stats`);
}

// GET /sports/matches/:id/lineups -- also carries a substitutions
// timeline derived server-side from the cached events document.
export async function getMatchLineups(matchId: string): Promise<Lineups> {
  return get<Lineups>(`/sports/matches/${matchId}/lineups`);
}

// GET /sports/matches/:id/h2h
export async function getHeadToHead(matchId: string): Promise<HeadToHead> {
  return get<HeadToHead>(`/sports/matches/${matchId}/h2h`);
}

// GET /sports/matches/:id/momentum -- NOT in Section 4.6's literal
// endpoint list (a genuine addition, flagged in the backend's own
// README), built to back the Figma redesign's Match Momentum section.
export async function getMatchMomentum(matchId: string): Promise<Momentum> {
  return get<Momentum>(`/sports/matches/${matchId}/momentum`);
}

// GET /sports/matches/:id/events -- also NOT in Section 4.6's literal
// list, same Decision Log candidate as momentum. Backs "Live
// Commentary" -- an automated event feed, never editorial narration.
export async function getMatchEvents(matchId: string): Promise<MatchEvents> {
  return get<MatchEvents>(`/sports/matches/${matchId}/events`);
}

// GET /sports/standings?league=&season= -- `season` is optional; the
// backend defaults it to whatever season is already cached for that
// league (see GetStandingsQueryDto's own comment / README).
export async function getStandings(league: string, season?: string): Promise<Standings> {
  const params = new URLSearchParams({ league });
  if (season) params.set("season", season);
  return get<Standings>(`/sports/standings?${params.toString()}`);
}

// GET /sports/highlights/:matchId -- not paginated (a single match's
// clip count is naturally small).
export async function getHighlights(matchId: string): Promise<Highlights> {
  return get<Highlights>(`/sports/highlights/${matchId}`);
}
