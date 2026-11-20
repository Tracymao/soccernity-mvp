import { londonWallTimeToUtc } from '../contest-notifications/contest-calendar.util';
import {
  buildContestSchedule,
  buildContestScheduleForKey,
  deriveCalendarState,
  formatMonthKey,
  isWithinEntryWindow,
  isWithinFinalEngagementWindow,
  isWithinFinalUploadWindow,
  isWithinVotingWindow,
  monthKeyOf,
  parseMonthKey,
} from './contest-schedule.util';

const utc = (s: string) => new Date(s);

describe('month keys', () => {
  it('formats and parses YYYY-MM', () => {
    expect(formatMonthKey(2026, 3)).toBe('2026-03');
    expect(parseMonthKey('2026-10')).toEqual({ year: 2026, month: 10 });
  });

  it.each(['2026-13', '2026-00', '26-10', '2026-1', '2026/10', '', 'abcd-ef', '1999-12'])('rejects %p', (bad) => {
    expect(parseMonthKey(bad)).toBeNull();
    expect(buildContestScheduleForKey(bad)).toBeNull();
  });

  it('takes the month in London time, not UTC', () => {
    // 23:30Z on 30 Sep is 00:30 BST on 1 Oct: the contest month is October.
    expect(monthKeyOf(utc('2026-09-30T23:30:00Z'))).toBe('2026-10');
    expect(monthKeyOf(utc('2026-09-30T22:59:59Z'))).toBe('2026-09');
    // 23:00Z on 31 Oct is 23:00 GMT on 31 Oct (the clocks went back on the 25th).
    expect(monthKeyOf(utc('2026-10-31T23:59:59Z'))).toBe('2026-10');
    expect(monthKeyOf(utc('2026-11-01T00:00:00Z'))).toBe('2026-11');
  });
});

