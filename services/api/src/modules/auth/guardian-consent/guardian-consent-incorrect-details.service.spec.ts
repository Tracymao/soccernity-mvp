import { BadRequestException } from '@nestjs/common';
import { INCORRECT_DETAILS_OPEN_MESSAGE } from './incorrect-details.constants';
import { GuardianConsentService } from './guardian-consent.service';

// B-028 (approval email to the minor) and B-029 (the "report incorrect details"
// flag), Decision Log #372/#373. A small stateful fake of the two tables the
// service touches, so the tests exercise the real where-clause semantics
// (status + flag guards) rather than asserting on call shapes alone.

const HOUR = 60 * 60 * 1000;

interface GuardianRow {
  id: string;
  minorUserId: string;
  name: string;
  email: string;
  relationship: string;
  consentToken: string;
  consentStatus: string;
  consentTokenExpiresAt: Date;
  consentTimestamp: Date | null;
  cardVerificationRequired: boolean;
  cardVerifiedAt: Date | null;
  incorrectDetailsReportedAt: Date | null;
}

function guardianRow(over: Partial<GuardianRow> = {}): GuardianRow {
  return {
    id: 'g1',
    minorUserId: 'minor-1',
    name: 'Guardian',
    email: 'guardian@example.com',
    relationship: 'Parent',
    consentToken: 'tok',
    consentStatus: 'pending',
    consentTokenExpiresAt: new Date(Date.now() + HOUR),
    consentTimestamp: null,
    cardVerificationRequired: false,
    cardVerifiedAt: null,
    incorrectDetailsReportedAt: null,
    ...over,
  };
}

