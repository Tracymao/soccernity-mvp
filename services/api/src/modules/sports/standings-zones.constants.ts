// Standings colour bands (CH-H21, founder choice 2026-11-28).
//
// The data provider sends no zone information, so the rules for the main leagues live HERE, in code.
// A league with no rule gets no colours and no legend.
//
// SEASON-DEPENDENT AND FOUNDER-CONFIRMED ON STAGING: European places follow the Figma convention
// (1 to 4 Champions League, 5 Europa League, bottom three relegated). The real allocation can change
// from season to season (cup winners, extra coefficient places), so check these each season.
//
// Matching is on normalised name plus country, as in league-priority.constants.ts. `ids` pins exact
// Highlightly league ids and wins over name matching. None of the names has been checked against live
// Highlightly data.
import { LeagueRef, normalizeCountry, normalizeLeagueText } from './league-priority.constants';

export type StandingsZone = 'champions-league' | 'europa-league' | 'relegation';

export const STANDINGS_ZONE_LABELS: Record<StandingsZone, string> = {
  'champions-league': 'UEFA Champions League',
  'europa-league': 'UEFA Europa League',
  relegation: 'Relegation',
};

// A position range, inclusive, counted from the top (1 = first) or from the bottom (1 = last).
export interface ZoneRule {
  zone: StandingsZone;
  count: 'top' | 'bottom';
  from: number;
  to: number;
}

export interface LeagueZones {
  name: string;
  aliases?: string[];
  country: string;
  ids?: string[];
  rules: readonly ZoneRule[];
}

const BIG_LEAGUE_RULES: readonly ZoneRule[] = [
  { zone: 'champions-league', count: 'top', from: 1, to: 4 },
  { zone: 'europa-league', count: 'top', from: 5, to: 5 },
  { zone: 'relegation', count: 'bottom', from: 1, to: 3 },
];

export const STANDINGS_ZONES: readonly LeagueZones[] = [
  { name: 'Premier League', country: 'England', rules: BIG_LEAGUE_RULES },
  { name: 'La Liga', aliases: ['Primera Division'], country: 'Spain', rules: BIG_LEAGUE_RULES },
  { name: 'Serie A', country: 'Italy', rules: BIG_LEAGUE_RULES },
  // ADD OTHER LEAGUES HERE (Bundesliga, Ligue 1, ...). Their rules differ (play-offs, fewer places)
  // and have not been given, so they are deliberately absent.
];

export function leagueZoneRules(league: LeagueRef): readonly ZoneRule[] | null {
  const byId = league.id ? STANDINGS_ZONES.find((l) => l.ids?.includes(league.id as string)) : undefined;
  if (byId) return byId.rules;
  const name = normalizeLeagueText(league.name);
  const country = normalizeCountry(league.country);
  if (!name || !country) return null;
  const match = STANDINGS_ZONES.find(
    (l) => [l.name, ...(l.aliases ?? [])].some((n) => normalizeLeagueText(n) === name) && normalizeCountry(l.country) === country,
  );
  return match?.rules ?? null;
}

// The zone of one position in a table of `size` teams, or undefined. A table too small for the rules to
// stay apart (a split or partial group) gets no zones at all.
export function zoneFor(rules: readonly ZoneRule[], position: number, size: number): StandingsZone | undefined {
  const reach = (count: ZoneRule['count']) => Math.max(0, ...rules.filter((r) => r.count === count).map((r) => r.to));
  if (size < reach('top') + reach('bottom')) return undefined;
  return rules.find((r) => {
    const place = r.count === 'top' ? position : size - position + 1;
    return place >= r.from && place <= r.to;
  })?.zone;
}
