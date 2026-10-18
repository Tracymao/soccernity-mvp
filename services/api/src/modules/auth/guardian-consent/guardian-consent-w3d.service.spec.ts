import { GuardianConsentService, guardianFirstNameOf } from './guardian-consent.service';

// B-131 + B-126 (Decision Log #406 items 11 and 1): the status response gains
// guardianFirstName and lastDecisionAt (never the decline count), the new
// Guardian.consentDeclinedAt timestamp is stamped by every route that makes a
// row 'declined', and reissueConsentToken can spend the automatic chase while
// reopening a declined row and reports whether it actually sent anything.

// Taken from the real clock, not a fixed date: the service compares
// consentTokenExpiresAt with Date.now(), so a hard-coded NOW makes the
// "still valid" token fixtures expire once real time passes it (CI failed on this).
const NOW = new Date();

function guardianRow(over: Record<string, unknown> = {}) {
  return {
    id: 'guardian-1',
    minorUserId: 'minor-1',
    name: 'Pat Guardian',
    email: 'guardian@example.com',
    relationship: 'Parent',
    consentStatus: 'pending',
    consentToken: 'token-0',
    consentTokenExpiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
    consentTimestamp: null as Date | null,
    consentDeclinedAt: null as Date | null,
    consentAutoResentAt: null,
    consentDeclineSource: null,
    declineCount: 0,
    incorrectDetailsReportedAt: null,
    cardVerificationRequired: false,
    cardVerifiedAt: null,
    ...over,
  };
}

function build(row = guardianRow()) {
  const prisma = {
    guardian: {
      findUnique: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue({ ...row, consentToken: 'token-new' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'minor-1',
        email: 'minor@example.com',
        displayName: 'Minor Person',
        accountStatus: 'active',
      }),
    },
  };
  const emailService = {
    sendGuardianConsentEmail: jest.fn().mockResolvedValue(undefined),
    sendConsentDeclinedEmail: jest.fn().mockResolvedValue(undefined),
    sendConsentWithdrawnEmail: jest.fn().mockResolvedValue(undefined),
    sendConsentExpiredEmail: jest.fn().mockResolvedValue(undefined),
  };
  const authService = { startPendingDeletion: jest.fn().mockResolvedValue(undefined) };
  const config = { get: () => undefined } as never;
  const service = new GuardianConsentService(prisma as never, config, emailService as never, authService as never);
  return { service, prisma, emailService };
}

describe('guardianFirstNameOf', () => {
  it.each([
    ['Pat Guardian', 'Pat'],
    ['  Mary Jane Smith  ', 'Mary'],
    ['Madonna', 'Madonna'],
    ['Olu\tAdeyemi', 'Olu'],
  ])('%j -> %j', (full, first) => {
    expect(guardianFirstNameOf(full)).toBe(first);
  });

  it('is null for a blank name', () => {
    expect(guardianFirstNameOf('   ')).toBeNull();
    expect(guardianFirstNameOf('')).toBeNull();
  });
});

describe('GET status: guardianFirstName and lastDecisionAt (B-131)', () => {
  const approved = new Date('2026-10-01T09:00:00Z');
  const declined = new Date('2026-10-10T09:00:00Z');

  it('a request nobody has answered has no decision date', async () => {
    const { service } = build(guardianRow());
    const status = await service.getConsentStatus('minor-1');
    expect(status.guardianFirstName).toBe('Pat');
    expect(status.lastDecisionAt).toBeNull();
  });

  it('a declined request: the decline time', async () => {
    const { service } = build(
      guardianRow({
        consentStatus: 'declined',
        consentDeclineSource: 'guardian_explicit',
        declineCount: 1,
        consentDeclinedAt: declined,
      }),
    );
    expect((await service.getConsentStatus('minor-1')).lastDecisionAt).toEqual(declined);
  });

  it('an approved request: the approval time', async () => {
    const { service } = build(guardianRow({ consentStatus: 'confirmed', consentTimestamp: approved }));
    expect((await service.getConsentStatus('minor-1')).lastDecisionAt).toEqual(approved);
  });

  it('approved, then withdrawn: the withdrawal time (the later of the two)', async () => {
    const { service } = build(
      guardianRow({
        consentStatus: 'declined',
        consentDeclineSource: 'guardian_withdrawal',
        consentTimestamp: approved,
        consentDeclinedAt: declined,
      }),
    );
    expect((await service.getConsentStatus('minor-1')).lastDecisionAt).toEqual(declined);
  });

  it('declined, reopened, then approved: the approval time (the later of the two)', async () => {
    const laterApproval = new Date('2026-10-15T09:00:00Z');
    const { service } = build(
      guardianRow({ consentStatus: 'confirmed', consentTimestamp: laterApproval, consentDeclinedAt: declined }),
    );
    expect((await service.getConsentStatus('minor-1')).lastDecisionAt).toEqual(laterApproval);
  });

  it('a reopened request keeps the last decision (the decline) until a new one is made', async () => {
    const { service } = build(guardianRow({ consentStatus: 'pending', consentDeclinedAt: declined, declineCount: 1 }));
    expect((await service.getConsentStatus('minor-1')).lastDecisionAt).toEqual(declined);
  });

  it('NEVER exposes the decline count, directly or by any key containing it', async () => {
    const { service } = build(
      guardianRow({ consentStatus: 'declined', consentDeclineSource: 'guardian_explicit', declineCount: 2 }),
    );
    const status = await service.getConsentStatus('minor-1');
    expect(Object.keys(status)).not.toContain('declineCount');
    expect(JSON.stringify(status).toLowerCase()).not.toContain('declinecount');
    expect(Object.keys(status).sort()).toEqual(
      ['canResend', 'consentStatus', 'consentTimestamp', 'guardianEmail', 'guardianFirstName', 'lastDecisionAt'].sort(),
    );
  });
});

