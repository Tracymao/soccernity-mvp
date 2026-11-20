import { ageTierFor } from './age-tier.util';

describe('ageTierFor', () => {
  const asOf = new Date('2026-10-17T12:00:00Z');

  it.each([
    ['2026-01-01', 'under_13'], // 9 months old: tier is by age, not by a lower floor
    ['2014-10-18', 'under_13'], // turns 12 tomorrow
    ['2013-10-17', 'under_16'], // turned 13 today
    ['2010-10-18', 'under_16'], // turns 16 tomorrow -> still 15
    ['2010-10-17', 'under_18'], // turned 16 today
    ['2008-10-18', 'under_18'], // turns 18 tomorrow -> still 17
    ['2008-10-17', 'adult'], // turned 18 today
    ['1990-05-02', 'adult'],
  ])('maps %s to %s', (dob, tier) => {
    expect(ageTierFor(new Date(dob), asOf)).toBe(tier);
  });
});
