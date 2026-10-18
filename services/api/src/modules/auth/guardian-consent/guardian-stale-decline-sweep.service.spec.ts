import { GuardianStaleDeclineSweepService } from './guardian-stale-decline-sweep.service';
import { DEFAULT_DECLINE_LAPSE_DAYS, getDeclineLapseDays } from './guardian-decline-cap.constants';

// B-126 (Decision Log #406 item 1): a row declined at decline 1 or 2 that the
// minor never reopens is put on the lapse path of an unanswered request, at its
// FIRST stage (reopen + spend the automatic chase + warn the minor). These tests
// prove WHICH rows are picked up (window boundary, the row filters), WHAT is
// done to them, and that nothing counts as a decline.

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-18T12:00:00Z');

interface Row {
  id: string;
  email: string;
  consentStatus: string;
  consentDeclineSource: string | null;
  declineCount: number;
  consentDeclinedAt: Date | null;
  minorUser: { email: string; displayName: string; isMinor: boolean; accountStatus: string };
}

function row(over: Partial<Row> = {}): Row {
  return {
    id: 'g-1',
    email: 'guardian@example.com',
    consentStatus: 'declined',
    consentDeclineSource: 'guardian_explicit',
    declineCount: 1,
    consentDeclinedAt: new Date(NOW.getTime() - 15 * DAY),
    minorUser: { email: 'minor@example.com', displayName: 'Minor Person', isMinor: true, accountStatus: 'active' },
    ...over,
  };
}

type Where = {
  consentStatus: string;
  consentDeclineSource: string;
  declineCount: { lt: number };
  consentDeclinedAt: { lte: Date };
  minorUser: { isMinor: boolean; accountStatus: string };
};

function build(rows: Row[], configured?: string) {
  // Evaluates exactly the where clause the service sends, so a wrong filter
  // shows up as a wrong result, not as a passing call-shape assertion.
  const prisma = {
    guardian: {
      findMany: jest.fn(async ({ where }: { where: Where }) =>
        rows.filter(
          (r) =>
            r.consentStatus === where.consentStatus &&
            r.consentDeclineSource === where.consentDeclineSource &&
            r.declineCount < where.declineCount.lt &&
            r.consentDeclinedAt !== null &&
            r.consentDeclinedAt.getTime() <= where.consentDeclinedAt.lte.getTime() &&
            r.minorUser.isMinor === where.minorUser.isMinor &&
            r.minorUser.accountStatus === where.minorUser.accountStatus,
        ),
      ),
    },
  };
  const config = { get: jest.fn((key: string) => (key === 'GUARDIAN_DECLINE_LAPSE_DAYS' ? configured : undefined)) };
  const guardianConsentService = { reissueConsentToken: jest.fn().mockResolvedValue(true) };
  const emailService = { sendConsentDeclineLapseReminderEmail: jest.fn().mockResolvedValue(undefined) };
  const sweep = new GuardianStaleDeclineSweepService(
    prisma as never,
    config as never,
    guardianConsentService as never,
    emailService as never,
  );
  return { sweep, prisma, guardianConsentService, emailService };
}

describe('GuardianStaleDeclineSweepService: the window', () => {
  it('defaults to 14 days', () => {
    expect(DEFAULT_DECLINE_LAPSE_DAYS).toBe(14);
    expect(getDeclineLapseDays({ get: () => undefined } as never)).toBe(14);
  });

  it('is configurable, and falls back to 14 for junk values', () => {
    expect(getDeclineLapseDays({ get: () => '30' } as never)).toBe(30);
    expect(getDeclineLapseDays({ get: () => 'abc' } as never)).toBe(14);
    expect(getDeclineLapseDays({ get: () => '0' } as never)).toBe(14);
    expect(getDeclineLapseDays({ get: () => '-3' } as never)).toBe(14);
  });

  it('picks up a row at exactly 14 days, not one day short', async () => {
    const exactly = row({ id: 'exactly', consentDeclinedAt: new Date(NOW.getTime() - 14 * DAY) });
    const dayShort = row({ id: 'short', consentDeclinedAt: new Date(NOW.getTime() - 13 * DAY - 23 * 60 * 60 * 1000) });
    const { sweep } = build([exactly, dayShort]);
    const result = await sweep.sweepStaleDeclines(NOW);
    expect(result.chasedGuardianIds).toEqual(['exactly']);
  });

  it('honours GUARDIAN_DECLINE_LAPSE_DAYS', async () => {
    const tenDays = row({ id: 'ten', consentDeclinedAt: new Date(NOW.getTime() - 10 * DAY) });
    expect((await build([tenDays]).sweep.sweepStaleDeclines(NOW)).chasedGuardianIds).toEqual([]);
    expect((await build([tenDays], '7').sweep.sweepStaleDeclines(NOW)).chasedGuardianIds).toEqual(['ten']);
  });
});

