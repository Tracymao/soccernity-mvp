// The UTC start of the calendar month `now` falls in — "New Users (this
// month)" needs a real boundary to count User.createdAt against.
// Deliberately UTC-based (Date.UTC / getUTC*), not local-time
// (new Date(y, m, 1) reads/writes local-time calendar fields) — the
// same DST-safety discipline account-deletion-sweep.service.ts's own
// comment already documents for a different calendar-arithmetic bug
// (setMonth vs setUTCMonth silently shifting a cutoff by an hour across
// a DST boundary). A month boundary computed in local time would give a
// DIFFERENT UTC instant depending on the server's local timezone and
// time of year, which is not what "this calendar month" should mean for
// a stat with no stated timezone of its own.
export function startOfCurrentMonthUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}
