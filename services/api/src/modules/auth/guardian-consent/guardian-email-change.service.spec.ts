import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { GuardianConsentService } from './guardian-consent.service';

// safeguarding/guardian-email-change-endpoint (Decision Log #60 / #365).
// Stateful Prisma fake whose updateMany honours the optimistic-lock where
// clause (id + status + token + card state + minorUser.isMinor), because
// the concurrency guard is part of what is being tested.
const ONE_HOUR_MS = 60 * 60 * 1000;

type FakeGuardian = {
  id: string;
  minorUserId: string;
  name: string;
  email: string;
  relationship: string;
  consentStatus: string;
  consentToken: string;
  consentTokenExpiresAt: Date;
  consentAutoResentAt: Date | null;
  consentTimestamp: Date | null;
  cardVerificationRequired: boolean;
  stripePaymentIntentId: string | null;
  cardVerifiedAt: Date | null;
  cardRefundedAt: Date | null;
};

function guardianRow(over: Partial<FakeGuardian> = {}): FakeGuardian {
  return {
    id: 'guardian-1',
    minorUserId: 'minor-1',
    name: 'Old Guardian',
    email: 'old-guardian@example.com',
    relationship: 'Parent',
    consentStatus: 'pending',
    consentToken: 'old-token',
    consentTokenExpiresAt: new Date(Date.now() + ONE_HOUR_MS),
    consentAutoResentAt: null,
    consentTimestamp: null,
    cardVerificationRequired: false,
    stripePaymentIntentId: null,
    cardVerifiedAt: null,
    cardRefundedAt: null,
    ...over,
  };
}

const det = (email: string) => ({ name: 'New Guardian', email, relationship: 'Legal Guardian' });

function build(
  opts: { guardian?: FakeGuardian | null; minor?: { isMinor: boolean; email?: string } | null } = {},
) {
  const guardian = opts.guardian === undefined ? guardianRow() : opts.guardian;
  const minor =
    opts.minor === undefined
      ? { id: 'minor-1', email: 'minor@example.com', displayName: 'Minor Name', isMinor: true }
      : opts.minor === null
        ? null
        : { id: 'minor-1', email: 'minor@example.com', displayName: 'Minor Name', ...opts.minor };

  const prisma = {
    user: { findUnique: jest.fn(async () => minor) },
    guardian: {
      // A COPY, like real Prisma: the caller's snapshot must not mutate when updateMany writes the row.
      findUnique: jest.fn(async () => (guardian ? { ...guardian } : guardian)),
      updateMany: jest.fn(
        async ({ where, data }: { where: Record<string, unknown>; data: Partial<FakeGuardian> }) => {
          if (!guardian) return { count: 0 };
          const matches =
            guardian.id === where.id &&
            guardian.consentStatus === where.consentStatus &&
            guardian.consentToken === where.consentToken &&
            guardian.cardVerifiedAt === where.cardVerifiedAt &&
            guardian.cardRefundedAt === where.cardRefundedAt &&
            (where.minorUser as { isMinor: boolean }).isMinor === (minor?.isMinor ?? false);
          if (!matches) return { count: 0 };
          Object.assign(guardian, data);
          return { count: 1 };
        },
      ),
    },
  };
  const emailService = {
    sendGuardianConsentEmail: jest.fn().mockResolvedValue(undefined),
    sendGuardianEmailReplacedEmail: jest.fn().mockResolvedValue(undefined),
  };
  const config = { get: () => undefined } as never;
  const authService = { startPendingDeletion: jest.fn() };
  const service = new GuardianConsentService(prisma as never, config, emailService as never, authService as never);
  return { service, prisma, emailService, authService, guardian };
}