describe('GuardianStaleDeclineSweepService: which rows', () => {
  it('declines 1 and 2 are chased', async () => {
    const { sweep } = build([row({ id: 'one', declineCount: 1 }), row({ id: 'two', declineCount: 2 })]);
    expect((await sweep.sweepStaleDeclines(NOW)).chasedGuardianIds).toEqual(['one', 'two']);
  });

  it('never the third decline, a withdrawal, or an expiry row (already on the deletion path)', async () => {
    const { sweep, guardianConsentService } = build([
      row({ id: 'third', declineCount: 3 }),
      row({ id: 'withdrawn', consentDeclineSource: 'guardian_withdrawal' }),
      row({ id: 'expired', consentDeclineSource: 'expiry_timeout' }),
    ]);
    expect((await sweep.sweepStaleDeclines(NOW)).chasedGuardianIds).toEqual([]);
    expect(guardianConsentService.reissueConsentToken).not.toHaveBeenCalled();
  });

  it('never a row the minor already reopened (pending) or one that was approved', async () => {
    const { sweep } = build([row({ id: 'pending', consentStatus: 'pending' }), row({ id: 'ok', consentStatus: 'confirmed' })]);
    expect((await sweep.sweepStaleDeclines(NOW)).chasedGuardianIds).toEqual([]);
  });

  it('never an adult reclassified at 18, nor an account that is not active', async () => {
    const { sweep } = build([
      row({ id: 'adult', minorUser: { ...row().minorUser, isMinor: false } }),
      row({ id: 'closing', minorUser: { ...row().minorUser, accountStatus: 'pending_deletion' } }),
      row({ id: 'deactivated', minorUser: { ...row().minorUser, accountStatus: 'deactivated' } }),
    ]);
    expect((await sweep.sweepStaleDeclines(NOW)).chasedGuardianIds).toEqual([]);
  });

  it('a row with no decline time is not guessed at', async () => {
    const { sweep } = build([row({ consentDeclinedAt: null })]);
    expect((await sweep.sweepStaleDeclines(NOW)).chasedGuardianIds).toEqual([]);
  });
});

describe('GuardianStaleDeclineSweepService: what happens to a stale row', () => {
  it('reopens it with the chase spent, then warns the minor; declineCount is never involved', async () => {
    const { sweep, guardianConsentService, emailService } = build([row()]);
    await sweep.sweepStaleDeclines(NOW);

    expect(guardianConsentService.reissueConsentToken).toHaveBeenCalledWith({
      guardianId: 'g-1',
      minorDisplayName: 'Minor Person',
      markAutoResent: true,
      reopenDeclined: true,
    });
    expect(emailService.sendConsentDeclineLapseReminderEmail).toHaveBeenCalledWith(
      'minor@example.com',
      'Minor Person',
      'guardian@example.com',
    );
    // The sweep neither imports nor calls a refusal path: closure belongs to the
    // existing expiry sweep when the NEW request lapses.
    expect(Object.keys(guardianConsentService)).toEqual(['reissueConsentToken']);
  });

  it('does not warn the minor when the reopen lost a race (nothing was sent)', async () => {
    const { sweep, guardianConsentService, emailService } = build([row()]);
    guardianConsentService.reissueConsentToken.mockResolvedValueOnce(false);
    const result = await sweep.sweepStaleDeclines(NOW);
    expect(result.chasedGuardianIds).toEqual([]);
    expect(emailService.sendConsentDeclineLapseReminderEmail).not.toHaveBeenCalled();
  });

  it('a failed warning email does not undo or hide the reopen', async () => {
    const { sweep, emailService } = build([row()]);
    emailService.sendConsentDeclineLapseReminderEmail.mockRejectedValueOnce(new Error('postmark down'));
    const result = await sweep.sweepStaleDeclines(NOW);
    expect(result.chasedGuardianIds).toEqual(['g-1']);
  });

  it('one bad row does not stop the rest', async () => {
    const { sweep, guardianConsentService } = build([row({ id: 'bad' }), row({ id: 'good' })]);
    guardianConsentService.reissueConsentToken.mockRejectedValueOnce(new Error('db blip'));
    const result = await sweep.sweepStaleDeclines(NOW);
    expect(result.chasedGuardianIds).toEqual(['good']);
  });

  it('a second run over the same, now-reopened row finds nothing', async () => {
    const rows = [row()];
    const { sweep, guardianConsentService } = build(rows);
    guardianConsentService.reissueConsentToken.mockImplementation(async () => {
      rows[0].consentStatus = 'pending';
      return true;
    });
    expect((await sweep.sweepStaleDeclines(NOW)).chasedGuardianIds).toEqual(['g-1']);
    expect((await sweep.sweepStaleDeclines(NOW)).chasedGuardianIds).toEqual([]);
    expect(guardianConsentService.reissueConsentToken).toHaveBeenCalledTimes(1);
  });
});
