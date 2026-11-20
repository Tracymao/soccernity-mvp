import { BadRequestException } from '@nestjs/common';

// sprint-6/leaderboard-read-rollup — Build Plan Section 4.9. ISO-8601
// week-numbering date math, hand-rolled rather than pulled from a
// library: confirmed via `grep -n "date-fns\|dayjs\|luxon\|moment"
// package.json` that this repo has NO date library dependency anywhere,
// and contest.service.ts already sets the precedent of hand-rolling its
// own date arithmetic with plain Date/UTC methods (resolveRoundWindows).
// Adding a new dependency for one module's period math would be a bigger
// footprint than ~80 lines of well-tested, self-contained arithmetic.
//
// Every computation here is exclusively in UTC — Date.UTC / getUTC* /
// setUTC* — never local-time getters/setters. This mirrors
// account-deletion-sweep.service.ts's own documented lesson: that
// service's purgeExpiredConsentAuditRecords originally used setMonth
// (local time) and silently drifted its cutoff by an hour across a DST
// boundary; setUTCMonth fixed it. Mixing local-time and UTC date math in
// the same file is exactly the class of bug that produced that one, so
// this file never touches a non-UTC accessor at all.

const PERIOD_PATTERN = /^(\d{4})-W(\d{2})$/;

export interface IsoWeekParts {
  isoYear: number;
  week: number;
}

// True iff `isoYear` has a 53rd ISO week — the ISO-8601 rule: a year has
// 53 weeks iff 1 January falls on a Thursday, OR the year is a leap year
// and 1 January falls on a Wednesday (both cases put 4 January far enough
// into the year's first week that a 53rd week is needed to reach
// 31 December). Used to reject a period like "2025-W53", which does not
// exist (2025 has only 52 ISO weeks), rather than silently computing a
// Monday that actually falls in the following ISO year.
export function isoYearHasWeek53(isoYear: number): boolean {
  const jan1Weekday = new Date(Date.UTC(isoYear, 0, 1)).getUTCDay() || 7; // Mon=1..Sun=7
  const isLeapYear = (isoYear % 4 === 0 && isoYear % 100 !== 0) || isoYear % 400 === 0;
  return jan1Weekday === 4 || (isLeapYear && jan1Weekday === 3);
}

export function formatIsoWeekPeriod(isoYear: number, week: number): string {
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

// The ISO week period ("YYYY-Www") containing `date`. ISO-8601 defines a
// date's week (and, separately, its own ISO YEAR — which can differ from
// the calendar year) by the week containing that date's own Thursday:
// find the Thursday of the same Monday-Sunday week as `date`, then that
// Thursday's calendar year is the ISO year, and the week number counts
// Thursdays from 1 January of that ISO year.
//
// Classic example this implementation is verified against: 2008-12-29
// (a Monday) belongs to ISO week 2009-W01, because its Thursday
// (2009-01-01) falls in 2009 — a date can belong to the ISO year before
// or after its own calendar year.
export function getIsoWeekPeriod(date: Date): string {
  // Truncate to a UTC midnight first so time-of-day never affects the
  // day-of-week arithmetic below.
  const truncated = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const isoWeekday = truncated.getUTCDay() || 7; // Mon=1..Sun=7
  const thursday = new Date(truncated);
  thursday.setUTCDate(truncated.getUTCDate() + (4 - isoWeekday));

  const isoYear = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const daysSinceYearStart = Math.round((thursday.getTime() - yearStart.getTime()) / 86_400_000);
  const week = Math.ceil((daysSinceYearStart + 1) / 7);

  return formatIsoWeekPeriod(isoYear, week);
}

export function getCurrentIsoWeekPeriod(now: Date = new Date()): string {
  return getIsoWeekPeriod(now);
}

// Parses AND validates a "YYYY-Www" period string. Throws
// BadRequestException (not a generic Error) because this is reached
// directly from GET /leaderboard's own `?period=` query param via
// LeaderboardService.getLeaderboard — a malformed value is a client
// input error (400), not a server fault. Rejects an out-of-range week
// (00, or > 52/53 depending on whether `isoYear` actually has a 53rd
// week) rather than silently accepting a period string that could never
// have been produced by getIsoWeekPeriod.
export function parseIsoWeekPeriod(period: string): IsoWeekParts {
  const match = PERIOD_PATTERN.exec(period);
  if (!match) {
    throw new BadRequestException('period must be in the form "YYYY-Www", e.g. "2026-W33"');
  }
  const isoYear = Number(match[1]);
  const week = Number(match[2]);
  const maxWeek = isoYearHasWeek53(isoYear) ? 53 : 52;
  if (week < 1 || week > maxWeek) {
    throw new BadRequestException(`period week must be between 01 and ${String(maxWeek).padStart(2, '0')} for ${isoYear}`);
  }
  return { isoYear, week };
}

// The Monday (UTC 00:00:00) that begins ISO week `week` of `isoYear`.
// ISO-8601 defines week 1 as the week containing 4 January, so week 1's
// Monday is found by locating 4 January's own Monday, then walking
// forward (week - 1) * 7 days for any later week.
export function getIsoWeekMonday(isoYear: number, week: number): Date {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4IsoWeekday = jan4.getUTCDay() || 7; // Mon=1..Sun=7
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4IsoWeekday - 1));

  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return monday;
}

// The [start, end) UTC boundary for a period string — start is that
// week's own Monday 00:00:00 UTC, end is the following Monday 00:00:00
// UTC (exclusive). This is the exact window LeaderboardRollupService
// filters PointsLedgerEntry.occurredAt against.
export function getIsoWeekBoundaries(period: string): { start: Date; end: Date } {
  const { isoYear, week } = parseIsoWeekPeriod(period);
  const start = getIsoWeekMonday(isoYear, week);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return { start, end };
}

// The period string immediately preceding `period` — re-derived by
// walking back 7 days from `period`'s own Monday and re-running
// getIsoWeekPeriod on the result, rather than naively decrementing the
// week number. Week 1 of an ISO year does not always precede from a
// "week 0"; it precedes from the PRIOR ISO year's week 52 or 53 — the
// re-derivation handles that year-boundary case for free instead of
// needing special-cased logic. Used by LeaderboardRollupService to
// recompute the immediately-preceding period on every tick alongside the
// current one (see leaderboard/README.md).
export function getPreviousIsoWeekPeriod(period: string): string {
  const { start } = getIsoWeekBoundaries(period);
  const previousMonday = new Date(start);
  previousMonday.setUTCDate(start.getUTCDate() - 7);
  return getIsoWeekPeriod(previousMonday);
}
