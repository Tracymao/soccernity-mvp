import { compareLeagues, leagueRank, LEAGUE_PRIORITY, normalizeLeagueText } from './league-priority.constants';

describe('league priority', () => {
  it('normalises case, diacritics and punctuation', () => {
    expect(normalizeLeagueText('Brasileirão Série A')).toBe(normalizeLeagueText('brasileirao serie a'));
    expect(normalizeLeagueText('Copa América')).toBe('copaamerica');
  });

  it('ranks by list position (1-based) and international finals come first', () => {
    const worldCup = leagueRank({ id: '1', name: 'FIFA World Cup', country: null });
    const premier = leagueRank({ id: '2', name: 'Premier League', country: 'England' });
    expect(worldCup).toBe(1);
    expect(premier).not.toBeNull();
    expect(worldCup!).toBeLessThan(premier!);
  });

  it('matches a competition with anyCountry whatever the country (or none)', () => {
    expect(leagueRank({ id: '1', name: 'UEFA Champions League', country: null })).not.toBeNull();
    expect(leagueRank({ id: '1', name: 'UEFA Champions League', country: 'Europe' })).not.toBeNull();
  });

  it('does not match a country-bound league when the country is unknown or different', () => {
    expect(leagueRank({ id: '1', name: 'Premier League', country: null })).toBeNull();
    expect(leagueRank({ id: '1', name: 'Premier League', country: 'Russia' })).toBeNull();
  });

  it('is not case or diacritic sensitive on the country', () => {
    expect(leagueRank({ id: '1', name: 'premier league', country: 'ENGLAND' })).not.toBeNull();
  });

  it('puts ranked before unranked and orders by rank', () => {
    const a = { id: 'a', name: 'Serie A', country: 'Italy' };
    const b = { id: 'b', name: 'La Liga', country: 'Spain' };
    const c = { id: 'c', name: 'Some Local League', country: 'Albania' };
    expect(compareLeagues(b, a)).toBeLessThan(0);
    expect(compareLeagues(a, c)).toBeLessThan(0);
    expect(compareLeagues(c, a)).toBeGreaterThan(0);
  });

  it('orders unranked leagues by country A-Z, then name, null country last', () => {
    const sorted = [
      { id: '1', name: 'Zeta', country: null },
      { id: '2', name: 'Beta', country: 'Zambia' },
      { id: '3', name: 'Alpha', country: 'Albania' },
      { id: '4', name: 'Aardvark', country: 'Albania' },
      { id: '5', name: 'Ångström Cup', country: 'Zambia' },
    ].sort(compareLeagues);
    expect(sorted.map((l) => l.id)).toEqual(['4', '3', '5', '2', '1']);
  });

  it('has no duplicate entries', () => {
    const keys = LEAGUE_PRIORITY.map((e) => `${normalizeLeagueText(e.name)}|${e.country ?? ''}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