function build(
  over: Partial<GuardianRow> = {},
  user: { email: string; displayName: string; accountStatus: string } | null = {
    email: 'minor@example.com',
    displayName: 'Minor Name',
    accountStatus: 'active',
  },
) {
  const row = guardianRow(over);
  const prisma = {
    guardian: {
      findUnique: jest.fn(async ({ where }: { where: { consentToken?: string } }) =>
        where.consentToken === row.consentToken ? { ...row } : null,
      ),
      // Real where semantics for the three keys the service uses.
      updateMany: jest.fn(
        async ({ where, data }: { where: Partial<GuardianRow>; data: Partial<GuardianRow> }) => {
          const matches =
            where.consentToken === row.consentToken &&
            (where.consentStatus === undefined || where.consentStatus === row.consentStatus) &&
            (where.incorrectDetailsReportedAt === undefined ||
              where.incorrectDetailsReportedAt === row.incorrectDetailsReportedAt);
          if (!matches) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        },
      ),
    },
    user: { findUnique: jest.fn(async () => user) },
  };
  const email = { sendGuardianApprovedMinorEmail: jest.fn().mockResolvedValue(undefined) };
  const service = new GuardianConsentService(
    prisma as never,
    { get: jest.fn() } as never,
    email as never,
    {} as never,
  );
  return { service, row, prisma, email };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('GuardianConsentService.reportIncorrectDetails (B-029)', () => {
  it('flags a pending, unexpired request and nothing else', async () => {
    const { service, row } = build();
    await service.reportIncorrectDetails('tok');
    expect(row.incorrectDetailsReportedAt).toBeInstanceOf(Date);
    expect(row.consentStatus).toBe('pending');
  });

  it('is idempotent and keeps the FIRST report time', async () => {
    const first = new Date('2026-10-01T00:00:00Z');
    const { service, row, prisma } = build({ incorrectDetailsReportedAt: first });
    await expect(service.reportIncorrectDetails('tok')).resolves.toBeUndefined();
    expect(row.incorrectDetailsReportedAt).toBe(first);
    expect(prisma.guardian.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an unknown token with the generic message', async () => {
    const { service } = build();
    await expect(service.reportIncorrectDetails('nope')).rejects.toThrow('Invalid or expired consent token');
  });

  it('rejects an expired token with the same generic message', async () => {
    const { service } = build({ consentTokenExpiresAt: new Date(Date.now() - 1000) });
    await expect(service.reportIncorrectDetails('tok')).rejects.toThrow('Invalid or expired consent token');
  });

  it.each(['confirmed', 'declined'])('refuses to flag a %s request', async (consentStatus) => {
    const { service, row } = build({ consentStatus });
    await expect(service.reportIncorrectDetails('tok')).rejects.toBeInstanceOf(BadRequestException);
    expect(row.incorrectDetailsReportedAt).toBeNull();
  });

  it('does not clobber a request that was approved between the read and the write', async () => {
    const { service, row, prisma } = build();
    const snapshot = { ...row }; // what the service reads: still pending
    prisma.guardian.findUnique.mockImplementationOnce(async () => snapshot);
    row.consentStatus = 'confirmed'; // lands after the read
    await service.reportIncorrectDetails('tok');
    expect(row.incorrectDetailsReportedAt).toBeNull();
  });
});

describe('GuardianConsentService.confirmConsent with an open report (B-029)', () => {
  it('refuses approval while the report is open, with a plain message', async () => {
    const { service, row, email } = build({ incorrectDetailsReportedAt: new Date() });
    await expect(service.confirmConsent('tok')).rejects.toThrow(INCORRECT_DETAILS_OPEN_MESSAGE);
    expect(row.consentStatus).toBe('pending');
    expect(email.sendGuardianApprovedMinorEmail).not.toHaveBeenCalled();
  });

  it('a report that lands between the check and the write still holds the approval, and the guardian is told', async () => {
    const { service, row, email, prisma } = build();
    prisma.guardian.findUnique.mockImplementationOnce(async () => {
      const snapshot = { ...row };
      row.incorrectDetailsReportedAt = new Date(); // raced in after the read
      return snapshot;
    });
    await expect(service.confirmConsent('tok')).rejects.toThrow(INCORRECT_DETAILS_OPEN_MESSAGE);
    await flush();
    expect(row.consentStatus).toBe('pending');
    expect(email.sendGuardianApprovedMinorEmail).not.toHaveBeenCalled();
  });

  it('approval works again once support has cleared the flag', async () => {
    const { service, row } = build({ incorrectDetailsReportedAt: new Date() });
    row.incorrectDetailsReportedAt = null;
    await service.confirmConsent('tok');
    expect(row.consentStatus).toBe('confirmed');
  });
});

describe('GuardianConsentService.confirmConsent approval email (B-028)', () => {
  it("emails the minor's registered address once, with their display name", async () => {
    const { service, email } = build();
    await service.confirmConsent('tok');
    await flush();
    expect(email.sendGuardianApprovedMinorEmail).toHaveBeenCalledTimes(1);
    expect(email.sendGuardianApprovedMinorEmail).toHaveBeenCalledWith('minor@example.com', 'Minor Name');
  });

  it('does NOT email again when the already-approved link is clicked a second time', async () => {
    const { service, email } = build();
    await service.confirmConsent('tok');
    await service.confirmConsent('tok');
    await flush();
    expect(email.sendGuardianApprovedMinorEmail).toHaveBeenCalledTimes(1);
  });

  it('does not email an account that is no longer active', async () => {
    const { service, email } = build(
      {},
      { email: 'minor@example.com', displayName: 'Minor Name', accountStatus: 'pending_deletion' },
    );
    await service.confirmConsent('tok');
    await flush();
    expect(email.sendGuardianApprovedMinorEmail).not.toHaveBeenCalled();
  });

  it('does not email when the user row is gone', async () => {
    const { service, email } = build({}, null);
    await service.confirmConsent('tok');
    await flush();
    expect(email.sendGuardianApprovedMinorEmail).not.toHaveBeenCalled();
  });

  it('a mail failure never fails or undoes the approval', async () => {
    const { service, row, email } = build();
    email.sendGuardianApprovedMinorEmail.mockRejectedValue(new Error('postmark down'));
    await expect(service.confirmConsent('tok')).resolves.toBeUndefined();
    await flush();
    expect(row.consentStatus).toBe('confirmed');
  });

  it('sends no email for a declined request (the approval path is not taken)', async () => {
    const { service, email } = build({ consentStatus: 'declined' });
    await expect(service.confirmConsent('tok')).rejects.toBeInstanceOf(BadRequestException);
    await flush();
    expect(email.sendGuardianApprovedMinorEmail).not.toHaveBeenCalled();
  });
});
