import { computeRankChange7d, getBoardWindow, getSevenDayBaseline, isAllTimePeriod } from './leaderboard-period.util';

// backend/b053-leaderboard-periods (B-053). Hand-derived fixtures: 2026-08-10 is a Monday (2026-W33 =
// Mon 2026-08-10 through Sun 2026-08-16, the anchor leaderboard.e2e-spec.ts uses), so 2026-W32 is
// Mon 2026-08-03 through Sun 2026-08-09 and 2026-W31 starts Mon 2026-07-27.
const d = (iso: string) => new Date(iso);

describe('leaderboard-period.util', () => {
  describe('isAllTimePeriod', () => {
    it('is true only for exactly "all-time"', () => {
      expect(isAllTimePeriod('all-time')).toBe(true);
      expect(isAllTimePeriod('All-Time')).toBe(false);
      expect(isAllTimePeriod('2026-W33')).toBe(false);
    });
  });

  describe('getBoardWindow', () => {
    it("is the ISO week's [Monday, next Monday) for a weekly period", () => {
      expect(getBoardWindow('2026-W33')).toEqual({
        start: d('2026-08-10T00:00:00.000Z'),
        end: d('2026-08-17T00:00:00.000Z'),
      });
    });

    it('covers the whole ledger for all-time: from the epoch to a far-future instant', () => {
      const { start, end } = getBoardWindow('all-time');
      expect(start.getTime()).toBe(0);
      expect(end.getUTCFullYear()).toBe(9999);
    });
  });

  describe('getSevenDayBaseline', () => {
    it('all-time: the board as it stood exactly seven days before now, counting from the start', () => {
      const { asOf, windowStart } = getSevenDayBaseline('all-time', d('2026-08-12T12:00:00.000Z'));
      expect(asOf).toEqual(d('2026-08-05T12:00:00.000Z'));
      expect(windowStart.getTime()).toBe(0);
    });

    it("the CURRENT week: last week's board at the same moment (week to date against week to date)", () => {
      // Wednesday 12:00 of W33 -> Wednesday 12:00 of W32, counted from W32's Monday.
      const { asOf, windowStart } = getSevenDayBaseline('2026-W33', d('2026-08-12T12:00:00.000Z'));
      expect(asOf).toEqual(d('2026-08-05T12:00:00.000Z'));
      expect(windowStart).toEqual(d('2026-08-03T00:00:00.000Z'));
    });

    it("a week that has ENDED: the previous week's final board (its last millisecond)", () => {
      // W32 viewed long after it ended: reference = W32's last ms, seven days earlier = W31's last ms.
      const { asOf, windowStart } = getSevenDayBaseline('2026-W32', d('2026-09-30T00:00:00.000Z'));
      expect(asOf).toEqual(d('2026-08-02T23:59:59.999Z'));
      expect(windowStart).toEqual(d('2026-07-27T00:00:00.000Z'));
    });

    it('the instant the week starts: seven days earlier is the same instant a week before', () => {
      const { asOf, windowStart } = getSevenDayBaseline('2026-W33', d('2026-08-10T00:00:00.000Z'));
      expect(asOf).toEqual(d('2026-08-03T00:00:00.000Z'));
      expect(windowStart).toEqual(d('2026-08-03T00:00:00.000Z'));
    });

    it('crosses an ISO year boundary: 2009-W01 compares against 2008-W52', () => {
      // 2009-W01 = Mon 2008-12-29 .. Sun 2009-01-04 (2009-01-01 is a Thursday), so 2008-W52 starts
      // Mon 2008-12-22.
      const { asOf, windowStart } = getSevenDayBaseline('2009-W01', d('2009-01-01T12:00:00.000Z'));
      expect(asOf).toEqual(d('2008-12-25T12:00:00.000Z'));
      expect(windowStart).toEqual(d('2008-12-22T00:00:00.000Z'));
    });

    it('a settled week does not drift with the clock: the same answer for any `now` after it ended', () => {
      const early = getSevenDayBaseline('2026-W32', d('2026-08-20T00:00:00.000Z'));
      const late = getSevenDayBaseline('2026-W32', d('2027-03-01T00:00:00.000Z'));
      expect(early).toEqual(late);
    });
  });

  describe('computeRankChange7d', () => {
    it('is rank now minus rank then: negative moved up, positive moved down, zero no movement', () => {
      expect(computeRankChange7d(2, 5)).toBe(-3);
      expect(computeRankChange7d(4, 3)).toBe(1);
      expect(computeRankChange7d(6, 6)).toBe(0);
    });

    it('is null when either side is unknown, never 0', () => {
      expect(computeRankChange7d(2, null)).toBeNull();
      expect(computeRankChange7d(null, 2)).toBeNull();
      expect(computeRankChange7d(null, null)).toBeNull();
      // A row the history pass has not touched yet has no value at all (undefined in a mock, NULL in Postgres).
      expect(computeRankChange7d(2, undefined)).toBeNull();
    });
  });
});