describe('GuardianConsentService.changeGuardianEmail', () => {
  it('restarts the flow: new email, fresh token (old link dead), fresh expiry, auto-resend marker cleared', async () => {
    const g = guardianRow({
      consentToken: 'old-token',
      consentTokenExpiresAt: new Date(Date.now() - ONE_HOUR_MS), // lapsed, mid-chase
      consentAutoResentAt: new Date(Date.now() - 2 * ONE_HOUR_MS),
    });
    const { service } = build({ guardian: g });

    await service.changeGuardianEmail('minor-1', det('new-guardian@example.com'));

    expect(g.email).toBe('new-guardian@example.com');
    expect(g.consentToken).not.toBe('old-token');
    expect(g.consentTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(g.consentAutoResentAt).toBeNull();
    expect(g.consentStatus).toBe('pending');
    expect(g.consentTimestamp).toBeNull();
  });

  it('sends the consent request to the NEW address with the NEW token, and nowhere else', async () => {
    const { service, emailService, guardian } = build();

    await service.changeGuardianEmail('minor-1', det('New-Guardian@Example.com'));

    expect(emailService.sendGuardianConsentEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendGuardianConsentEmail).toHaveBeenCalledWith(
      'new-guardian@example.com',
      guardian!.consentToken,
      'Minor Name',
    );
    expect(guardian!.consentToken).not.toBe('old-token');
  });

  it('wipes the old guardian\'s card-verification progress but keeps cardVerificationRequired frozen', async () => {
    const g = guardianRow({
      cardVerificationRequired: true,
      stripePaymentIntentId: 'pi_old',
      cardVerifiedAt: new Date(),
      cardRefundedAt: new Date(),
    });
    const { service, prisma } = build({ guardian: g });

    await service.changeGuardianEmail('minor-1', det('new-guardian@example.com'));

    expect(g.stripePaymentIntentId).toBeNull();
    expect(g.cardVerifiedAt).toBeNull();
    expect(g.cardRefundedAt).toBeNull();
    const data = (prisma.guardian.updateMany as jest.Mock).mock.calls[0][0].data;
    expect(data).not.toHaveProperty('cardVerificationRequired');
    expect(g.cardVerificationRequired).toBe(true);
  });

  it('does NOT touch an already-CONFIRMED consent: 409, nothing written, nothing sent', async () => {
    const confirmedAt = new Date();
    const g = guardianRow({ consentStatus: 'confirmed', consentTimestamp: confirmedAt });
    const { service, prisma, emailService } = build({ guardian: g });

    await expect(service.changeGuardianEmail('minor-1', det('new-guardian@example.com'))).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(prisma.guardian.updateMany).not.toHaveBeenCalled();
    expect(emailService.sendGuardianConsentEmail).not.toHaveBeenCalled();
    expect(g.email).toBe('old-guardian@example.com');
    expect(g.consentToken).toBe('old-token');
    expect(g.consentStatus).toBe('confirmed');
    expect(g.consentTimestamp).toBe(confirmedAt);
  });

  it('refuses a DECLINED request too (already on the deletion path)', async () => {
    const g = guardianRow({ consentStatus: 'declined' });
    const { service, prisma } = build({ guardian: g });

    await expect(service.changeGuardianEmail('minor-1', det('new-guardian@example.com'))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.guardian.updateMany).not.toHaveBeenCalled();
  });

  it('404s when the caller has no Guardian row, is not a minor, or no longer a minor (Decision Log #349)', async () => {
    await expect(
      build({ guardian: null }).service.changeGuardianEmail('minor-1', det('new@example.com')),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      build({ minor: { isMinor: false } }).service.changeGuardianEmail('minor-1', det('new@example.com')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects the email already on file (case-insensitively) without restarting anything', async () => {
    const { service, prisma, emailService } = build();

    await expect(service.changeGuardianEmail('minor-1', det(' OLD-Guardian@example.com '))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.guardian.updateMany).not.toHaveBeenCalled();
    expect(emailService.sendGuardianConsentEmail).not.toHaveBeenCalled();
  });

  it("rejects the minor's own email, so a minor cannot approve their own consent request", async () => {
    const { service, prisma } = build();

    await expect(service.changeGuardianEmail('minor-1', det('MINOR@example.com'))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.guardian.updateMany).not.toHaveBeenCalled();
  });

  it('refuses while a completed card charge is still awaiting refund (would orphan the charge)', async () => {
    const g = guardianRow({
      cardVerificationRequired: true,
      stripePaymentIntentId: 'pi_old',
      cardVerifiedAt: new Date(),
      cardRefundedAt: null,
    });
    const { service, prisma } = build({ guardian: g });

    await expect(service.changeGuardianEmail('minor-1', det('new-guardian@example.com'))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.guardian.updateMany).not.toHaveBeenCalled();
    expect(g.stripePaymentIntentId).toBe('pi_old');
    expect(g.cardVerifiedAt).not.toBeNull();
  });

  it('409s and sends nothing if the row changed between the read and the guarded write', async () => {
    const g = guardianRow();
    const { service, prisma, emailService } = build({ guardian: g });
    // Simulate a concurrent token rotation (e.g. a resend) landing after our read.
    (prisma.guardian.findUnique as jest.Mock).mockImplementationOnce(async () => {
      const snapshot = { ...g };
      g.consentToken = 'rotated-by-someone-else';
      return snapshot;
    });

    await expect(service.changeGuardianEmail('minor-1', det('new-guardian@example.com'))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(emailService.sendGuardianConsentEmail).not.toHaveBeenCalled();
    expect(g.email).toBe('old-guardian@example.com');
  });

  it('does not fail the request if the email provider throws after the state change committed', async () => {
    const { service, emailService, guardian } = build();
    emailService.sendGuardianConsentEmail.mockRejectedValueOnce(new Error('postmark down'));

    await expect(service.changeGuardianEmail('minor-1', det('new-guardian@example.com'))).resolves.toBeUndefined();
    expect(guardian!.email).toBe('new-guardian@example.com');
  });

  it('re-captures the guardian name and relationship with the new address (the new person may differ)', async () => {
    const g = guardianRow({ name: 'Old Guardian', relationship: 'Parent' });
    const { service } = build({ guardian: g });

    await service.changeGuardianEmail('minor-1', {
      name: '  Auntie Ada ',
      email: 'ada@example.com',
      relationship: 'Other',
    });

    expect(g.name).toBe('Auntie Ada');
    expect(g.relationship).toBe('Other');
  });

  it('tells the PREVIOUS address its request was withdrawn, without naming the new address', async () => {
    const { service, emailService } = build();

    await service.changeGuardianEmail('minor-1', det('new-guardian@example.com'));

    expect(emailService.sendGuardianEmailReplacedEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendGuardianEmailReplacedEmail).toHaveBeenCalledWith(
      'old-guardian@example.com',
      'Minor Name',
    );
    expect(JSON.stringify(emailService.sendGuardianEmailReplacedEmail.mock.calls)).not.toContain('new-guardian');
  });

  it('does not notify the previous address when the change was refused', async () => {
    const g = guardianRow({ consentStatus: 'confirmed' });
    const { service, emailService } = build({ guardian: g });

    await expect(service.changeGuardianEmail('minor-1', det('new-guardian@example.com'))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(emailService.sendGuardianEmailReplacedEmail).not.toHaveBeenCalled();
  });

  it('a failure notifying the previous address never fails (or undoes) the change, and the new send still happened', async () => {
    const { service, emailService, guardian } = build();
    emailService.sendGuardianEmailReplacedEmail.mockRejectedValueOnce(new Error('postmark down'));

    await expect(service.changeGuardianEmail('minor-1', det('new-guardian@example.com'))).resolves.toBeUndefined();
    expect(guardian!.email).toBe('new-guardian@example.com');
    expect(emailService.sendGuardianConsentEmail).toHaveBeenCalledTimes(1);
  });
});
