// backend/w3c-contest-notifications (B-122, Decision Log #404 item 16).
//
// The Contest month calendar of docs/contest-spec.md section 5, as pure date arithmetic. Every
// boundary is a WALL-CLOCK time in Europe/London converted to a UTC instant, so the BST/GMT
// change is handled by the zone database (Intl), never by adding 24-hour multiples. No
// dependency: this repo has no date library, and Intl ships with Node.
//
// This file only COMPUTES the calendar. It changes nothing about how contests are run -- the
// contest module still drives rounds from admin-set windows until B-091 rebuilds it; the
// notification sweep reads this calendar for the events that are defined by the clock.

export const CONTEST_TIME_ZONE = 'Europe/London';

const londonFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: CONTEST_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export interface WallClockParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** The Europe/London wall-clock reading of a UTC instant. */
export function londonParts(instant: Date): WallClockParts {
  const parts: Record<string, number> = {};
  for (const p of londonFormatter.formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

// London's UTC offset (ms) at a UTC instant: 0 in GMT, +1h in BST.
function londonOffsetMs(utcMs: number): number {
  const p = londonParts(new Date(utcMs));
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Truncate sub-second so a millisecond component cannot leak into the offset.
  return asIfUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * The UTC instant at which the Europe/London wall clock reads the given date and time.
 *
 * Two passes: the first guesses the offset at the naive instant, the second re-reads the offset
 * at the guessed result, which corrects a guess that landed on the wrong side of a clock change.
 * Every time the Contest uses (00:00, 08:00, 12:00, 19:00, 20:00, 23:59:59) exists exactly once on
 * every day of the year -- the changes happen at 01:00-02:00 UTC -- so no gap/overlap case arises.
 */
export function londonWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  const first = naive - londonOffsetMs(naive);
  const second_ = naive - londonOffsetMs(first);
  return new Date(second_);
}

/** The London calendar month an instant falls in. */
export function londonMonthOf(instant: Date): { year: number; month: number } {
  const { year, month } = londonParts(instant);
  return { year, month };
}

function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

export interface ContestMonthCalendar {
  year: number;
  month: number;
  /** Weeks 1-4 open at 08:00 on days 1, 8, 15, 22 (index 0 = week 1). */
  weekOpensAt: [Date, Date, Date, Date];
  /** 19:00 on days 7, 14, 21: the votes-closing reminder (index 0 = week 1). */
  votesClosingReminderAt: [Date, Date, Date];
  /** 20:00:00 on days 7, 14, 21: votes lock, the tally freezes (index 0 = week 1). */
  votesLockAt: [Date, Date, Date];
  /** 12:00 on day 24: the finalist upload reminder. */
  uploadReminderAt: Date;
  /** 23:59:59 on day 24: the finalist upload deadline. */
  uploadDeadlineAt: Date;
  /** 00:00 on day 25: the reveal. */
  revealAt: Date;
  /** 00:00 on the 1st of the following month: the end of the contest month. */
  monthEndAt: Date;
}

/** docs/contest-spec.md section 5 for one London calendar month. */
export function buildContestMonthCalendar(year: number, month: number): ContestMonthCalendar {
  const at = (day: number, hour: number, minute = 0, second = 0) =>
    londonWallTimeToUtc(year, month, day, hour, minute, second);
  const next = nextMonth(year, month);
  return {
    year,
    month,
    weekOpensAt: [at(1, 8), at(8, 8), at(15, 8), at(22, 8)],
    votesClosingReminderAt: [at(7, 19), at(14, 19), at(21, 19)],
    votesLockAt: [at(7, 20), at(14, 20), at(21, 20)],
    uploadReminderAt: at(24, 12),
    uploadDeadlineAt: at(24, 23, 59, 59),
    revealAt: at(25, 0),
    monthEndAt: londonWallTimeToUtc(next.year, next.month, 1, 0),
  };
}
