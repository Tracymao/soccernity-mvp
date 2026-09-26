// Sports-data provider capability registry. Built by sprint-4/sports-vendor-capability-registry.
//
// WHY THIS EXISTS: Decision Log #6 chose Highlightly, and its data gaps (no standings form, no top
// scorers, no xG, ...) had only ever been recorded qualitatively. This registry makes "which vendor can
// supply which field" a machine-readable fact, so (a) response shaping can OMIT a field the active
// vendor can't supply instead of ever sending a placeholder, and (b) a future vendor pivot is a config
// change (SPORTS_DATA_PROVIDER) plus an HTTP adapter, not a hunt through the service for hardcoded
// assumptions.
//
// SOURCES: every entry below is backed by the field-by-field matrix in highlightly-vs-sportmonks.md,
// which cites the vendor documentation page for each claim. Read that file before changing a status
// here — a status change without a documentation citation is a bug.
//
// WHAT FLIPPING THE PROVIDER DOES AND DOES NOT DO: `SportsDataClient`'s only implementation is
// `HighlightlyClient`. Setting SPORTS_DATA_PROVIDER=sportmonks changes what `providerSupports()` reports
// (and therefore which fields the service is willing to emit); it does NOT make the service talk to
// SportMonks. That HTTP integration is future work, and SportsService logs a warning at boot when the
// selected provider isn't the one the wired client actually implements.

export type SportsDataProvider = 'highlightly' | 'sportmonks';

export const SPORTS_DATA_PROVIDERS: readonly SportsDataProvider[] = ['highlightly', 'sportmonks'];

// Overridable via SPORTS_DATA_PROVIDER, same "independently overridable via its own env var" pattern the
// TTL constants in sports.constants.ts use (read through ConfigService in SportsService, NOT a
// module-load-time process.env read — that would race ConfigModule's own .env loading).
export const DEFAULT_ACTIVE_SPORTS_DATA_PROVIDER: SportsDataProvider = 'highlightly';

// The provider `SportsDataClient` is actually implemented for today. Used only to warn when config
// selects a provider whose HTTP adapter doesn't exist yet.
export const IMPLEMENTED_SPORTS_DATA_PROVIDER: SportsDataProvider = 'highlightly';

// Every field the comparison matrix covers. Vendor-NATIVE data only: Soccernity's own
// `GET /sports/matches/:id/momentum` is computed from cached events (momentum.util.ts) and is
// unaffected by this registry — `momentum` below means a momentum series the VENDOR supplies.
export type SportsDataField =
  | 'liveScores'
  | 'fixtures'
  | 'standings'
  | 'standingsForm'
  | 'matchEvents'
  | 'lineups'
  | 'matchStatistics' // team-level per-match statistics
  | 'playerBoxScores' // per-player, per-match statistics
  | 'playerRatings' // a per-player match rating
  | 'momentum' // vendor-supplied momentum time series
  | 'pressureIndex'
  | 'expectedGoals'
  | 'shotMaps' // shot locations (x/y) on the pitch
  | 'topScorers'
  | 'headToHead'
  | 'highlights'
  | 'leaguesMetadata'
  | 'countriesMetadata'
  | 'teamsMetadata'
  | 'playersMetadata'
  | 'odds';

// Three states, not two, deliberately: 'unconfirmed' means the vendor's PUBLIC documentation neither
// documents nor rules the field out (or the docs conflict), which is a different fact from "documented
// absent". The service treats anything other than 'supported' as "do not emit" — an unconfirmed field is
// hidden exactly like an unsupported one; the distinction exists so the doc/registry stay honest and a
// later live-API trace knows what still needs verifying.
export type CapabilityStatus = 'supported' | 'unsupported' | 'unconfirmed';

export interface ProviderCapability {
  status: CapabilityStatus;
  // Free-text qualifier (paid add-on, unverified path, docs conflict, ...). Documentation only —
  // never branched on in code.
  note?: string;
}

export type ProviderCapabilities = Record<SportsDataField, ProviderCapability>;

