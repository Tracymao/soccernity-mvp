import { GuardianConsentExpirySweepService } from './guardian-consent-expiry-sweep.service';

// sprint-1/guardian-consent-decline-withdraw-expiry — the hourly sweep
// that finally acts on Guardian.consentTokenExpiresAt.
//
// The behaviour under test is the two-stage escalation, and specifically
// the field that distinguishes the stages: Guardian.consentAutoResentAt.
// NULL means "the platform has not yet spent its one automatic chase on
// this row" -> re-send + warn the minor. Non-null means the chase has
// already happened and lapsed too -> implicit decline.

interface GuardianRow {
  id: string;
  email: string;
  minorUserId: string;
  consentStatus: string;
  consentTokenExpiresAt: Date;
  consentAutoResentAt: Date | null;
  minorUser: { email: string; displayName: string; accountStatus: string } | null;
}

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-09-19T12:00:00Z');

function row(overrides: Partial<GuardianRow> = {}): GuardianRow {
  return {
    id: 'guardian-1',
    email: 'guardian@example.com',
    minorUserId: 'minor-1',
    consentStatus: 'pending',
    consentTokenExpiresAt: new Date(NOW.getTime() - HOUR),
    consentAutoResentAt: null,
    minorUser: { email: 'minor@example.com', displayName: 'Minor Person', accountStatus: 'active' },
    ...overrides,
  };
}

function buildSweep(rows: GuardianRow[]) {
  const prisma = {
    guardian: {
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: { consentStatus: string; consentTokenExpiresAt: { lte: Date } };
        }) =>
          rows.filter(
            (r) =>
              r.consentStatus === where.consentStatus &&
              r.consentTokenExpiresAt.getTime() <= where.consentTokenExpiresAt.lte.getTime(),
          ),
      ),
    },
  };

  const guardianConsentService = {
    reissueConsentToken: jest.fn().mockResolvedValue(undefined),
    refuseConsentAndScheduleDeletion: jest.fn().mockResolvedValue(undefined),
  };
  const emailService = {
    sendConsentReminderEmail: jest.fn().mockResolvedValue(undefined),
  };

  const sweep = new GuardianConsentExpirySweepService(
    prisma as never,
    guardianConsentService as never,
    emailService as never,
  );

  return { sweep, prisma, guardianConsentService, emailService };
}

describe('GuardianConsentExpirySweepService — scope', () => {
  it('only picks up pending rows whose token has actually lapsed', async () => {
    const expired = row({ id: 'expired' });
    const notYetExpired = row({
      id: 'not-yet',
      consentTokenExpiresAt: new Date(NOW.getTime() + 24 * HOUR),
    });
    const { sweep, prisma } = buildSweep([expired, notYetExpired]);

    const result = await sweep.sweepExpiredConsentRequests(NOW);

    expect(prisma.guardian.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { consentStatus: 'pending', consentTokenExpiresAt: { lte: NOW } },
      }),
    );
    expect(result.autoResentGuardianIds).toEqual(['expired']);
  });

  it('never touches confirmed or already-declined rows, even with a lapsed token', async () => {
    // A confirmed guardian's token expiring is meaningless, and a declined
    // row is already resolved and already on the deletion path. Both are
    // excluded by the query itself.
    const { sweep, guardianConsentService } = buildSweep([
      row({ id: 'confirmed', consentStatus: 'confirmed' }),
      row({ id: 'declined', consentStatus: 'declined', consentAutoResentAt: new Date() }),
    ]);

    const result = await sweep.sweepExpiredConsentRequests(NOW);

    expect(result.autoResentGuardianIds).toEqual([]);
    expect(result.implicitlyDeclinedGuardianIds).toEqual([]);
    expect(guardianConsentService.refuseConsentAndScheduleDeletion).not.toHaveBeenCalled();
  });
});

