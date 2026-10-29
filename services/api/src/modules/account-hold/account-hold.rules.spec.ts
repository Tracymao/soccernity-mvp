import { HoldRuleConfig } from './account-hold.config';
import {
  InvolvedReport,
  appealWindowLapsed,
  findActiveAccountHold,
  reportClosedAt,
  reportHoldType,
  resolveAccountHold,
  strongestHoldType,
  strongestReportHold,
} from './account-hold.rules';

// backend/w6-hold-rule-extension (B-044; Decision Log #376). The closure predicate and the hold rules, with
// `now` explicit at every boundary. NUMBERS here are the placeholder defaults (30 days, 6 months), passed in.

const CFG: HoldRuleConfig = { appealWindowDays: 30, postClosureMonths: 6 };
const d = (iso: string) => new Date(iso);

function report(over: Partial<InvolvedReport>): InvolvedReport {
  return {
    status: 'open',
    appealStatus: null,
    reviewedAt: null,
    appealReviewedAt: null,
    isReporter: false,
    isSubject: true,
    ...over,
  };
}

describe('reportClosedAt (the one closure predicate)', () => {
  it('open report: not closed', () => {
    expect(reportClosedAt(report({}), 30)).toBeNull();
  });

  it('dismissed (status reviewed): closed at reviewedAt', () => {
    const at = d('2026-11-01T10:00:00.000Z');
    expect(reportClosedAt(report({ status: 'reviewed', reviewedAt: at }), 30)).toEqual(at);
  });

  it('actioned with no appeal: closes at reviewedAt + the appeal window', () => {
    const at = d('2026-11-01T10:00:00.000Z');
    expect(reportClosedAt(report({ status: 'actioned', reviewedAt: at }), 30)).toEqual(d('2026-12-01T10:00:00.000Z'));
    expect(reportClosedAt(report({ status: 'actioned', reviewedAt: at }), 7)).toEqual(d('2026-11-08T10:00:00.000Z'));
  });

  it('actioned with an appeal still pending: not closed', () => {
    expect(reportClosedAt(report({ status: 'actioned', appealStatus: 'pending', reviewedAt: d('2026-11-01T00:00:00.000Z') }), 30)).toBeNull();
  });

  it('actioned with the appeal upheld: closed at appealReviewedAt (not reviewedAt + window)', () => {
    const closed = reportClosedAt(
      report({
        status: 'actioned',
        appealStatus: 'upheld',
        reviewedAt: d('2026-11-01T00:00:00.000Z'),
        appealReviewedAt: d('2026-11-10T09:00:00.000Z'),
      }),
      30,
    );
    expect(closed).toEqual(d('2026-11-10T09:00:00.000Z'));
  });

  it('overturned appeal: the report is open again, so not closed (and appealStatus is preserved as history)', () => {
    expect(
      reportClosedAt(report({ status: 'open', appealStatus: 'overturned', appealReviewedAt: d('2026-11-10T09:00:00.000Z') }), 30),
    ).toBeNull();
  });

  it('FAILS SAFE: a closed state missing its timestamp, or an unknown status, is not closed (held)', () => {
    expect(reportClosedAt(report({ status: 'reviewed', reviewedAt: null }), 30)).toBeNull();
    expect(reportClosedAt(report({ status: 'actioned', reviewedAt: null }), 30)).toBeNull();
    expect(reportClosedAt(report({ status: 'actioned', appealStatus: 'upheld', appealReviewedAt: null }), 30)).toBeNull();
    expect(reportClosedAt(report({ status: 'something_new' }), 30)).toBeNull();
  });
});

describe('appealWindowLapsed (boundary)', () => {
  const reviewed = d('2026-11-01T10:00:00.000Z');
  it('one millisecond before the deadline: still open', () => {
    expect(appealWindowLapsed(reviewed, 30, d('2026-12-01T09:59:59.999Z'))).toBe(false);
  });
  it('at the deadline instant: lapsed', () => {
    expect(appealWindowLapsed(reviewed, 30, d('2026-12-01T10:00:00.000Z'))).toBe(true);
  });
  it('after the deadline: lapsed; the window length is a parameter', () => {
    expect(appealWindowLapsed(reviewed, 30, d('2026-12-02T00:00:00.000Z'))).toBe(true);
    expect(appealWindowLapsed(reviewed, 60, d('2026-12-02T00:00:00.000Z'))).toBe(false);
  });
});