const supported = (note?: string): ProviderCapability => (note ? { status: 'supported', note } : { status: 'supported' });
const unsupported = (note?: string): ProviderCapability => (note ? { status: 'unsupported', note } : { status: 'unsupported' });
const unconfirmed = (note?: string): ProviderCapability => (note ? { status: 'unconfirmed', note } : { status: 'unconfirmed' });

export const SPORTS_DATA_PROVIDER_CAPABILITIES: Record<SportsDataProvider, ProviderCapabilities> = {
  highlightly: {
    liveScores: supported('GET /matches, state refreshed once a minute'),
    fixtures: supported(),
    standings: supported(),
    standingsForm: unsupported('documented standings row has no form field (README data gap #2)'),
    matchEvents: supported(),
    lineups: supported('available ~40 min before to ~120 min after kickoff'),
    matchStatistics: supported('team-level, GET /statistics/{matchId}'),
    playerBoxScores: supported('Match Box Score section exists in the docs; exact path NOT confirmed (three fetches rendered three paths) and never traced live'),
    playerRatings: unconfirmed('no rating documented; the box-score example only shows Goals/Assists and its full stat list could not be read'),
    momentum: unsupported(),
    pressureIndex: unsupported(),
    expectedGoals: unsupported(),
    shotMaps: unsupported(),
    topScorers: unsupported('no top/leading-scorers endpoint in the documented endpoint list'),
    headToHead: supported('last 10 meetings'),
    highlights: supported('the vendor differentiator; geo-restriction endpoint tier is documented inconsistently'),
    leaguesMetadata: supported(),
    countriesMetadata: supported(),
    teamsMetadata: supported(),
    playersMetadata: supported(),
    odds: supported('endpoint tier is documented inconsistently (docs page: not on Basic/Free; pricing page: features identical across tiers)'),
  },
  sportmonks: {
    liveScores: supported(),
    fixtures: supported(),
    standings: supported(),
    standingsForm: supported('include=form on standings endpoints; per-team W/D/L history tied to fixtures'),
    matchEvents: supported(),
    lineups: supported(),
    matchStatistics: supported(),
    playerBoxScores: supported('via the fixture lineups.details nested include; not observed populated in a real response'),
    playerRatings: supported('`rating` is a documented player statistic type (type_id 118)'),
    momentum: supported('closest equivalent is the Pressure Index; paid add-on'),
    pressureIndex: supported('per-minute per-team `pressure` include; paid add-on'),
    expectedGoals: supported('paid add-on; docs describe Basic (post-match) vs Advanced (real-time) xG packages'),
    shotMaps: unconfirmed('docs state shot-location (x/y) data is not confirmed; only ball coordinates and shot-level xG are documented'),
    topScorers: supported(),
    headToHead: supported(),
    highlights: unsupported('docs: "Match highlights: Not currently available"'),
    leaguesMetadata: supported(),
    countriesMetadata: supported('via the Core API'),
    teamsMetadata: supported(),
    playersMetadata: supported(),
    odds: supported('paid add-on (standard and premium feeds)'),
  },
};

// Validates a raw env value. Throws on an unknown provider rather than silently falling back: the
// provider selects which vendor's capability claims the service trusts, so a typo defaulting to
// 'highlightly' would quietly mislabel data.
export function resolveSportsDataProvider(raw: string | undefined | null): SportsDataProvider {
  if (raw == null || raw.trim() === '') return DEFAULT_ACTIVE_SPORTS_DATA_PROVIDER;
  const normalized = raw.trim().toLowerCase();
  if ((SPORTS_DATA_PROVIDERS as readonly string[]).includes(normalized)) return normalized as SportsDataProvider;
  throw new Error(`SPORTS_DATA_PROVIDER must be one of ${SPORTS_DATA_PROVIDERS.join(', ')} (got "${raw}")`);
}

// The single question the rest of the codebase should ask. Only 'supported' returns true.
export function providerSupports(provider: SportsDataProvider, field: SportsDataField): boolean {
  return SPORTS_DATA_PROVIDER_CAPABILITIES[provider][field].status === 'supported';
}