describe('GuardianConsentExpirySweepService — first expiry', () => {
  it('re-sends once and marks the row as auto-resent', async () => {
    const { sweep, guardianConsentService } = buildSweep([row()]);

    const result = await sweep.sweepExpiredConsentRequests(NOW);

    expect(result.autoResentGuardianIds).toEqual(['guardian-1']);
    expect(result.implicitlyDeclinedGuardianIds).toEqual([]);
    // Goes through the SAME method the manual resend endpoint uses, with
    // markAutoResent: true — that flag is what makes the next lapse
    // terminal, and is exactly what a manual resend must never set.
    expect(guardianConsentService.reissueConsentToken).toHaveBeenCalledWith({
      guardianId: 'guardian-1',
      minorDisplayName: 'Minor Person',
      markAutoResent: true,
    });
    expect(guardianConsentService.refuseConsentAndScheduleDeletion).not.toHaveBeenCalled();
  });

  it('warns the minor, naming their guardian, that a second lapse closes the account', async () => {
    const { sweep, emailService } = buildSweep([row()]);

    await sweep.sweepExpiredConsentRequests(NOW);

    expect(emailService.sendConsentReminderEmail).toHaveBeenCalledWith(
      'minor@example.com',
      'Minor Person',
      'guardian@example.com',
    );
  });

  it('does not claim a new request was sent if the re-send itself failed', async () => {
    const { sweep, guardianConsentService, emailService } = buildSweep([row()]);
    guardianConsentService.reissueConsentToken.mockRejectedValueOnce(new Error('postmark down'));

    const result = await sweep.sweepExpiredConsentRequests(NOW);

    expect(emailService.sendConsentReminderEmail).not.toHaveBeenCalled();
    // Not counted as chased — consentAutoResentAt was never stamped, so
    // the row is retried on the next tick and still gets its one warning.
    expect(result.autoResentGuardianIds).toEqual([]);
  });

  it('keeps the re-send even if warning the minor fails', async () => {
    const { sweep, emailService } = buildSweep([row()]);
    emailService.sendConsentReminderEmail.mockRejectedValueOnce(new Error('postmark down'));

    const result = await sweep.sweepExpiredConsentRequests(NOW);

    expect(result.autoResentGuardianIds).toEqual(['guardian-1']);
  });
});

describe('GuardianConsentExpirySweepService — second expiry', () => {
  it('treats an already-chased, still-unanswered row as an implicit decline', async () => {
    const alreadyChased = row({
      consentAutoResentAt: new Date(NOW.getTime() - 96 * HOUR),
      consentTokenExpiresAt: new Date(NOW.getTime() - 24 * HOUR),
    });
    const { sweep, guardianConsentService } = buildSweep([alreadyChased]);

    const result = await sweep.sweepExpiredConsentRequests(NOW);

    expect(result.implicitlyDeclinedGuardianIds).toEqual(['guardian-1']);
    expect(result.autoResentGuardianIds).toEqual([]);
    // Converges on the SAME primitive an explicit decline/withdrawal uses,
    // so the resulting account state cannot differ between the three.
    expect(guardianConsentService.refuseConsentAndScheduleDeletion).toHaveBeenCalledWith({
      guardianId: 'guardian-1',
      minorUserId: 'minor-1',
      reason: 'expired',
    });
    expect(guardianConsentService.reissueConsentToken).not.toHaveBeenCalled();
  });

  it('never chases the same row twice across consecutive ticks', async () => {
    // The real column is stamped by reissueConsentToken; the mock does not
    // write it back, so this simulates the persisted effect explicitly and
    // asserts the row escalates rather than looping on re-sends forever.
    const r = row();
    const { sweep, guardianConsentService } = buildSweep([r]);

    await sweep.sweepExpiredConsentRequests(NOW);
    r.consentAutoResentAt = NOW;
    r.consentTokenExpiresAt = new Date(NOW.getTime() + 72 * HOUR);

    const later = new Date(NOW.getTime() + 73 * HOUR);
    const second = await sweep.sweepExpiredConsentRequests(later);

    expect(guardianConsentService.reissueConsentToken).toHaveBeenCalledTimes(1);
    expect(second.implicitlyDeclinedGuardianIds).toEqual(['guardian-1']);
  });
});

describe('GuardianConsentExpirySweepService — resilience', () => {
  it('one failing row does not strand the rest of the batch', async () => {
    const bad = row({ id: 'bad' });
    const good = row({ id: 'good', minorUserId: 'minor-2' });
    const { sweep, guardianConsentService } = buildSweep([bad, good]);
    guardianConsentService.reissueConsentToken.mockRejectedValueOnce(new Error('boom'));

    const result = await sweep.sweepExpiredConsentRequests(NOW);

    expect(result.autoResentGuardianIds).toEqual(['good']);
  });

  it('skips a guardian with no minor User row rather than emailing a malformed request', async () => {
    const { sweep, guardianConsentService, emailService } = buildSweep([
      row({ minorUser: null }),
    ]);

    const result = await sweep.sweepExpiredConsentRequests(NOW);

    expect(guardianConsentService.reissueConsentToken).not.toHaveBeenCalled();
    expect(emailService.sendConsentReminderEmail).not.toHaveBeenCalled();
    // Counted as handled — the row was processed to a deliberate decision,
    // not left to throw on every subsequent tick.
    expect(result.autoResentGuardianIds).toEqual(['guardian-1']);
  });

  it('reports an empty result when nothing has lapsed', async () => {
    const { sweep } = buildSweep([]);
    await expect(sweep.sweepExpiredConsentRequests(NOW)).resolves.toEqual({
      autoResentGuardianIds: [],
      implicitlyDeclinedGuardianIds: [],
    });
  });
});
