import { USERNAME_REVIEW_WINDOW_DAYS } from './username-review.constants';

const DAY_MS = 24 * 60 * 60 * 1000;

// ONE source of truth for "until when can the user ask for a review", used by BOTH the routes (is asking still
// possible, and what does GET /users/me/username-review say) and the username-removed email (which names the last
// day). They cannot disagree because they call the same two functions.
//
// The window is revokedAt + USERNAME_REVIEW_WINDOW_DAYS, extended to the END OF THAT UTC CALENDAR DAY. Why: the
// email shows a date, not a time. With a strict instant, a person who asks late on the date the email names could
// be refused. Extending to midnight makes the date in the email exactly right, at the price of up to 24 hours more
// than "30 days" (adopted default, veto-able; to make it strict, return the instant from both functions).

/** The last UTC calendar day on which asking is possible, as midnight UTC of that day (the date the email names). */
export function usernameReviewLastDay(revokedAt: Date): Date {
  const t = new Date(revokedAt.getTime() + USERNAME_REVIEW_WINDOW_DAYS * DAY_MS);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
}

/** The first instant at which asking is no longer possible (midnight UTC at the end of the last day). */
export function usernameReviewDeadline(revokedAt: Date): Date {
  return new Date(usernameReviewLastDay(revokedAt).getTime() + DAY_MS);
}

export function canAskForUsernameReview(revokedAt: Date, now: Date): boolean {
  return now.getTime() < usernameReviewDeadline(revokedAt).getTime();
}
