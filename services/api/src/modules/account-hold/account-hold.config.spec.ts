import {
  DEFAULT_ACCOUNT_HOLD_POST_CLOSURE_MONTHS,
  DEFAULT_BAD_FAITH_HOLD_MONTHS,
  DEFAULT_REPORT_APPEAL_WINDOW_DAYS,
  addDays,
  addUtcMonths,
  resolveAccountHoldPostClosureMonths,
  resolveBadFaithHoldMonths,
  resolveHoldRuleConfig,
  resolveReportAppealWindowDays,
} from './account-hold.config';

// backend/w6-hold-rule-extension (B-044). The three numbers are placeholders, so what matters here is that
// they are configuration, validated, and fall back to the default.

describe('account-hold configuration', () => {
  const names = ['REPORT_APPEAL_WINDOW_DAYS', 'ACCOUNT_HOLD_POST_CLOSURE_MONTHS', 'BAD_FAITH_HOLD_MONTHS'] as const;
  const original: Record<string, string | undefined> = {};
  beforeEach(() => names.forEach((n) => (original[n] = process.env[n])));
  afterEach(() =>
    names.forEach((n) => {
      if (original[n] === undefined) delete process.env[n];
      else process.env[n] = original[n];
    }),
  );

  it('defaults are 30 days, 6 months and 6 months', () => {
    expect(DEFAULT_REPORT_APPEAL_WINDOW_DAYS).toBe(30);
    expect(DEFAULT_ACCOUNT_HOLD_POST_CLOSURE_MONTHS).toBe(6);
    expect(DEFAULT_BAD_FAITH_HOLD_MONTHS).toBe(6);
    expect(resolveReportAppealWindowDays(undefined)).toBe(30);
    expect(resolveAccountHoldPostClosureMonths(undefined)).toBe(6);
    expect(resolveBadFaithHoldMonths(undefined)).toBe(6);
  });

  it('is overridable from the environment, read at call time', () => {
    process.env.REPORT_APPEAL_WINDOW_DAYS = '14';
    process.env.ACCOUNT_HOLD_POST_CLOSURE_MONTHS = '3';
    process.env.BAD_FAITH_HOLD_MONTHS = '12';
    expect(resolveReportAppealWindowDays()).toBe(14);
    expect(resolveAccountHoldPostClosureMonths()).toBe(3);
    expect(resolveBadFaithHoldMonths()).toBe(12);
    expect(resolveHoldRuleConfig()).toEqual({ appealWindowDays: 14, postClosureMonths: 3 });
  });

  it.each([[''], ['  '], ['abc'], ['-5'], ['0'], ['1.5'], ['30 days'], ['1e3']])(
    'falls back to the default for an unusable value (%p)',
    (raw) => {
      expect(resolveReportAppealWindowDays(raw)).toBe(30);
      expect(resolveAccountHoldPostClosureMonths(raw)).toBe(6);
      expect(resolveBadFaithHoldMonths(raw)).toBe(6);
    },
  );

  it('addDays / addUtcMonths do not mutate their input and use UTC calendar months', () => {
    const base = new Date('2026-08-31T12:00:00.000Z');
    expect(addDays(base, 1).toISOString()).toBe('2026-09-01T12:00:00.000Z');
    expect(addUtcMonths(new Date('2026-04-15T12:00:00.000Z'), 6).toISOString()).toBe('2026-10-15T12:00:00.000Z');
    expect(addUtcMonths(new Date('2026-10-15T12:00:00.000Z'), 6).toISOString()).toBe('2027-04-15T12:00:00.000Z');
    expect(base.toISOString()).toBe('2026-08-31T12:00:00.000Z');
  });
});
