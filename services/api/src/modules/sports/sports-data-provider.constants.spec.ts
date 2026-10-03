import {
  DEFAULT_ACTIVE_SPORTS_DATA_PROVIDER,
  fieldAvailability,
  providerSupports,
  resolveSportsDataProvider,
  SPORTS_DATA_PROVIDER_CAPABILITIES,
  SPORTS_DATA_PROVIDERS,
  SportsDataField,
} from './sports-data-provider.constants';

describe('sports data provider capability registry', () => {
  it('defaults the active provider to highlightly', () => {
    expect(DEFAULT_ACTIVE_SPORTS_DATA_PROVIDER).toBe('highlightly');
    expect(resolveSportsDataProvider(undefined)).toBe('highlightly');
    expect(resolveSportsDataProvider('')).toBe('highlightly');
    expect(resolveSportsDataProvider('   ')).toBe('highlightly');
  });

  it('accepts either provider name case-insensitively, trimmed', () => {
    expect(resolveSportsDataProvider('sportmonks')).toBe('sportmonks');
    expect(resolveSportsDataProvider('  SportMonks ')).toBe('sportmonks');
    expect(resolveSportsDataProvider('HIGHLIGHTLY')).toBe('highlightly');
  });

  it('throws on an unknown provider rather than silently falling back to the default', () => {
    expect(() => resolveSportsDataProvider('api-football')).toThrow(/SPORTS_DATA_PROVIDER/);
  });

  it('gives every provider an entry for every field (no provider can be missing a field)', () => {
    const [first, ...rest] = SPORTS_DATA_PROVIDERS.map((p) => Object.keys(SPORTS_DATA_PROVIDER_CAPABILITIES[p]).sort());
    for (const other of rest) expect(other).toEqual(first);
  });

  it('flipping the provider changes what the capability check returns', () => {
    // The six fields Highlightly cannot supply today (Decision Log #336 + README data gap #2).
    const hiddenOnHighlightly: SportsDataField[] = ['topScorers', 'expectedGoals', 'pressureIndex', 'shotMaps', 'playerRatings', 'standingsForm'];
    for (const field of hiddenOnHighlightly) expect(providerSupports('highlightly', field)).toBe(false);

    // SportMonks documents all of them except shot maps (docs do not confirm shot-location data).
    expect(providerSupports('sportmonks', 'standingsForm')).toBe(true);
    expect(providerSupports('sportmonks', 'topScorers')).toBe(true);
    expect(providerSupports('sportmonks', 'expectedGoals')).toBe(true);
    expect(providerSupports('sportmonks', 'pressureIndex')).toBe(true);
    expect(providerSupports('sportmonks', 'playerRatings')).toBe(true);
    expect(providerSupports('sportmonks', 'shotMaps')).toBe(false);
  });

  it("treats 'unconfirmed' exactly like 'unsupported' — only 'supported' passes", () => {
    expect(SPORTS_DATA_PROVIDER_CAPABILITIES.highlightly.playerRatings.status).toBe('unconfirmed');
    expect(providerSupports('highlightly', 'playerRatings')).toBe(false);
    expect(SPORTS_DATA_PROVIDER_CAPABILITIES.sportmonks.shotMaps.status).toBe('unconfirmed');
    expect(providerSupports('sportmonks', 'shotMaps')).toBe(false);
  });

  it('fieldAvailability separates "vendor cannot supply it" from "supported, nothing cached yet"', () => {
    expect(fieldAvailability('highlightly', 'topScorers', false)).toBe('not_available_from_provider');
    expect(fieldAvailability('highlightly', 'topScorers', true)).toBe('not_available_from_provider');
    expect(fieldAvailability('sportmonks', 'topScorers', false)).toBe('no_data');
    expect(fieldAvailability('sportmonks', 'topScorers', true)).toBe('available');
    // unconfirmed is treated as unavailable, same as unsupported
    expect(fieldAvailability('sportmonks', 'shotMaps', true)).toBe('not_available_from_provider');
  });

  it('records the vendor-specific facts the doc relies on', () => {
    // SportMonks has no video highlights right now; Highlightly's highlights are its differentiator.
    expect(providerSupports('highlightly', 'highlights')).toBe(true);
    expect(providerSupports('sportmonks', 'highlights')).toBe(false);
  });
});