describe('reportHoldType -- the reported person / author of reported content', () => {
  it('open report: held (open_report)', () => {
    expect(reportHoldType(report({}), d('2026-11-01T00:00:00.000Z'), CFG)).toBe('open_report');
  });

  it('overturned appeal: back in the open queue, so held as open_report again', () => {
    const r = report({ status: 'open', appealStatus: 'overturned', appealReviewedAt: d('2026-11-10T00:00:00.000Z') });
    expect(reportHoldType(r, d('2027-06-01T00:00:00.000Z'), CFG)).toBe('open_report');
  });

  it('actioned, appeal pending: held (appeal_window) however much time passes', () => {
    const r = report({ status: 'actioned', appealStatus: 'pending', reviewedAt: d('2026-01-01T00:00:00.000Z') });
    expect(reportHoldType(r, d('2030-01-01T00:00:00.000Z'), CFG)).toBe('appeal_window');
  });

  it('actioned, no appeal: appeal_window until the window lapses, then post_closure, then released', () => {
    const r = report({ status: 'actioned', reviewedAt: d('2026-11-01T10:00:00.000Z') });
    // window closes 2026-12-01T10:00; post-closure runs 6 calendar months to 2027-06-01T10:00
    expect(reportHoldType(r, d('2026-12-01T09:59:59.999Z'), CFG)).toBe('appeal_window');
    expect(reportHoldType(r, d('2026-12-01T10:00:00.000Z'), CFG)).toBe('post_closure');
    expect(reportHoldType(r, d('2027-06-01T09:59:59.999Z'), CFG)).toBe('post_closure');
    expect(reportHoldType(r, d('2027-06-01T10:00:00.000Z'), CFG)).toBeNull();
  });

  it('dismissed: held for the post-closure months from reviewedAt, then released (boundary exact)', () => {
    const r = report({ status: 'reviewed', reviewedAt: d('2026-11-01T00:00:00.000Z') });
    expect(reportHoldType(r, d('2026-11-01T00:00:00.000Z'), CFG)).toBe('post_closure');
    expect(reportHoldType(r, d('2027-04-30T23:59:59.999Z'), CFG)).toBe('post_closure');
    expect(reportHoldType(r, d('2027-05-01T00:00:00.000Z'), CFG)).toBeNull();
  });

  it('appeal upheld: post-closure months count from appealReviewedAt', () => {
    const r = report({
      status: 'actioned',
      appealStatus: 'upheld',
      reviewedAt: d('2026-01-01T00:00:00.000Z'),
      appealReviewedAt: d('2026-11-10T00:00:00.000Z'),
    });
    expect(reportHoldType(r, d('2027-05-09T23:59:59.999Z'), CFG)).toBe('post_closure');
    expect(reportHoldType(r, d('2027-05-10T00:00:00.000Z'), CFG)).toBeNull();
  });

  it('uses the configured numbers (3 months here), not constants', () => {
    const r = report({ status: 'reviewed', reviewedAt: d('2026-11-01T00:00:00.000Z') });
    const cfg = { appealWindowDays: 30, postClosureMonths: 3 };
    expect(reportHoldType(r, d('2027-01-31T23:59:59.999Z'), cfg)).toBe('post_closure');
    expect(reportHoldType(r, d('2027-02-01T00:00:00.000Z'), cfg)).toBeNull();
  });

  it('the post-closure months are calendar months in UTC (no DST drift across the October clock change)', () => {
    const r = report({ status: 'reviewed', reviewedAt: d('2026-04-15T12:00:00.000Z') });
    expect(reportHoldType(r, d('2026-10-15T11:59:59.999Z'), CFG)).toBe('post_closure');
    expect(reportHoldType(r, d('2026-10-15T12:00:00.000Z'), CFG)).toBeNull();
  });
});

describe('reportHoldType -- the REPORTER', () => {
  const rep = (over: Partial<InvolvedReport>) => report({ isReporter: true, isSubject: false, ...over });

  it('held while the report is open, and while its appeal is pending', () => {
    expect(reportHoldType(rep({}), d('2026-11-01T00:00:00.000Z'), CFG)).toBe('open_report');
    expect(reportHoldType(rep({ status: 'actioned', appealStatus: 'pending', reviewedAt: d('2026-11-01T00:00:00.000Z') }), d('2026-11-02T00:00:00.000Z'), CFG)).toBe('appeal_window');
  });

  it('NOT held after closure: dismissed, upheld, or actioned and un-appealed (no post-closure hold for a reporter)', () => {
    const at = d('2026-11-01T00:00:00.000Z');
    const later = d('2026-11-02T00:00:00.000Z');
    expect(reportHoldType(rep({ status: 'reviewed', reviewedAt: at }), later, CFG)).toBeNull();
    expect(reportHoldType(rep({ status: 'actioned', appealStatus: 'upheld', reviewedAt: at, appealReviewedAt: later }), later, CFG)).toBeNull();
    // even during the appeal window of an actioned, un-appealed report
    expect(reportHoldType(rep({ status: 'actioned', reviewedAt: at }), later, CFG)).toBeNull();
  });

  it('a reporter whose report was overturned back to open is held again', () => {
    expect(reportHoldType(rep({ status: 'open', appealStatus: 'overturned' }), d('2027-01-01T00:00:00.000Z'), CFG)).toBe('open_report');
  });

  it('someone who is BOTH reporter and subject gets the stricter of the two', () => {
    const r = report({ isReporter: true, isSubject: true, status: 'reviewed', reviewedAt: d('2026-11-01T00:00:00.000Z') });
    expect(reportHoldType(r, d('2026-12-01T00:00:00.000Z'), CFG)).toBe('post_closure');
  });

  it('an uninvolved row is never a hold', () => {
    expect(reportHoldType(report({ isReporter: false, isSubject: false }), d('2026-11-01T00:00:00.000Z'), CFG)).toBeNull();
  });
});

