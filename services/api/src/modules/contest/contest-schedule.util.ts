import {
  buildContestMonthCalendar,
  londonMonthOf,
  londonWallTimeToUtc,
} from '../contest-notifications/contest-calendar.util';

// backend/w7-contest (B-091, Decision Log #381, #387, #399, #400, #404; docs/contest-spec.md
// sections 5-8, 10, 11). The Contest month as a set of exact UTC instants, plus the pure
// state-derivation the read model and the validation rules share.
//
// Pure: no database, no clock read. Every function takes `now` or an instant, so every window
// edge and every BST/GMT case is unit-testable. The Europe/London arithmetic itself lives in
// contest-notifications/contest-calendar.util.ts (Intl, no dependency) and is reused as-is;
// this file only adds what that file does not have: the end of Phase 1 (00:00 on days 5, 12, 19).
//
// All "end" instants are EXCLUSIVE: an action at exactly that instant is already too late. So an
// entry made at 23:59:59.999 on day 4 is in time and one at 00:00:00.000 on day 5 is not; a vote at
// 19:59:59.999 on day 7 counts and one at 20:00:00.000 does not (the tally freezes at 20:00:00).

export const CONTEST_WEEKLY_ROUND_COUNT = 3;
export const FINAL_WEEK_NUMBER = 4;

export interface ContestWeekWindow {
  weekNumber: 1 | 2 | 3;
  /** 08:00:00 on days 1, 8, 15. Entries are accepted from here. */
  opensAt: Date;
  /** 00:00:00 on days 5, 12, 19 (= the end of days 4, 11, 18). Entries stop; Phase 1 ranking is taken; Phase 2 voting starts. */
  phase1EndsAt: Date;
  /** 20:00:00 on days 7, 14, 21. Votes lock, the tally freezes and the weekly result is calculated. */
  votesLockAt: Date;
  /** 08:00:00 on the NEXT week's opening day (days 8, 15, 22): the end of Between Weeks. */
  nextOpensAt: Date;
}

export interface ContestFinalWindow {
  weekNumber: 4;
  /** 08:00:00 on day 22. The finalist upload window opens. */
  opensAt: Date;
  /** 12:00:00 on day 24: the upload reminder. */
  uploadReminderAt: Date;
  /** 00:00:00 on day 25: the reveal, and the (exclusive) end of the upload window. The deadline is 23:59:59 on day 24. */
  revealAt: Date;
  /** 00:00:00 on the 1st of the next month: the (exclusive) end of the engagement window, the crown, the pin removal. */
  monthEndAt: Date;
}

export interface ContestSchedule {
  year: number;
  month: number;
  monthKey: string;
  weeks: [ContestWeekWindow, ContestWeekWindow, ContestWeekWindow];
  final: ContestFinalWindow;
}

export function formatMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** "YYYY-MM" -> { year, month }, or null if it is not a valid month key. */
export function parseMonthKey(key: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2200) return null;
  return { year, month };
}

/** The "YYYY-MM" key of the London calendar month an instant falls in. */
export function monthKeyOf(instant: Date): string {
  const { year, month } = londonMonthOf(instant);
  return formatMonthKey(year, month);
}

export function buildContestSchedule(year: number, month: number): ContestSchedule {
  const cal = buildContestMonthCalendar(year, month);
  // Phase 1 ends at 00:00 on days 5, 12, 19: day 4 / 11 / 18 are complete days.
  const phase1EndDays = [5, 12, 19] as const;
  const week = (i: 0 | 1 | 2): ContestWeekWindow => ({
    weekNumber: (i + 1) as 1 | 2 | 3,
    opensAt: cal.weekOpensAt[i],
    phase1EndsAt: londonWallTimeToUtc(year, month, phase1EndDays[i], 0),
    votesLockAt: cal.votesLockAt[i],
    nextOpensAt: cal.weekOpensAt[i + 1],
  });
  return {
    year,
    month,
    monthKey: formatMonthKey(year, month),
    weeks: [week(0), week(1), week(2)],
    final: {
      weekNumber: 4,
      opensAt: cal.weekOpensAt[3],
      uploadReminderAt: cal.uploadReminderAt,
      revealAt: cal.revealAt,
      monthEndAt: cal.monthEndAt,
    },
  };
}

/** The schedule for a "YYYY-MM" key, or null if the key is malformed. */
export function buildContestScheduleForKey(monthKey: string): ContestSchedule | null {
  const parsed = parseMonthKey(monthKey);
  return parsed ? buildContestSchedule(parsed.year, parsed.month) : null;
}

// ---------------------------------------------------------------------------------------------
// Calendar state: the one value the Contest tab, the Create Post "Contest" tab and the Between
// Weeks screen branch on. Derived from the clock plus the two facts the clock cannot know: whether
// a week was forfeited and whether the month has any finalists.
// ---------------------------------------------------------------------------------------------