describe('consentDeclinedAt is stamped wherever a row becomes declined (B-126)', () => {
  it('decline 1 (non-final)', async () => {
    const { service, prisma } = build(guardianRow({ declineCount: 0 }));
    const before = Date.now();
    await service.declineConsent('token-0');
    const data = prisma.guardian.updateMany.mock.calls[0][0].data;
    expect(data.consentStatus).toBe('declined');
    expect(data.consentDeclinedAt).toBeInstanceOf(Date);
    expect((data.consentDeclinedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('decline 3 (final)', async () => {
    const { service, prisma } = build(guardianRow({ declineCount: 2 }));
    await service.declineConsent('token-0');
    expect(prisma.guardian.updateMany.mock.calls[0][0].data.consentDeclinedAt).toBeInstanceOf(Date);
  });

  it('post-approval withdrawal', async () => {
    const row = guardianRow({
      consentStatus: 'confirmed',
      withdrawalToken: 'w-1',
      withdrawalTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const { service, prisma } = build(row);
    await service.withdrawConsent('w-1');
    expect(prisma.guardian.updateMany.mock.calls[0][0].data.consentDeclinedAt).toBeInstanceOf(Date);
  });

  it('an expiry refusal', async () => {
    const { service, prisma } = build(guardianRow({ consentAutoResentAt: new Date() }));
    await service.refuseConsentAndScheduleDeletion({
      guardianId: 'guardian-1',
      minorUserId: 'minor-1',
      reason: 'expired',
    });
    expect(prisma.guardian.updateMany.mock.calls[0][0].data.consentDeclinedAt).toBeInstanceOf(Date);
  });
});

describe('reissueConsentToken reopen mode (B-126)', () => {
  const params = { guardianId: 'guardian-1', minorDisplayName: 'Minor Person', reopenDeclined: true };

  it('spends the automatic chase when asked, so the NEXT lapse is the terminal one', async () => {
    const { service, prisma, emailService } = build(guardianRow({ consentStatus: 'declined' }));
    const sent = await service.reissueConsentToken({ ...params, markAutoResent: true });

    const data = prisma.guardian.updateMany.mock.calls[0][0].data;
    expect(sent).toBe(true);
    expect(data.consentStatus).toBe('pending');
    expect(data.consentDeclineSource).toBeNull();
    expect(data.consentAutoResentAt).toBeInstanceOf(Date);
    // The counter is never touched: an expiry is not one of the three declines.
    expect(data).not.toHaveProperty('declineCount');
    expect(emailService.sendGuardianConsentEmail).toHaveBeenCalledTimes(1);
  });

  it("the minor's own reopen leaves the chase budget alone", async () => {
    const { service, prisma } = build(guardianRow({ consentStatus: 'declined' }));
    await service.reissueConsentToken({ ...params, markAutoResent: false });
    expect(prisma.guardian.updateMany.mock.calls[0][0].data).not.toHaveProperty('consentAutoResentAt');
  });

  it('only reopens an explicit, under-the-cap decline on an active minor (the WHERE clause)', async () => {
    const { service, prisma } = build(guardianRow({ consentStatus: 'declined' }));
    await service.reissueConsentToken({ ...params, markAutoResent: true });
    expect(prisma.guardian.updateMany.mock.calls[0][0].where).toEqual({
      id: 'guardian-1',
      consentStatus: 'declined',
      consentDeclineSource: 'guardian_explicit',
      declineCount: { lt: 3 },
      minorUser: { isMinor: true, accountStatus: 'active' },
    });
  });

  it('returns false and sends nothing when it lost the race', async () => {
    const { service, prisma, emailService } = build(guardianRow({ consentStatus: 'declined' }));
    prisma.guardian.updateMany.mockResolvedValueOnce({ count: 0 });
    const sent = await service.reissueConsentToken({ ...params, markAutoResent: true });
    expect(sent).toBe(false);
    expect(emailService.sendGuardianConsentEmail).not.toHaveBeenCalled();
  });

  it('the ordinary (non-reopen) path still returns true after sending', async () => {
    const { service, emailService } = build(guardianRow());
    const sent = await service.reissueConsentToken({
      guardianId: 'guardian-1',
      minorDisplayName: 'Minor Person',
      markAutoResent: false,
    });
    expect(sent).toBe(true);
    expect(emailService.sendGuardianConsentEmail).toHaveBeenCalledTimes(1);
  });
});
