import {
  contestDedupeKey,
  planContestNotifications,
  PlannedNotification,
  PlannerCycle,
  PlannerRound,
} from './contest-notification-plan';

// Times below are hand-derived: November 2026 is GMT (UTC+0) throughout, so wall time = UTC;
// October 2026 is BST (UTC+1) until the clocks go back on day 25.
const at = (s: string) => new Date(s);

function round(week: number, over: Partial<PlannerRound> = {}): PlannerRound {
  return {
    id: `round-${week}`,
    weekNumber: week,
    status: 'open',
    judgedAt: null,
    winnerUserIds: [],
    ...over,
  };
}

function cycle(over: Partial<PlannerCycle> = {}): PlannerCycle {
  return {
    id: 'cycle-1',
    startsAt: at('2026-11-01T08:00:00Z'),
    status: 'active',
    crownedAt: null,
    rounds: [round(1), round(2), round(3)],
    ...over,
  };
}

// All three weeks judged, with a distinct winner trio per week -> 9 finalists.
function judgedCycle(over: Partial<PlannerCycle> = {}): PlannerCycle {
  return cycle({
    rounds: [
      round(1, { status: 'judged', judgedAt: at('2026-11-07T20:00:00Z'), winnerUserIds: ['u1', 'u2', 'u3'] }),
      round(2, { status: 'judged', judgedAt: at('2026-11-14T20:00:00Z'), winnerUserIds: ['u4', 'u5', 'u6'] }),
      round(3, { status: 'judged', judgedAt: at('2026-11-21T20:00:00Z'), winnerUserIds: ['u7', 'u8', 'u9'] }),
    ],
    ...over,
  });
}

const plan = (cycles: PlannerCycle[], now: string): PlannedNotification[] =>
  planContestNotifications(cycles, at(now));
const types = (p: PlannedNotification[]) => p.map((x) => `${x.type}${x.week ? `:${x.week}` : ''}`).sort();

