import { calculateAge, computeIsMinor, isPlausibleDateOfBirth } from './age.util';

describe('age.util', () => {
  const asOf = new Date('2026-08-16T00:00:00.000Z');

  describe('calculateAge', () => {
    it('computes exact age when the birthday already happened this year', () => {
      expect(calculateAge(new Date('2000-01-01'), asOf)).toBe(26);
    });

    it('computes exact age when the birthday has not happened yet this year', () => {
      expect(calculateAge(new Date('2000-12-25'), asOf)).toBe(25);
    });

    it('turns exactly 18 on the birthday itself', () => {
      expect(calculateAge(new Date('2008-08-16'), asOf)).toBe(18);
    });

    it('is still 17 the day before an 18th birthday', () => {
      expect(calculateAge(new Date('2008-08-17'), asOf)).toBe(17);
    });
  });

  describe('computeIsMinor', () => {
    it('is true for a 17-year-old', () => {
      expect(computeIsMinor(new Date('2009-01-01'), asOf)).toBe(true);
    });

    it('is false for someone who turned 18 today', () => {
      expect(computeIsMinor(new Date('2008-08-16'), asOf)).toBe(false);
    });

    it('is false for a clearly-adult date of birth', () => {
      expect(computeIsMinor(new Date('1990-01-01'), asOf)).toBe(false);
    });

    it('is true for a young child (Decision Log #8: no separate 13 threshold)', () => {
      expect(computeIsMinor(new Date('2020-01-01'), asOf)).toBe(true);
    });
  });

  describe('isPlausibleDateOfBirth', () => {
    it('accepts an ordinary adult date of birth', () => {
      expect(isPlausibleDateOfBirth(new Date('1990-01-01'), asOf)).toBe(true);
    });

    it('rejects a future date of birth', () => {
      expect(isPlausibleDateOfBirth(new Date('2027-01-01'), asOf)).toBe(false);
    });

    it('rejects an unparseable date', () => {
      expect(isPlausibleDateOfBirth(new Date('not-a-date'), asOf)).toBe(false);
    });

    it('rejects an implausibly old date of birth', () => {
      expect(isPlausibleDateOfBirth(new Date('1850-01-01'), asOf)).toBe(false);
    });
  });
});
