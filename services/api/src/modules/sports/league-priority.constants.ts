// League popularity ranking for the Sports API (founder decision, 2026-11-25).
//
// No data provider supplies a popularity figure, so the order lives HERE, in code, not in the admin.
// A league's rank is its 1-based position in LEAGUE_PRIORITY; every league not on the list is
// unranked (null) and sorts after all ranked ones, by country A to Z then league name A to Z (a null
// country last).
//
// Matching is on NORMALISED name plus country (lower case, no diacritics, only letters and digits).
// `ids` pins exact Highlightly league ids and wins over name matching, so the founder can fix any
// entry that does not match on staging by adding the real id here. NONE of the names or ids below
// has been checked against live Highlightly data (no access from the build environment).
//
// An entry with a `country` only matches a league whose country matches, so "Premier League"
// (England) never matches another country's league of the same name. `anyCountry` is for
// international and continental competitions and distinctive names where the provider's country
// label ("World", "Europe", "International"...) is not worth depending on.

export interface LeaguePriorityEntry {
  name: string;
  aliases?: string[];
  country?: string;
  anyCountry?: boolean;
  ids?: string[];
}

export const LEAGUE_PRIORITY: readonly LeaguePriorityEntry[] = [
  // International finals tournaments: the most watched while they run.
  { name: 'FIFA World Cup', aliases: ['World Cup'], anyCountry: true },
  { name: 'UEFA European Championship', aliases: ['European Championship', 'UEFA Euro', 'Euro Championship'], anyCountry: true },
  { name: 'Africa Cup of Nations', aliases: ['CAF Africa Cup of Nations', 'AFCON'], anyCountry: true },
  { name: 'Copa America', aliases: ['CONMEBOL Copa America'], anyCountry: true },
  // Big European competitions.
  { name: 'Premier League', country: 'England' },
  { name: 'UEFA Champions League', aliases: ['Champions League'], anyCountry: true },
  { name: 'La Liga', aliases: ['Primera Division'], country: 'Spain' },
  { name: 'Serie A', country: 'Italy' },
  { name: 'Bundesliga', country: 'Germany' },
  { name: 'Ligue 1', country: 'France' },
  { name: 'UEFA Europa League', aliases: ['Europa League'], anyCountry: true },
  { name: 'UEFA Europa Conference League', aliases: ['UEFA Conference League', 'Conference League'], anyCountry: true },
  // Nigerian and African competitions.
  {
    name: 'Nigeria Premier Football League',
    aliases: ['NPFL', 'NPFL Premier League', 'Nigeria Professional Football League', 'Premier League'],
    country: 'Nigeria',
  },
  { name: 'CAF Champions League', aliases: ['African Champions League'], anyCountry: true },
  { name: 'CAF Confederation Cup', aliases: ['Confederation Cup'], anyCountry: true },
  // The rest of the ranked list.
  { name: 'FA Cup', country: 'England' },
  { name: 'EFL Cup', aliases: ['League Cup', 'Carabao Cup'], country: 'England' },
  { name: 'Championship', aliases: ['EFL Championship'], country: 'England' },
  { name: 'UEFA Nations League', aliases: ['Nations League'], anyCountry: true },
  { name: 'Copa del Rey', country: 'Spain' },
  { name: 'Coppa Italia', country: 'Italy' },
  { name: 'DFB-Pokal', aliases: ['DFB Pokal'], country: 'Germany' },
  { name: 'Coupe de France', country: 'France' },
  { name: 'Eredivisie', country: 'Netherlands' },
  { name: 'Primeira Liga', aliases: ['Liga Portugal'], country: 'Portugal' },
  { name: 'Saudi Pro League', aliases: ['Saudi Professional League', 'Pro League'], country: 'Saudi Arabia' },
  { name: 'MLS', aliases: ['Major League Soccer'], country: 'USA' },
  { name: 'Brasileirao Serie A', aliases: ['Serie A', 'Campeonato Brasileiro Serie A', 'Brasileirao'], country: 'Brazil' },
  { name: 'Liga Profesional', aliases: ['Liga Profesional Argentina', 'Primera Division'], country: 'Argentina' },
];

export interface LeagueRef {
  id: string | null;
  name: string | null;
  country: string | null;
}

export function normalizeLeagueText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

// Country labels the provider might use for the same place.
const COUNTRY_SYNONYMS: Record<string, string> = {
  usa: 'usa',
  unitedstates: 'usa',
  unitedstatesofamerica: 'usa',
  us: 'usa',
  england: 'england',
  unitedkingdom: 'england',
  uk: 'england',
};

function normalizeCountry(value: string | null | undefined): string {
  const n = normalizeLeagueText(value);
  return COUNTRY_SYNONYMS[n] ?? n;
}

const PREPARED = LEAGUE_PRIORITY.map((entry, index) => ({
  rank: index + 1,
  names: new Set([entry.name, ...(entry.aliases ?? [])].map(normalizeLeagueText)),
  country: entry.country ? normalizeCountry(entry.country) : null,
  anyCountry: entry.anyCountry === true,
  ids: new Set(entry.ids ?? []),
}));

// 1-based position in LEAGUE_PRIORITY, or null when the league is not on the list.
export function leagueRank(league: LeagueRef): number | null {
  if (league.id) {
    const byId = PREPARED.find((p) => p.ids.has(league.id as string));
    if (byId) return byId.rank;
  }
  const name = normalizeLeagueText(league.name);
  if (!name) return null;
  const country = normalizeCountry(league.country);
  for (const p of PREPARED) {
    if (!p.names.has(name)) continue;
    if (p.anyCountry) return p.rank;
    if (p.country && country && p.country === country) return p.rank;
  }
  return null;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base' });
}

// Ranked by position; then unranked by country A to Z (null country last), then league name A to Z
// (null name last), then league id so the order is total and stable.
export function compareLeagues(a: LeagueRef, b: LeagueRef): number {
  const ra = leagueRank(a);
  const rb = leagueRank(b);
  if (ra !== null && rb !== null) return ra - rb || compareText(a.name ?? '', b.name ?? '');
  if (ra !== null) return -1;
  if (rb !== null) return 1;
  if (a.country === null && b.country !== null) return 1;
  if (a.country !== null && b.country === null) return -1;
  if (a.country !== null && b.country !== null) {
    const c = compareText(a.country, b.country);
    if (c !== 0) return c;
  }
  if (a.name === null && b.name !== null) return 1;
  if (a.name !== null && b.name === null) return -1;
  const n = compareText(a.name ?? '', b.name ?? '');
  if (n !== 0) return n;
  return (a.id ?? '').localeCompare(b.id ?? '');
}