describe('buildContestSchedule: spec section 5 as exact instants', () => {
  describe('a month wholly in BST (June 2026): London = UTC+1', () => {
    const s = buildContestSchedule(2026, 6);

    it('weeks 1-3 open 08:00 on days 1, 8, 15', () => {
      expect(s.weeks.map((w) => w.opensAt.toISOString())).toEqual([
        '2026-06-01T07:00:00.000Z',
        '2026-06-08T07:00:00.000Z',
        '2026-06-15T07:00:00.000Z',
      ]);
    });

    it('Phase 1 ends at 00:00 on days 5, 12, 19 (the end of days 4, 11, 18)', () => {
      expect(s.weeks.map((w) => w.phase1EndsAt.toISOString())).toEqual([
        '2026-06-04T23:00:00.000Z',
        '2026-06-11T23:00:00.000Z',
        '2026-06-18T23:00:00.000Z',
      ]);
    });

    it('votes lock at 20:00 on days 7, 14, 21', () => {
      expect(s.weeks.map((w) => w.votesLockAt.toISOString())).toEqual([
        '2026-06-07T19:00:00.000Z',
        '2026-06-14T19:00:00.000Z',
        '2026-06-21T19:00:00.000Z',
      ]);
    });

    it('Between Weeks runs from each lock to the next opening: 12 hours', () => {
      for (const w of s.weeks) {
        expect(w.nextOpensAt.getTime() - w.votesLockAt.getTime()).toBe(12 * 60 * 60 * 1000);
      }
      expect(s.weeks[2].nextOpensAt.getTime()).toBe(s.final.opensAt.getTime());
    });

    it('week 4 opens 08:00 on day 22, reveals 00:00 on day 25, ends 00:00 on the 1st', () => {
      expect(s.final.opensAt.toISOString()).toBe('2026-06-22T07:00:00.000Z');
      expect(s.final.uploadReminderAt.toISOString()).toBe('2026-06-24T11:00:00.000Z');
      expect(s.final.revealAt.toISOString()).toBe('2026-06-24T23:00:00.000Z');
      expect(s.final.monthEndAt.toISOString()).toBe('2026-06-30T23:00:00.000Z');
    });
  });

  describe('October 2026: the clocks go back on Sunday 25 October (BST -> GMT at 02:00 BST)', () => {
    const s = buildContestSchedule(2026, 10);

    it('every week-1..3 instant is still in BST (the change comes after day 21)', () => {
      expect(s.weeks[0].opensAt.toISOString()).toBe('2026-10-01T07:00:00.000Z');
      expect(s.weeks[2].votesLockAt.toISOString()).toBe('2026-10-21T19:00:00.000Z');
      expect(s.final.opensAt.toISOString()).toBe('2026-10-22T07:00:00.000Z');
    });

    it('the upload deadline (23:59:59 on day 24) and the reveal (00:00 on day 25) are both still BST', () => {
      expect(s.final.revealAt.toISOString()).toBe('2026-10-24T23:00:00.000Z');
      // The window runs to the reveal, exclusive: 23:59:59 BST is in time, 00:00:00 is not.
      expect(isWithinFinalUploadWindow(s.final, utc('2026-10-24T22:59:59Z'))).toBe(true);
      expect(isWithinFinalUploadWindow(s.final, utc('2026-10-24T22:59:59.999Z'))).toBe(true);
      expect(isWithinFinalUploadWindow(s.final, utc('2026-10-24T23:00:00Z'))).toBe(false);
    });

    it('the month ends at 00:00 GMT on 1 November, one hour later than a BST midnight would be', () => {
      expect(s.final.monthEndAt.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    });

    it('day 25 is a 25-hour day: the reveal is the BST midnight and the engagement window is 6 days + 25 hours + ... to the GMT month end', () => {
      // 25 Oct 00:00 BST to 26 Oct 00:00 GMT is 25 hours (the clocks go back during day 25).
      const day26 = londonWallTimeToUtc(2026, 10, 26, 0);
      expect(day26.getTime() - s.final.revealAt.getTime()).toBe(25 * 60 * 60 * 1000);
      // 25 Oct 00:00 BST to 1 Nov 00:00 GMT = 7 days + 1 extra hour in total.
      expect(s.final.monthEndAt.getTime() - s.final.revealAt.getTime()).toBe((7 * 24 + 1) * 60 * 60 * 1000);
    });
  });

  describe('March 2026: the clocks go forward on Sunday 29 March (GMT -> BST at 01:00 UTC)', () => {
    const s = buildContestSchedule(2026, 3);

    it('days 1-25 are GMT: the instants equal the wall-clock times', () => {
      expect(s.weeks[0].opensAt.toISOString()).toBe('2026-03-01T08:00:00.000Z');
      expect(s.weeks[2].votesLockAt.toISOString()).toBe('2026-03-21T20:00:00.000Z');
      expect(s.final.revealAt.toISOString()).toBe('2026-03-25T00:00:00.000Z');
    });

    it('the month ends at 00:00 BST on 1 April = 23:00Z on 31 March', () => {
      expect(s.final.monthEndAt.toISOString()).toBe('2026-03-31T23:00:00.000Z');
    });
  });

  describe('a 28-day February (2027) and a 31-day month', () => {
    it('February 2027: the engagement window is days 25-28 (4 days)', () => {
      const s = buildContestSchedule(2027, 2);
      expect(s.final.revealAt.toISOString()).toBe('2027-02-25T00:00:00.000Z');
      expect(s.final.monthEndAt.toISOString()).toBe('2027-03-01T00:00:00.000Z');
      expect(s.final.monthEndAt.getTime() - s.final.revealAt.getTime()).toBe(4 * 24 * 60 * 60 * 1000);
    });

    it('a 31-day month (January 2027): days 25-31 (7 days)', () => {
      const s = buildContestSchedule(2027, 1);
      expect(s.final.monthEndAt.getTime() - s.final.revealAt.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('December rolls the year: month end is 1 January', () => {
      expect(buildContestSchedule(2026, 12).final.monthEndAt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    });
  });
});

describe('the windows are exclusive at their end, to the millisecond', () => {
  const s = buildContestSchedule(2026, 6);
  const w1 = s.weeks[0];

  it('entry window: open at 08:00:00.000, closed at 00:00:00.000 on day 5', () => {
    expect(isWithinEntryWindow(w1, new Date(w1.opensAt.getTime() - 1))).toBe(false);
    expect(isWithinEntryWindow(w1, w1.opensAt)).toBe(true);
    expect(isWithinEntryWindow(w1, new Date(w1.phase1EndsAt.getTime() - 1))).toBe(true);
    expect(isWithinEntryWindow(w1, w1.phase1EndsAt)).toBe(false);
  });

  it('voting window: not open during Phase 1, open from 00:00 on day 5, closed at 20:00:00.000 on day 7', () => {
    expect(isWithinVotingWindow(w1, new Date(w1.phase1EndsAt.getTime() - 1))).toBe(false);
    expect(isWithinVotingWindow(w1, w1.phase1EndsAt)).toBe(true);
    expect(isWithinVotingWindow(w1, new Date(w1.votesLockAt.getTime() - 1))).toBe(true);
    expect(isWithinVotingWindow(w1, w1.votesLockAt)).toBe(false);
  });

  it('no vote or entry is possible between the lock and the next opening (Between Weeks)', () => {
    const between = new Date(w1.votesLockAt.getTime() + 60 * 1000);
    expect(isWithinEntryWindow(w1, between)).toBe(false);
    expect(isWithinVotingWindow(w1, between)).toBe(false);
    expect(isWithinEntryWindow(s.weeks[1], between)).toBe(false);
  });

  it('final engagement window: closed before the reveal, open from 00:00 on day 25, closed at month end', () => {
    expect(isWithinFinalEngagementWindow(s.final, new Date(s.final.revealAt.getTime() - 1))).toBe(false);
    expect(isWithinFinalEngagementWindow(s.final, s.final.revealAt)).toBe(true);
    expect(isWithinFinalEngagementWindow(s.final, new Date(s.final.monthEndAt.getTime() - 1))).toBe(true);
    expect(isWithinFinalEngagementWindow(s.final, s.final.monthEndAt)).toBe(false);
  });
});

describe('deriveCalendarState', () => {
  const s = buildContestSchedule(2026, 6);
  const none: { weekNumber: number; forfeited: boolean }[] = [];
  const at = (iso: string) => new Date(iso);

  it('before week 1 opens, including 00:00-08:00 on day 1, the state is upcoming ("Week 1 opens at 08:00")', () => {
    // 00:00 BST on 1 June = 23:00Z on 31 May.
    expect(deriveCalendarState(s, none, 0, at('2026-05-31T23:00:00Z'))).toEqual({
      kind: 'upcoming',
      opensAt: s.weeks[0].opensAt,
    });
    expect(deriveCalendarState(s, none, 0, at('2026-06-01T06:59:59.999Z')).kind).toBe('upcoming');
    expect(deriveCalendarState(s, none, 0, at('2026-06-01T07:00:00Z')).kind).toBe('week_entries');
  });

  it('week 1: entries until the end of day 4, then voting until the 20:00 lock, then Between Weeks until 08:00 on day 8', () => {
    expect(deriveCalendarState(s, none, 0, at('2026-06-04T22:59:59.999Z'))).toMatchObject({
      kind: 'week_entries',
      weekNumber: 1,
    });
    expect(deriveCalendarState(s, none, 0, at('2026-06-04T23:00:00Z'))).toMatchObject({
      kind: 'week_voting',
      weekNumber: 1,
    });
    expect(deriveCalendarState(s, none, 0, at('2026-06-07T18:59:59.999Z'))).toMatchObject({ kind: 'week_voting' });
    expect(deriveCalendarState(s, none, 0, at('2026-06-07T19:00:00Z'))).toMatchObject({
      kind: 'between_weeks',
      afterWeek: 1,
      nextWeek: 2,
      result: 'winners',
    });
    expect(deriveCalendarState(s, none, 0, at('2026-06-08T06:59:59.999Z')).kind).toBe('between_weeks');
    expect(deriveCalendarState(s, none, 0, at('2026-06-08T07:00:00Z'))).toMatchObject({
      kind: 'week_entries',
      weekNumber: 2,
    });
  });

  it('a forfeited week shows week_forfeited instead of voting, and its Between Weeks says forfeited', () => {
    const rounds = [{ weekNumber: 2, forfeited: true }];
    expect(deriveCalendarState(s, rounds, 0, at('2026-06-12T00:00:00Z'))).toMatchObject({
      kind: 'week_forfeited',
      weekNumber: 2,
    });
    expect(deriveCalendarState(s, rounds, 0, at('2026-06-14T19:00:00Z'))).toMatchObject({
      kind: 'between_weeks',
      afterWeek: 2,
      nextWeek: 3,
      result: 'forfeited',
    });
  });

  it('after week 3 the next opening is week 4 (day 22, 08:00)', () => {
    expect(deriveCalendarState(s, none, 3, at('2026-06-21T19:00:00Z'))).toMatchObject({
      kind: 'between_weeks',
      afterWeek: 3,
      nextWeek: 4,
      nextOpensAt: s.final.opensAt,
    });
  });

  it('week 4 with finalists: upload from 08:00 day 22 to the reveal, then live to month end, then completed', () => {
    expect(deriveCalendarState(s, none, 4, at('2026-06-22T07:00:00Z')).kind).toBe('final_upload');
    expect(deriveCalendarState(s, none, 4, at('2026-06-24T22:59:59.999Z')).kind).toBe('final_upload');
    expect(deriveCalendarState(s, none, 4, at('2026-06-24T23:00:00Z'))).toMatchObject({ kind: 'final_live' });
    expect(deriveCalendarState(s, none, 4, at('2026-06-30T22:59:59.999Z')).kind).toBe('final_live');
    expect(deriveCalendarState(s, none, 4, at('2026-06-30T23:00:00Z')).kind).toBe('completed');
  });

  it('week 4 only exists when finalists are known: with none, the state is no_final all the way to month end', () => {
    expect(deriveCalendarState(s, none, 0, at('2026-06-22T07:00:00Z')).kind).toBe('no_final');
    expect(deriveCalendarState(s, none, 0, at('2026-06-24T23:00:00Z')).kind).toBe('no_final');
    expect(deriveCalendarState(s, none, 0, at('2026-06-30T22:59:59Z')).kind).toBe('no_final');
    expect(deriveCalendarState(s, none, 0, at('2026-06-30T23:00:00Z')).kind).toBe('completed');
  });

  it('is correct across the October 2026 clock change: the reveal is the BST midnight', () => {
    const oct = buildContestSchedule(2026, 10);
    expect(deriveCalendarState(oct, none, 2, at('2026-10-24T22:59:59Z')).kind).toBe('final_upload');
    expect(deriveCalendarState(oct, none, 2, at('2026-10-24T23:00:00Z')).kind).toBe('final_live');
    // The month ends at the GMT midnight.
    expect(deriveCalendarState(oct, none, 2, at('2026-10-31T23:59:59Z')).kind).toBe('final_live');
    expect(deriveCalendarState(oct, none, 2, at('2026-11-01T00:00:00Z')).kind).toBe('completed');
  });
});
