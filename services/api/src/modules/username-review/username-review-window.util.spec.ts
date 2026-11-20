import { USERNAME_REVIEW_WINDOW_DAYS } from './username-review.constants';
import { canAskForUsernameReview, usernameReviewDeadline, usernameReviewLastDay } from './username-review-window.util';

// All dates below were worked out by hand (30 days after 3 November is 3 December: November has 30 days), not by
// running the helper and pasting its output.
describe('the username review window (B-139 part (c))', () => {
  it('is 30 days, tied to the revoke hold length', () => {
    expect(USERNAME_REVIEW_WINDOW_DAYS).toBe(30);
  });

  it('the last day is the UTC calendar day 30 days after the revocation, whatever the time of day', () => {
    for (const revokedAt of ['2026-11-03T00:00:00.000Z', '2026-11-03T10:00:00.000Z', '2026-11-03T23:59:59.999Z']) {
      expect(usernameReviewLastDay(new Date(revokedAt)).toISOString()).toBe('2026-12-03T00:00:00.000Z');
    }
  });

  it('the deadline is the first instant of the day AFTER the last day', () => {
    expect(usernameReviewDeadline(new Date('2026-11-03T10:00:00.000Z')).toISOString()).toBe('2026-12-04T00:00:00.000Z');
  });

  it('crosses a year boundary correctly', () => {
    // 10 December + 30 days = 9 January (31 - 10 = 21 days to 31 December, then 9 more).
    expect(usernameReviewLastDay(new Date('2026-12-10T08:00:00.000Z')).toISOString()).toBe('2027-01-09T00:00:00.000Z');
    expect(usernameReviewDeadline(new Date('2026-12-10T08:00:00.000Z')).toISOString()).toBe('2027-01-10T00:00:00.000Z');
  });

  it('crosses a leap day correctly (2028 has 29 days in February)', () => {
    // 31 January 2028 + 30 days: 29 days to 29 February, 1 more = 1 March.
    expect(usernameReviewLastDay(new Date('2028-01-30T12:00:00.000Z')).toISOString()).toBe('2028-02-29T00:00:00.000Z');
    expect(usernameReviewLastDay(new Date('2028-01-31T12:00:00.000Z')).toISOString()).toBe('2028-03-01T00:00:00.000Z');
  });

  describe('canAskForUsernameReview: the edge', () => {
    const revokedAt = new Date('2026-11-03T10:00:00.000Z');
    it.each([
      ['the moment of the revocation', '2026-11-03T10:00:00.000Z', true],
      ['29 days later', '2026-12-02T10:00:00.000Z', true],
      ['exactly 30 days later (the instant the window would end if it were strict)', '2026-12-03T10:00:00.000Z', true],
      ['later on the last day, after that instant: the email names this day, so it still works', '2026-12-03T23:59:59.999Z', true],
      ['the first instant after the last day', '2026-12-04T00:00:00.000Z', false],
      ['a week after that', '2026-12-11T00:00:00.000Z', false],
    ])('%s -> %s', (_label, now, expected) => {
      expect(canAskForUsernameReview(revokedAt, new Date(now))).toBe(expected);
    });
  });

  it('the date the email names is always a day on which asking still works, and the next day it does not', () => {
    const revokedAt = new Date('2026-11-03T17:30:00.000Z');
    const lastDay = usernameReviewLastDay(revokedAt);
    const endOfLastDay = new Date(lastDay.getTime() + 24 * 60 * 60 * 1000 - 1);
    expect(canAskForUsernameReview(revokedAt, lastDay)).toBe(true);
    expect(canAskForUsernameReview(revokedAt, endOfLastDay)).toBe(true);
    expect(canAskForUsernameReview(revokedAt, new Date(endOfLastDay.getTime() + 1))).toBe(false);
  });
});