describe('planContestNotifications', () => {
  describe('(a) week opens, 08:00 on days 1, 8, 15, 22', () => {
    it.each([
      ['week 1', '2026-11-01T08:00:00Z', 1],
      ['week 2', '2026-11-08T08:00:00Z', 2],
      ['week 3', '2026-11-15T08:00:00Z', 3],
    ])('fires for %s at exactly its opening and goes to everyone', (_n, now, week) => {
      const p = plan([cycle()], now).filter((x) => x.event === 'week_opens');
      expect(p).toHaveLength(1);
      expect(p[0]).toMatchObject({
        type: 'contest_week_opens',
        week,
        payloadRefId: `cycle-1:${week}`,
        audience: { kind: 'everyone' },
      });
    });

    it('does not fire a second before opening', () => {
      expect(plan([cycle()], '2026-11-01T07:59:59Z').filter((x) => x.event === 'week_opens')).toEqual([]);
    });

    it('stops being due 12 hours after opening (no stale "week 1 is open" days later)', () => {
      expect(plan([cycle()], '2026-11-01T19:59:59Z').filter((x) => x.event === 'week_opens')).toHaveLength(1);
      expect(plan([cycle()], '2026-11-01T20:00:00Z').filter((x) => x.event === 'week_opens')).toEqual([]);
    });

    it('opens week 4 at 08:00 on day 22, but only when finalists are known', () => {
      expect(types(plan([judgedCycle()], '2026-11-22T08:00:00Z').filter((x) => x.event === 'week_opens'))).toEqual([
        'contest_week_opens:4',
      ]);
      expect(plan([cycle()], '2026-11-22T08:00:00Z').filter((x) => x.event === 'week_opens')).toEqual([]);
    });

    it('is not sent for a completed cycle', () => {
      expect(plan([cycle({ status: 'completed' })], '2026-11-01T09:00:00Z')).toEqual([]);
    });
  });

  describe('(b) votes-closing reminder, 19:00 on days 7, 14, 21', () => {
    it.each([
      ['2026-11-07T19:00:00Z', 1],
      ['2026-11-14T19:00:00Z', 2],
      ['2026-11-21T19:00:00Z', 3],
    ])('fires at %s for week %i, addressed to accounts with no vote in that round', (now, week) => {
      const p = plan([cycle()], now).filter((x) => x.event === 'votes_closing');
      expect(p).toHaveLength(1);
      expect(p[0].audience).toEqual({ kind: 'not_voted', roundId: `round-${week}` });
      expect(p[0].payloadRefId).toBe(`cycle-1:${week}`);
    });

    it('is not due before 19:00 and expires at the 20:00 lock', () => {
      expect(plan([cycle()], '2026-11-07T18:59:59Z').filter((x) => x.event === 'votes_closing')).toEqual([]);
      expect(plan([cycle()], '2026-11-07T19:59:59Z').filter((x) => x.event === 'votes_closing')).toHaveLength(1);
      expect(plan([cycle()], '2026-11-07T20:00:00Z').filter((x) => x.event === 'votes_closing')).toEqual([]);
    });

    it('is moot once the round has been judged', () => {
      const judged = cycle({ rounds: [round(1, { status: 'judged', judgedAt: at('2026-11-07T18:00:00Z') }), round(2), round(3)] });
      expect(plan([judged], '2026-11-07T19:30:00Z').filter((x) => x.event === 'votes_closing')).toEqual([]);
    });
  });

  describe('(c) week result, at the 20:00 lock', () => {
    it('goes to everyone once a week with winners is judged', () => {
      const p = plan([judgedCycle()], '2026-11-07T20:00:00Z').filter((x) => x.event === 'week_result');
      expect(p).toHaveLength(1);
      expect(p[0]).toMatchObject({
        type: 'contest_week_result',
        week: 1,
        payloadRefId: 'cycle-1:1',
        audience: { kind: 'everyone' },
      });
    });

    it('waits for the judging when the admin judges after the lock', () => {
      const late = cycle({
        rounds: [round(1, { status: 'judged', judgedAt: at('2026-11-08T10:00:00Z'), winnerUserIds: ['u1'] }), round(2), round(3)],
      });
      expect(plan([late], '2026-11-07T20:30:00Z').filter((x) => x.event === 'week_result')).toEqual([]);
      expect(plan([late], '2026-11-08T10:00:00Z').filter((x) => x.event === 'week_result')).toHaveLength(1);
      // The 24-hour window is counted from the judging, not the lock.
      expect(plan([late], '2026-11-09T09:59:59Z').filter((x) => x.event === 'week_result')).toHaveLength(1);
      expect(plan([late], '2026-11-09T10:00:00Z').filter((x) => x.event === 'week_result')).toEqual([]);
    });

    it('sends nothing for a forfeited week (judged, no winners)', () => {
      const forfeited = cycle({
        rounds: [round(1, { status: 'judged', judgedAt: at('2026-11-07T20:00:00Z'), winnerUserIds: [] }), round(2), round(3)],
      });
      expect(plan([forfeited], '2026-11-07T20:05:00Z').filter((x) => x.event === 'week_result')).toEqual([]);
    });

    it('sends nothing for a week that is not judged', () => {
      expect(plan([cycle()], '2026-11-07T20:05:00Z').filter((x) => x.event === 'week_result')).toEqual([]);
    });
  });

  describe('(d) finalist qualification', () => {
    it('goes to each distinct finalist at the week-3 result', () => {
      const p = plan([judgedCycle()], '2026-11-21T20:00:00Z').filter((x) => x.event === 'finalist');
      expect(p).toHaveLength(1);
      expect(p[0].type).toBe('contest_finalist');
      expect(p[0].payloadRefId).toBe('cycle-1');
      expect(p[0].audience).toEqual({ kind: 'users', userIds: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9'] });
    });

    it('lists a user who won two weeks once', () => {
      const c = judgedCycle();
      c.rounds[1].winnerUserIds = ['u1', 'u5', 'u6'];
      const p = plan([c], '2026-11-21T20:00:00Z').filter((x) => x.event === 'finalist');
      expect(p[0].audience).toMatchObject({ userIds: ['u1', 'u2', 'u3', 'u5', 'u6', 'u7', 'u8', 'u9'] });
    });

    it('does not fire before week 3 is judged, or when there are no weekly winners', () => {
      expect(plan([cycle()], '2026-11-21T20:05:00Z').filter((x) => x.event === 'finalist')).toEqual([]);
      const none = cycle({
        rounds: [round(1, { status: 'judged' }), round(2, { status: 'judged' }), round(3, { status: 'judged', judgedAt: at('2026-11-21T20:00:00Z') })],
      });
      expect(plan([none], '2026-11-21T20:05:00Z').filter((x) => x.event === 'finalist')).toEqual([]);
    });
  });

  describe('(e) reveal, 00:00 on day 25', () => {
    it('goes to everyone at 00:00 on day 25', () => {
      expect(plan([judgedCycle()], '2026-11-24T23:59:59Z').filter((x) => x.event === 'reveal')).toEqual([]);
      const p = plan([judgedCycle()], '2026-11-25T00:00:00Z').filter((x) => x.event === 'reveal');
      expect(p).toHaveLength(1);
      expect(p[0]).toMatchObject({ type: 'contest_reveal', payloadRefId: 'cycle-1', audience: { kind: 'everyone' } });
    });

    it('is not sent when there is no final (no finalists)', () => {
      expect(plan([cycle()], '2026-11-25T00:30:00Z').filter((x) => x.event === 'reveal')).toEqual([]);
    });
  });

  describe('(f) final result', () => {
    const crowned = (crownedAt: string) =>
      judgedCycle({ status: 'completed', crownedAt: at(crownedAt) });

    it('is sent at the end of the contest month when crowned earlier', () => {
      expect(plan([crowned('2026-11-27T12:00:00Z')], '2026-11-30T23:59:59Z').filter((x) => x.event === 'final_result')).toEqual([]);
      const p = plan([crowned('2026-11-27T12:00:00Z')], '2026-12-01T00:00:00Z').filter((x) => x.event === 'final_result');
      expect(p).toHaveLength(1);
      expect(p[0]).toMatchObject({ type: 'contest_final_result', payloadRefId: 'cycle-1', audience: { kind: 'everyone' } });
    });

    it('is sent at the crowning when that is after the month end', () => {
      expect(plan([crowned('2026-12-02T09:00:00Z')], '2026-12-01T12:00:00Z').filter((x) => x.event === 'final_result')).toEqual([]);
      expect(plan([crowned('2026-12-02T09:00:00Z')], '2026-12-02T09:00:00Z').filter((x) => x.event === 'final_result')).toHaveLength(1);
    });

    it('is not sent for a cycle that is not completed', () => {
      expect(plan([judgedCycle({ status: 'final' })], '2026-12-01T00:30:00Z').filter((x) => x.event === 'final_result')).toEqual([]);
    });

    it('stops reminding or revealing once a cycle is completed', () => {
      const p = plan([crowned('2026-11-22T00:00:00Z')], '2026-11-25T00:10:00Z');
      expect(p.filter((x) => x.event === 'reveal' || x.event === 'upload_reminder' || x.event === 'votes_closing')).toEqual([]);
    });
  });

  describe('(h) finalist upload reminder, 12:00 on day 24', () => {
    it('goes to finalists who have not uploaded, from 12:00 until the 23:59:59 deadline', () => {
      expect(plan([judgedCycle()], '2026-11-24T11:59:59Z').filter((x) => x.event === 'upload_reminder')).toEqual([]);
      const p = plan([judgedCycle()], '2026-11-24T12:00:00Z').filter((x) => x.event === 'upload_reminder');
      expect(p).toHaveLength(1);
      expect(p[0].audience).toMatchObject({ kind: 'users_without_final_entry', cycleId: 'cycle-1' });
      expect(p[0].payloadRefId).toBe('cycle-1');
      expect(plan([judgedCycle()], '2026-11-24T23:59:58Z').filter((x) => x.event === 'upload_reminder')).toHaveLength(1);
      expect(plan([judgedCycle()], '2026-11-24T23:59:59Z').filter((x) => x.event === 'upload_reminder')).toEqual([]);
    });
  });

  describe('daylight saving (the calendar is Europe/London, not UTC)', () => {
    // October 2026: BST until 02:00 BST on Sun 25 Oct, when the clocks go back.
    const oct = (over: Partial<PlannerCycle> = {}) =>
      judgedCycle({
        startsAt: at('2026-10-01T07:00:00Z'),
        rounds: [
          round(1, { status: 'judged', judgedAt: at('2026-10-07T19:00:00Z'), winnerUserIds: ['u1'] }),
          round(2, { status: 'judged', judgedAt: at('2026-10-14T19:00:00Z'), winnerUserIds: ['u2'] }),
          round(3, { status: 'judged', judgedAt: at('2026-10-21T19:00:00Z'), winnerUserIds: ['u3'] }),
        ],
        ...over,
      });

    it('fires the votes-closing reminder at 19:00 BST = 18:00 UTC, not 19:00 UTC', () => {
      const open = cycle({ startsAt: at('2026-10-01T07:00:00Z') });
      expect(plan([open], '2026-10-07T17:59:59Z').filter((x) => x.event === 'votes_closing')).toEqual([]);
      expect(plan([open], '2026-10-07T18:00:00Z').filter((x) => x.event === 'votes_closing')).toHaveLength(1);
    });

    it('fires the week-1 opening at 08:00 BST = 07:00 UTC', () => {
      const open = cycle({ startsAt: at('2026-10-01T07:00:00Z') });
      expect(plan([open], '2026-10-01T06:59:59Z')).toEqual([]);
      expect(plan([open], '2026-10-01T07:00:00Z').map((x) => x.event)).toEqual(['week_opens']);
    });

    it('reveals at 00:00 BST on the clock-change day, 23:00 UTC the evening before', () => {
      expect(plan([oct()], '2026-10-24T22:59:59Z').filter((x) => x.event === 'reveal')).toEqual([]);
      expect(plan([oct()], '2026-10-24T23:00:00Z').filter((x) => x.event === 'reveal')).toHaveLength(1);
    });

    it('sends the upload reminder at 12:00 BST = 11:00 UTC on day 24', () => {
      expect(plan([oct()], '2026-10-24T10:59:59Z').filter((x) => x.event === 'upload_reminder')).toEqual([]);
      expect(plan([oct()], '2026-10-24T11:00:00Z').filter((x) => x.event === 'upload_reminder')).toHaveLength(1);
    });

    it('sends the final result at 00:00 GMT on 1 November, after the clocks went back', () => {
      const crowned = oct({ status: 'completed', crownedAt: at('2026-10-27T12:00:00Z') });
      expect(plan([crowned], '2026-10-31T23:59:59Z').filter((x) => x.event === 'final_result')).toEqual([]);
      expect(plan([crowned], '2026-11-01T00:00:00Z').filter((x) => x.event === 'final_result')).toHaveLength(1);
    });

    it('reveals at 00:00 GMT when the clocks go FORWARD later that same day (March 2029)', () => {
      const mar = judgedCycle({
        startsAt: at('2029-03-01T08:00:00Z'),
        rounds: [
          round(1, { status: 'judged', judgedAt: at('2029-03-07T20:00:00Z'), winnerUserIds: ['u1'] }),
          round(2, { status: 'judged', judgedAt: at('2029-03-14T20:00:00Z'), winnerUserIds: ['u2'] }),
          round(3, { status: 'judged', judgedAt: at('2029-03-21T20:00:00Z'), winnerUserIds: ['u3'] }),
        ],
      });
      expect(plan([mar], '2029-03-24T23:59:59Z').filter((x) => x.event === 'reveal')).toEqual([]);
      expect(plan([mar], '2029-03-25T00:00:00Z').filter((x) => x.event === 'reveal')).toHaveLength(1);
    });

    it('takes the month from the London date of startsAt (23:30 UTC on 30 Sep is already October)', () => {
      const c = cycle({ startsAt: at('2026-09-30T23:30:00Z') });
      // The October calendar: week 1 opens 07:00 UTC on 1 Oct.
      expect(plan([c], '2026-10-01T07:00:00Z').map((x) => x.event)).toEqual(['week_opens']);
    });
  });

  it('plans several cycles independently', () => {
    const a = cycle({ id: 'cycle-a', startsAt: at('2026-10-01T07:00:00Z') });
    const b = cycle({ id: 'cycle-b', startsAt: at('2026-11-01T08:00:00Z') });
    expect(plan([a, b], '2026-11-01T08:00:00Z').map((x) => x.cycleId)).toEqual(['cycle-b']);
  });
});

describe('contestDedupeKey', () => {
  it('is one key per type, cycle, week and account', () => {
    expect(contestDedupeKey('contest_week_opens', 'c1', 2, 'u1')).toBe('contest_week_opens|c1|2|u1');
    expect(contestDedupeKey('contest_reveal', 'c1', null, 'u1')).toBe('contest_reveal|c1|-|u1');
    expect(contestDedupeKey('contest_week_opens', 'c1', 1, 'u1')).not.toBe(
      contestDedupeKey('contest_week_opens', 'c1', 2, 'u1'),
    );
  });
});
