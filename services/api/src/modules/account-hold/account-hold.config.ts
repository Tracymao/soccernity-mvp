// backend/w6-hold-rule-extension (B-044; Decision Log #376, extends #341 / #345).
//
// THE NUMBERS BELOW ARE NOT COUNSEL-SOURCED. They are configuration, read at call time (not import time),
// and each falls back to its default when the value is missing or is not a positive whole number -- the
// same behaviour as resolveHeldInvestigationAlertDays.
//   REPORT_APPEAL_WINDOW_DAYS        PLACEHOLDER (founder-veto-able). 30 matches the 30-day account-deletion
//                                    grace period; there is no other basis for it.
//   ACCOUNT_HOLD_POST_CLOSURE_MONTHS PLACEHOLDER from Decision Log #376 ("6 months after closure").
//   BAD_FAITH_HOLD_MONTHS            PLACEHOLDER from Decision Log #376 ("held IN FULL for 6 months").
// None of these numbers may appear in user-facing text (a stated duration is a legal promise).

export const DEFAULT_REPORT_APPEAL_WINDOW_DAYS = 30;
export const DEFAULT_ACCOUNT_HOLD_POST_CLOSURE_MONTHS = 6;
export const DEFAULT_BAD_FAITH_HOLD_MONTHS = 6;

function positiveInt(raw: string | undefined, fallback: number): number {
  const v = raw?.trim();
  if (!v || !/^\d+$/.test(v)) return fallback;
  const n = Number(v);
  return n >= 1 ? n : fallback;
}

export function resolveReportAppealWindowDays(raw: string | undefined = process.env.REPORT_APPEAL_WINDOW_DAYS): number {
  return positiveInt(raw, DEFAULT_REPORT_APPEAL_WINDOW_DAYS);
}

export function resolveAccountHoldPostClosureMonths(
  raw: string | undefined = process.env.ACCOUNT_HOLD_POST_CLOSURE_MONTHS,
): number {
  return positiveInt(raw, DEFAULT_ACCOUNT_HOLD_POST_CLOSURE_MONTHS);
}

export function resolveBadFaithHoldMonths(raw: string | undefined = process.env.BAD_FAITH_HOLD_MONTHS): number {
  return positiveInt(raw, DEFAULT_BAD_FAITH_HOLD_MONTHS);
}

export interface HoldRuleConfig {
  appealWindowDays: number;
  postClosureMonths: number;
}

export function resolveHoldRuleConfig(): HoldRuleConfig {
  return {
    appealWindowDays: resolveReportAppealWindowDays(),
    postClosureMonths: resolveAccountHoldPostClosureMonths(),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

// Calendar months via setUTCMonth (NOT setMonth), the same choice the consent-record purge makes: setMonth
// reads local-time fields and shifts the result by an hour across a DST boundary.
export function addUtcMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}