describe('strongest hold', () => {
  it('orders legal_hold > bad_faith > open_report > appeal_window > post_closure', () => {
    expect(strongestHoldType(['post_closure', 'appeal_window'])).toBe('appeal_window');
    expect(strongestHoldType(['appeal_window', 'open_report', 'post_closure'])).toBe('open_report');
    expect(strongestHoldType(['open_report', 'bad_faith'])).toBe('bad_faith');
    expect(strongestHoldType(['bad_faith', 'legal_hold', 'open_report'])).toBe('legal_hold');
    expect(strongestHoldType([])).toBeNull();
  });

  it('strongestReportHold takes the strongest across several reports, ignoring released ones', () => {
    const now = d('2026-12-01T00:00:00.000Z');
    const reports = [
      report({ status: 'reviewed', reviewedAt: d('2025-01-01T00:00:00.000Z') }), // long released
      report({ status: 'reviewed', reviewedAt: d('2026-11-15T00:00:00.000Z') }), // post_closure
      report({ status: 'open' }), // open_report
    ];
    expect(strongestReportHold(reports, now, CFG)).toBe('open_report');
    expect(strongestReportHold(reports.slice(0, 2), now, CFG)).toBe('post_closure');
    expect(strongestReportHold(reports.slice(0, 1), now, CFG)).toBeNull();
  });
});

describe('reads', () => {
  const now = d('2026-12-01T00:00:00.000Z');

  function db(over: { holds?: unknown[]; reports?: unknown[] }) {
    return {
      accountHold: { findMany: jest.fn().mockResolvedValue(over.holds ?? []) },
      $queryRaw: jest.fn().mockResolvedValue(over.reports ?? []),
    } as never;
  }

  it('findActiveAccountHold asks for not-lifted, not-expired holds as of `now`, and prefers legal over bad faith', async () => {
    const holds = [
      { id: 'b', type: 'bad_faith', reportId: 'r', expiresAt: d('2027-01-01T00:00:00.000Z') },
      { id: 'l', type: 'legal_hold', reportId: 'r', expiresAt: null },
    ];
    const handle = db({ holds });
    const out = await findActiveAccountHold(handle, 'u1', now);
    expect(out).toEqual({ id: 'l', type: 'legal_hold', reportId: 'r', expiresAt: null });
    expect((handle as never as { accountHold: { findMany: jest.Mock } }).accountHold.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', liftedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
    );
  });

  it('findActiveAccountHold is null when nothing is active', async () => {
    expect(await findActiveAccountHold(db({}), 'u1', now)).toBeNull();
  });

  it('resolveAccountHold: an admin hold wins and the reports are never read', async () => {
    const handle = db({ holds: [{ id: 'l', type: 'legal_hold', reportId: null, expiresAt: null }], reports: [report({})] });
    expect(await resolveAccountHold(handle, 'u1', now, CFG)).toEqual({ type: 'legal_hold', kind: 'admin' });
    expect((handle as never as { $queryRaw: jest.Mock }).$queryRaw).not.toHaveBeenCalled();
  });

  it('resolveAccountHold: with no admin hold it falls back to the report rule, and says kind=report', async () => {
    const rows = [{ status: 'open', appealStatus: null, reviewedAt: null, appealReviewedAt: null, isReporter: false, isSubject: true }];
    expect(await resolveAccountHold(db({ reports: rows }), 'u1', now, CFG)).toEqual({ type: 'open_report', kind: 'report' });
  });

  it('resolveAccountHold: nothing holds it -> null', async () => {
    expect(await resolveAccountHold(db({}), 'u1', now, CFG)).toBeNull();
  });
});