export type ContestCalendarState =
  /** Before week 1 opens, including 00:00-08:00 on day 1 ("Week 1 opens at 08:00", #404 item 13). */
  | { kind: 'upcoming'; opensAt: Date }
  /** Phase 1: entries are open (opening to the end of day 4/11/18). */
  | { kind: 'week_entries'; weekNumber: 1 | 2 | 3; entriesCloseAt: Date }
  /** Phase 2: the top 10 are being voted on (day 5-7, until the 20:00 lock). */
  | { kind: 'week_voting'; weekNumber: 1 | 2 | 3; locksAt: Date }
  /** A forfeited week, from the end of Phase 1 to the lock: there is nothing to vote on. */
  | { kind: 'week_forfeited'; weekNumber: 1 | 2 | 3; locksAt: Date }
  /** From the 20:00 lock to the next opening at 08:00. Shows the week's result and when the next week opens. */
  | {
      kind: 'between_weeks';
      afterWeek: 1 | 2 | 3;
      nextWeek: 2 | 3 | 4;
      nextOpensAt: Date;
      result: 'winners' | 'forfeited';
    }
  /** Days 22-24: finalists upload. Non-finalists see the closed state, not a hidden tab (#403 item 1). */
  | { kind: 'final_upload'; opensAt: Date; revealsAt: Date }
  /** 00:00 on day 25 to the end of the month: the reveal has happened, likes and comments count. */
  | { kind: 'final_live'; revealedAt: Date; endsAt: Date }
  /** Week 3 produced no winner at all: no finalist, so no final. The leaderboard says so (spec section 10). */
  | { kind: 'no_final' }
  /** The month is over. */
  | { kind: 'completed'; endedAt: Date };

export interface RoundFlags {
  weekNumber: number;
  forfeited: boolean;
}

export function deriveCalendarState(
  schedule: ContestSchedule,
  rounds: readonly RoundFlags[],
  finalistCount: number,
  now: Date,
): ContestCalendarState {
  const t = now.getTime();
  const forfeited = new Set(rounds.filter((r) => r.forfeited).map((r) => r.weekNumber));

  if (t >= schedule.final.monthEndAt.getTime()) {
    return { kind: 'completed', endedAt: schedule.final.monthEndAt };
  }
  if (t < schedule.weeks[0].opensAt.getTime()) {
    return { kind: 'upcoming', opensAt: schedule.weeks[0].opensAt };
  }

  for (const w of schedule.weeks) {
    if (t < w.phase1EndsAt.getTime()) {
      return { kind: 'week_entries', weekNumber: w.weekNumber, entriesCloseAt: w.phase1EndsAt };
    }
    if (t < w.votesLockAt.getTime()) {
      return forfeited.has(w.weekNumber)
        ? { kind: 'week_forfeited', weekNumber: w.weekNumber, locksAt: w.votesLockAt }
        : { kind: 'week_voting', weekNumber: w.weekNumber, locksAt: w.votesLockAt };
    }
    if (t < w.nextOpensAt.getTime()) {
      return {
        kind: 'between_weeks',
        afterWeek: w.weekNumber,
        nextWeek: (w.weekNumber + 1) as 2 | 3 | 4,
        nextOpensAt: w.nextOpensAt,
        result: forfeited.has(w.weekNumber) ? 'forfeited' : 'winners',
      };
    }
  }

  // Week 4. With no finalist there is no final (spec section 10: "none means no final").
  if (finalistCount === 0) {
    return { kind: 'no_final' };
  }
  if (t < schedule.final.revealAt.getTime()) {
    return { kind: 'final_upload', opensAt: schedule.final.opensAt, revealsAt: schedule.final.revealAt };
  }
  return { kind: 'final_live', revealedAt: schedule.final.revealAt, endsAt: schedule.final.monthEndAt };
}

// ---------------------------------------------------------------------------------------------
// Windows, as predicates. Each takes the instant and returns whether the action is in time.
// ---------------------------------------------------------------------------------------------

/** A weekly entry is accepted from the opening up to (excluding) the end of Phase 1. */
export function isWithinEntryWindow(week: ContestWeekWindow, now: Date): boolean {
  return now.getTime() >= week.opensAt.getTime() && now.getTime() < week.phase1EndsAt.getTime();
}

/** A vote is accepted from the end of Phase 1 up to (excluding) the 20:00 lock. */
export function isWithinVotingWindow(week: ContestWeekWindow, now: Date): boolean {
  return now.getTime() >= week.phase1EndsAt.getTime() && now.getTime() < week.votesLockAt.getTime();
}

/** A final entry is accepted from 08:00 on day 22 up to (excluding) 00:00 on day 25 (deadline 23:59:59 on day 24). */
export function isWithinFinalUploadWindow(final: ContestFinalWindow, now: Date): boolean {
  return now.getTime() >= final.opensAt.getTime() && now.getTime() < final.revealAt.getTime();
}

/** Likes and comments on a final entry count from the reveal up to (excluding) the end of the month. */
export function isWithinFinalEngagementWindow(final: ContestFinalWindow, now: Date): boolean {
  return now.getTime() >= final.revealAt.getTime() && now.getTime() < final.monthEndAt.getTime();
}
