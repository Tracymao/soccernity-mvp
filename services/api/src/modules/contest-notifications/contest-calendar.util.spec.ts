import {
  buildContestMonthCalendar,
  londonMonthOf,
  londonParts,
  londonWallTimeToUtc,
} from './contest-calendar.util';

const iso = (d: Date) => d.toISOString();

// Expected values are derived by hand from the UK clock rules, not by running the implementation:
// BST (UTC+1) runs from 01:00 UTC on the last Sunday of March to 01:00 UTC on the last Sunday of
// October; GMT (UTC+0) otherwise. 2026: BST from Sun 29 Mar, ends Sun 25 Oct. 2029: BST from
// Sun 25 Mar (1 Jan 2029 is a Monday, so the Sundays of March are 4, 11, 18, 25).
describe('londonWallTimeToUtc', () => {
  it('subtracts the BST hour in summer and nothing in winter', () => {
    expect(iso(londonWallTimeToUtc(2026, 7, 1, 8))).toBe('2026-07-01T07:00:00.000Z');
    expect(iso(londonWallTimeToUtc(2026, 1, 1, 8))).toBe('2026-01-01T08:00:00.000Z');
  });

  it('is right on both sides of the spring-forward day (29 Mar 2026)', () => {
    expect(iso(londonWallTimeToUtc(2026, 3, 28, 20))).toBe('2026-03-28T20:00:00.000Z'); // still GMT
    expect(iso(londonWallTimeToUtc(2026, 3, 29, 20))).toBe('2026-03-29T19:00:00.000Z'); // now BST
  });

  it('is right on both sides of the fall-back day (25 Oct 2026)', () => {
    expect(iso(londonWallTimeToUtc(2026, 10, 24, 20))).toBe('2026-10-24T19:00:00.000Z'); // BST
    expect(iso(londonWallTimeToUtc(2026, 10, 25, 20))).toBe('2026-10-25T20:00:00.000Z'); // GMT
  });

  it('puts midnight on the fall-back day at 23:00 UTC the evening before (the day is 25 hours long)', () => {
    expect(iso(londonWallTimeToUtc(2026, 10, 25, 0))).toBe('2026-10-24T23:00:00.000Z');
    // ...and midnight the next day is 25 real hours later.
    const gap = londonWallTimeToUtc(2026, 10, 26, 0).getTime() - londonWallTimeToUtc(2026, 10, 25, 0).getTime();
    expect(gap).toBe(25 * 60 * 60 * 1000);
  });

  it('puts midnight on the spring-forward day at 00:00 UTC (the day is 23 hours long)', () => {
    expect(iso(londonWallTimeToUtc(2029, 3, 25, 0))).toBe('2029-03-25T00:00:00.000Z');
    const gap = londonWallTimeToUtc(2029, 3, 26, 0).getTime() - londonWallTimeToUtc(2029, 3, 25, 0).getTime();
    expect(gap).toBe(23 * 60 * 60 * 1000);
  });

  it('round-trips every contest wall-clock time on every day of 2026-2029', () => {
    const times: [number, number, number][] = [
      [0, 0, 0],
      [8, 0, 0],
      [12, 0, 0],
      [19, 0, 0],
      [20, 0, 0],
      [23, 59, 59],
    ];
    for (let year = 2026; year <= 2029; year++) {
      for (let month = 1; month <= 12; month++) {
        const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
        for (let day = 1; day <= days; day++) {
          for (const [h, m, s] of times) {
            const p = londonParts(londonWallTimeToUtc(year, month, day, h, m, s));
            expect([p.year, p.month, p.day, p.hour, p.minute, p.second]).toEqual([year, month, day, h, m, s]);
          }
        }
      }
    }
  });
});

describe('londonMonthOf', () => {
  it('uses the London calendar, not UTC, at a month boundary', () => {
    // 23:30 UTC on 30 Sep 2026 is 00:30 BST on 1 Oct: already October in London.
    expect(londonMonthOf(new Date('2026-09-30T23:30:00Z'))).toEqual({ year: 2026, month: 10 });
    // 23:30 UTC on 31 Oct 2026 is 23:30 GMT: still October.
    expect(londonMonthOf(new Date('2026-10-31T23:30:00Z'))).toEqual({ year: 2026, month: 10 });
    expect(londonMonthOf(new Date('2026-03-31T23:30:00Z'))).toEqual({ year: 2026, month: 4 });
  });
});

