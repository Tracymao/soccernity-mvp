import { ALL_TIME_PERIOD, SEVEN_DAYS_MS } from './leaderboard.constants';
import { getIsoWeekBoundaries, getIsoWeekPeriod } from './iso-week.util';

// backend/b053-leaderboard-periods (B-053, Decision Log #472). Pure date helpers for the two things the
// board learned in this change: an all-time period and the 7-day rank change. Everything is UTC
// millisecond arithmetic, like iso-week.util.ts.

export function isAllTimePeriod(period: string): boolean {
  return period === ALL_TIME_PERIOD;
}

// The ledger window a board covers: [start, end). A weekly board is its ISO week; the all-time board is
// everything (epoch to a far-future instant, so no ledger row can fall outside it).
const EPOCH = new Date(0);
const FAR_FUTURE = new Date(Date.UTC(9999, 11, 31));

export function getBoardWindow(period: string): { start: Date; end: Date } {
  if (isAllTimePeriod(period)) return { start: EPOCH, end: FAR_FUTURE };
  return getIsoWeekBoundaries(period);
}

// The moment "seven days earlier" refers to for a board, and the ledger window that board covered at that
// moment.
//
//  - All-time: the board as it stood at (now - 7 days), counting every ledger row from the start up to
//    then.
//  - A weekly board: the SAME board one week back. Take the reference instant R = the earlier of `now` and
//    the last millisecond of the week; the board seven days earlier is the week containing R - 7 days,
//    counted only up to that instant. For the current week that is last week's board at the same moment
//    (week to date against week to date); for a week that has ended it is the previous week's final board.
//    A week that has not started yet has no "then" worth reporting, so R is `now` and the result is simply
//    an earlier, empty board.
//
// A row counts "at" an instant only if it had been awarded by then and had not been revoked by then; the
// SQL applies that rule with `asOf`.
export function getSevenDayBaseline(period: string, now: Date): { asOf: Date; windowStart: Date } {
  if (isAllTimePeriod(period)) {
    return { asOf: new Date(now.getTime() - SEVEN_DAYS_MS), windowStart: EPOCH };
  }
  const { end } = getIsoWeekBoundaries(period);
  const reference = new Date(Math.min(now.getTime(), end.getTime() - 1));
  const asOf = new Date(reference.getTime() - SEVEN_DAYS_MS);
  const { start: windowStart } = getIsoWeekBoundaries(getIsoWeekPeriod(asOf));
  return { asOf, windowStart };
}

// Rank change over seven days: the rank now minus the rank on the same board seven days earlier, so a
// NEGATIVE number means the person moved UP. null when the person was not on the board then (or no
// baseline exists yet): never a made-up zero.
export function computeRankChange7d(
  rank: number | null | undefined,
  rankSevenDaysAgo: number | null | undefined,
): number | null {
  if (rank == null || rankSevenDaysAgo == null) return null;
  return rank - rankSevenDaysAgo;
}
