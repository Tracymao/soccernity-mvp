// backend/b294-report-retention (B-294; Decision Log #487, founder decision of 2026-11-11).
//
// How long a CLOSED report is kept before the daily sweep deletes it (together with the content it removed):
//   REPORT_RETENTION_MONTHS               a report that does not concern a minor: months after it CLOSED (default 12).
//   REPORT_RETENTION_CONCERNS_MINOR_YEARS a report flagged concernsMinor: years after it CLOSED (default 6).
// "Closed" is reportClosedAt (account-hold.rules.ts), the one computed closure moment. Both numbers are
// configuration; the 6-year figure is unverified for UK law and counsel may confirm it (it does not hold the build).

export const DEFAULT_REPORT_RETENTION_MONTHS = 12;
export const DEFAULT_REPORT_RETENTION_CONCERNS_MINOR_YEARS = 6;

/**
 * Most reports DELETED in one run (a deleted report is the unit: it may take a post, its media and its
 * engagement rows with it). Blocked and skipped reports do not count toward it, so a pile of permanently kept
 * reports can never starve the ones that are due. The run still reads candidates page by page until the cap
 * of deletions is reached or the candidates run out.
 */
export const REPORT_RETENTION_MAX_PER_RUN = 100;

/** Candidates read per page while scanning for due reports. */
export const REPORT_RETENTION_PAGE_SIZE = 200;

export interface ConfigReader {
  get(key: string): string | undefined;
}

export interface ReportRetentionConfig {
  months: number;
  concernsMinorYears: number;
}

// A positive whole number, else the default: a blank, zero, negative or non-numeric value never silently
// disables the retention clock (same rule as messaging.config.ts and contact.config.ts).
function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== '' && Number.isInteger(n) && n > 0 ? n : fallback;
}

// The names are spelled out as literals so src/env-completeness.spec.ts (B-018) can see them.
export function readReportRetentionConfig(config: ConfigReader): ReportRetentionConfig {
  return {
    months: positiveInt(config.get('REPORT_RETENTION_MONTHS'), DEFAULT_REPORT_RETENTION_MONTHS),
    concernsMinorYears: positiveInt(
      config.get('REPORT_RETENTION_CONCERNS_MINOR_YEARS'),
      DEFAULT_REPORT_RETENTION_CONCERNS_MINOR_YEARS,
    ),
  };
}

/** Retention period in calendar months for one report. */
export function retentionMonthsFor(report: { concernsMinor: boolean }, cfg: ReportRetentionConfig): number {
  return report.concernsMinor ? cfg.concernsMinorYears * 12 : cfg.months;
}