describe('buildContestMonthCalendar', () => {
  it('builds October 2026 (BST, with the clocks changing on day 25)', () => {
    const c = buildContestMonthCalendar(2026, 10);
    expect(c.weekOpensAt.map(iso)).toEqual([
      '2026-10-01T07:00:00.000Z',
      '2026-10-08T07:00:00.000Z',
      '2026-10-15T07:00:00.000Z',
      '2026-10-22T07:00:00.000Z',
    ]);
    expect(c.votesClosingReminderAt.map(iso)).toEqual([
      '2026-10-07T18:00:00.000Z',
      '2026-10-14T18:00:00.000Z',
      '2026-10-21T18:00:00.000Z',
    ]);
    expect(c.votesLockAt.map(iso)).toEqual([
      '2026-10-07T19:00:00.000Z',
      '2026-10-14T19:00:00.000Z',
      '2026-10-21T19:00:00.000Z',
    ]);
    expect(iso(c.uploadReminderAt)).toBe('2026-10-24T11:00:00.000Z');
    expect(iso(c.uploadDeadlineAt)).toBe('2026-10-24T22:59:59.000Z');
    // Day 25 is the clock-change day: 00:00 is still BST, so it is 23:00 UTC on the 24th.
    expect(iso(c.revealAt)).toBe('2026-10-24T23:00:00.000Z');
    // The month ends at 00:00 on 1 November, by then GMT.
    expect(iso(c.monthEndAt)).toBe('2026-11-01T00:00:00.000Z');
  });

  it('builds November 2026 (GMT throughout)', () => {
    const c = buildContestMonthCalendar(2026, 11);
    expect(iso(c.weekOpensAt[0])).toBe('2026-11-01T08:00:00.000Z');
    expect(iso(c.votesLockAt[2])).toBe('2026-11-21T20:00:00.000Z');
    expect(iso(c.revealAt)).toBe('2026-11-25T00:00:00.000Z');
    expect(iso(c.monthEndAt)).toBe('2026-12-01T00:00:00.000Z');
  });

  it('builds March 2029, where the clocks go forward on day 25 itself', () => {
    const c = buildContestMonthCalendar(2029, 3);
    expect(iso(c.weekOpensAt[0])).toBe('2029-03-01T08:00:00.000Z'); // GMT
    expect(iso(c.uploadDeadlineAt)).toBe('2029-03-24T23:59:59.000Z'); // GMT, the day before
    expect(iso(c.revealAt)).toBe('2029-03-25T00:00:00.000Z'); // 00:00 GMT; the change is at 01:00
    expect(iso(c.monthEndAt)).toBe('2029-03-31T23:00:00.000Z'); // 00:00 BST on 1 April
  });

  it('builds March 2026, where the clocks change after the contest days (29 Mar)', () => {
    const c = buildContestMonthCalendar(2026, 3);
    expect(iso(c.revealAt)).toBe('2026-03-25T00:00:00.000Z');
    expect(iso(c.monthEndAt)).toBe('2026-03-31T23:00:00.000Z');
  });

  it('builds February (28 days) and rolls the year at December', () => {
    expect(iso(buildContestMonthCalendar(2027, 2).revealAt)).toBe('2027-02-25T00:00:00.000Z');
    expect(iso(buildContestMonthCalendar(2027, 2).monthEndAt)).toBe('2027-03-01T00:00:00.000Z');
    expect(iso(buildContestMonthCalendar(2026, 12).monthEndAt)).toBe('2027-01-01T00:00:00.000Z');
  });

  it('puts the reminder 1 hour before each 20:00 lock and the next opening 12 hours after it (spec section 5)', () => {
    const c = buildContestMonthCalendar(2026, 11);
    for (let i = 0; i < 3; i++) {
      expect(c.weekOpensAt[i + 1].getTime() - c.votesLockAt[i].getTime()).toBe(12 * 60 * 60 * 1000);
      expect(c.votesLockAt[i].getTime() - c.votesClosingReminderAt[i].getTime()).toBe(60 * 60 * 1000);
    }
  });
});
