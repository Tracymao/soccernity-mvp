// Illustrative dummy data for SportsHubPage.tsx.
//
// Backend state, confirmed live before writing this: services/api/src/
// modules/sports/README.md is a placeholder only ("Build target:
// Sprint 4... Not yet implemented"). Decision Log #6 (sports-data vendor)
// is still open and explicitly blocks Sprint 4 -- there is no live
// fixtures/scores/leagues endpoint anywhere. The `MatchData` model in
// prisma/schema.prisma exists but has zero live reads or writes. Every
// league, score and story below is hardcoded to match the Figma frame's
// own dummy content ("Sports Page" 1009:673's Liverpool vs Chelsea rows),
// the same convention HomePage.tsx's FIXTURES constant already uses for
// the identical reason.
export interface LeagueOption {
  id: string;
  name: string;
}

export const LEAGUES: LeagueOption[] = [
  { id: "premier-league", name: "Premier League" },
  { id: "ligue-1", name: "Ligue 1" },
  { id: "bundesliga", name: "Bundesliga" },
  { id: "serie-a", name: "Serie A" },
  { id: "npfl", name: "NPFL" },
  { id: "laliga", name: "LaLiga" },
  { id: "ucl", name: "UEFA Champions League" },
  { id: "europa", name: "Europa League" },
];

export type MatchStatus = "live" | "ht" | "ft";

export interface MatchRow {
  id: string;
  league: string;
  status: MatchStatus;
  statusLabel: string;
  home: string;
  homeScore: number;
  away: string;
  awayScore: number;
}

// Matches Figma's repeated "Liverpool 1 - 3 Chelsea" row content verbatim
// (Decision Log #85's own dummy-data convention for this exact match).
export const MATCHES: MatchRow[] = [
  { id: "m1", league: "premier-league", status: "live", statusLabel: "52'", home: "Liverpool", homeScore: 1, away: "Chelsea", awayScore: 3 },
  { id: "m2", league: "premier-league", status: "ht", statusLabel: "HT", home: "Liverpool", homeScore: 1, away: "Chelsea", awayScore: 3 },
  { id: "m3", league: "premier-league", status: "ft", statusLabel: "FT", home: "Liverpool", homeScore: 1, away: "Chelsea", awayScore: 3 },
  { id: "m4", league: "ligue-1", status: "ft", statusLabel: "FT", home: "Liverpool", homeScore: 1, away: "Chelsea", awayScore: 3 },
  { id: "m5", league: "npfl", status: "live", statusLabel: "67'", home: "Liverpool", homeScore: 1, away: "Chelsea", awayScore: 3 },
];

export const RECENT_STORIES = [
  { title: "Kane joins 250 club after heading Spurs past Wolves", meta: "2h ago" },
  { title: "NPFL roundup: Rivers United extend unbeaten run", meta: "5h ago" },
  { title: "Grassroots spotlight: Surulere United promoted", meta: "Yesterday" },
];
