import { leagueZoneRules, zoneFor } from './standings-zones.constants';

const league = (name: string | null, country: string | null, id: string | null = null) => ({ id, name, country });

describe('standings zone rules', () => {
  it('matches the three leagues by normalised name and country', () => {
    expect(leagueZoneRules(league('Premier League', 'England'))).not.toBeNull();
    expect(leagueZoneRules(league('premier league', 'United Kingdom'))).not.toBeNull();
    expect(leagueZoneRules(league('La Liga', 'Spain'))).not.toBeNull();
    expect(leagueZoneRules(league('Primera División', 'Spain'))).not.toBeNull();
    expect(leagueZoneRules(league('Serie A', 'Italy'))).not.toBeNull();
  });

  it('gives no rules to another country, an unlisted league or a league with no country', () => {
    expect(leagueZoneRules(league('Premier League', 'Nigeria'))).toBeNull();
    expect(leagueZoneRules(league('Serie A', 'Brazil'))).toBeNull();
    expect(leagueZoneRules(league('Bundesliga', 'Germany'))).toBeNull();
    expect(leagueZoneRules(league('Ligue 1', 'France'))).toBeNull();
    expect(leagueZoneRules(league('Premier League', null))).toBeNull();
    expect(leagueZoneRules(league(null, 'England'))).toBeNull();
  });

  it.each([
    [20, [18, 19, 20]],
    [18, [16, 17, 18]],
  ])('counts from the top and from the bottom of a %i-team table', (size, relegated) => {
    const rules = leagueZoneRules(league('Premier League', 'England'));
    if (!rules) throw new Error('expected rules');
    const zones = Array.from({ length: size }, (_, i) => zoneFor(rules, i + 1, size));
    const placesIn = (zone: string) => zones.flatMap((z, i) => (z === zone ? [i + 1] : []));
    expect(placesIn('champions-league')).toEqual([1, 2, 3, 4]);
    expect(placesIn('europa-league')).toEqual([5]);
    expect(placesIn('relegation')).toEqual(relegated);
    expect(zones.filter(Boolean)).toHaveLength(8);
  });

  it('gives no zone in a table too small for the rules', () => {
    const rules = leagueZoneRules(league('Serie A', 'Italy'));
    if (!rules) throw new Error('expected rules');
    expect(zoneFor(rules, 1, 4)).toBeUndefined();
  });
});
