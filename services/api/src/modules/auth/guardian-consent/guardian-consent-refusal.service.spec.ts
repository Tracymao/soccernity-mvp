import { BadRequestException } from '@nestjs/common';
import { GuardianConsentService } from './guardian-consent.service';

// sprint-1/guardian-consent-decline-withdraw-expiry — the three refusal
// entry points (explicit decline, guardian withdrawal, and the sweep's
// implicit decline) plus the shared refuseConsentAndScheduleDeletion()
// primitive they all converge on.
//
// Deliberately a SEPARATE file from guardian-consent.service.spec.ts
// rather than an extension of it: that file's hand-built mock only ever
// needed to model consent-token rotation, and widening it to also track
// User rows, accountStatus and withdrawal tokens would have meant
// rewriting a harness 18 passing tests already depend on. This harness
// models the richer surface these paths actually touch.

interface GuardianRow {
  id: string;
  minorUserId: string;
  email: string;
  consentStatus: string;
  consentToken: string;
  consentTokenExpiresAt: Date;
  consentTimestamp: Date | null;
  consentAutoResentAt: Date | null;
  withdrawalToken: string | null;
  withdrawalTokenExpiresAt: Date | null;
  consentDeclineSource: string | null;
}

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  accountStatus: string;
}

const HOUR = 60 * 60 * 1000;

function buildService(
  overrides: { guardian?: Partial<GuardianRow>; user?: Partial<UserRow> } = {},
) {
  const guardian: GuardianRow = {
    id: 'guardian-1',
    minorUserId: 'minor-1',
    email: 'guardian@example.com',
    consentStatus: 'pending',
    consentToken: 'consent-token-1',
    consentTokenExpiresAt: new Date(Date.now() + 24 * HOUR),
    consentTimestamp: null,
    consentAutoResentAt: null,
    withdrawalToken: null,
    withdrawalTokenExpiresAt: null,
    consentDeclineSource: null,
    ...overrides.guardian,
  };

  const user: UserRow = {
    id: 'minor-1',
    email: 'minor@example.com',
    displayName: 'Minor Person',
    accountStatus: 'active',
    ...overrides.user,
  };

  function matchesGuardian(where: Record<string, unknown>): boolean {
    if (where.id !== undefined) return where.id === guardian.id;
    if (where.consentToken !== undefined) return where.consentToken === guardian.consentToken;
    if (where.minorUserId !== undefined) return where.minorUserId === guardian.minorUserId;
    if (where.withdrawalToken !== undefined) {
      // A null column must never match a lookup — mirroring real Postgres,
      // where `WHERE "withdrawalToken" = $1` never matches a NULL row. This
      // is what makes a spent withdrawal link genuinely unusable.
      return guardian.withdrawalToken !== null && where.withdrawalToken === guardian.withdrawalToken;
    }
    return false;
  }

  const prisma = {
    guardian: {
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        matchesGuardian(where) ? { ...guardian } : null,
      ),
      update: jest.fn(
        async ({ where, data }: { where: Record<string, unknown>; data: Partial<GuardianRow> }) => {
          if (!matchesGuardian(where)) throw new Error('guardian not found');
          Object.assign(guardian, data);
          return { ...guardian };
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown> & { consentStatus?: unknown };
          data: Partial<GuardianRow>;
        }) => {
          if (!matchesGuardian(where)) return { count: 0 };
          // Honour the `consentStatus: { not: 'declined' }` guard the real
          // query uses — this is the exact mechanism that makes a repeat
          // refusal a no-op, so a mock that ignored it would hide the bug
          // these tests exist to catch.
          const guard = where.consentStatus as { not?: string } | string | undefined;
          if (typeof guard === 'string' && guardian.consentStatus !== guard) return { count: 0 };
          if (guard && typeof guard === 'object' && guard.not === guardian.consentStatus) {
            return { count: 0 };
          }
          Object.assign(guardian, data);
          return { count: 1 };
        },
      ),
    },
    user: {
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id !== undefined) return where.id === user.id ? { ...user } : null;
        if (where.email !== undefined) return where.email === user.email ? { ...user } : null;
        return null;
      }),
    },
  };

  const config = { get: () => undefined } as never;
  const emailService = {
    sendGuardianConsentEmail: jest.fn().mockResolvedValue(undefined),
    sendGuardianWithdrawalRequestEmail: jest.fn().mockResolvedValue(undefined),
    sendConsentDeclinedEmail: jest.fn().mockResolvedValue(undefined),
    sendConsentWithdrawnEmail: jest.fn().mockResolvedValue(undefined),
    sendConsentExpiredEmail: jest.fn().mockResolvedValue(undefined),
  };
  const authService = {
    startPendingDeletion: jest.fn(async (userId: string) => {
      // The real primitive flips accountStatus and revokes sessions; the
      // status flip is the part these tests care about.
      if (userId === user.id) user.accountStatus = 'pending_deletion';
    }),
  };

  const service = new GuardianConsentService(
    prisma as never,
    config,
    emailService as never,
    authService as never,
  );

  return { service, prisma, emailService, authService, guardian, user };
}

describe('GuardianConsentService — decline', () => {
  it('declines a pending request, schedules deletion, and notifies the minor', async () => {
    const { service, guardian, user, authService, emailService } = buildService();

    await service.declineConsent('consent-token-1');

    expect(guardian.consentStatus).toBe('declined');
    // Decision Log #338 — an active decline is recorded as such.
    expect(guardian.consentDeclineSource).toBe('guardian_explicit');
    expect(authService.startPendingDeletion).toHaveBeenCalledWith('minor-1');
    expect(user.accountStatus).toBe('pending_deletion');
    expect(emailService.sendConsentDeclinedEmail).toHaveBeenCalledWith(
      'minor@example.com',
      'Minor Person',
      30,
    );
  });

  it('never sets consentTimestamp on a decline (it means "consent was given at")', async () => {
    const { service, guardian } = buildService();
    await service.declineConsent('consent-token-1');
    expect(guardian.consentTimestamp).toBeNull();
  });

  it('rejects an unknown token generically', async () => {
    const { service, authService } = buildService();
    await expect(service.declineConsent('nope')).rejects.toBeInstanceOf(BadRequestException);
    expect(authService.startPendingDeletion).not.toHaveBeenCalled();
  });

  it('rejects an expired consent token, and does not schedule deletion', async () => {
    const { service, guardian, authService } = buildService({
      guardian: { consentTokenExpiresAt: new Date(Date.now() - HOUR) },
    });

    await expect(service.declineConsent('consent-token-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(guardian.consentStatus).toBe('pending');
    expect(authService.startPendingDeletion).not.toHaveBeenCalled();
  });

  it('refuses to decline an already-confirmed request, pointing at withdrawal instead', async () => {
    const { service, guardian, authService } = buildService({
      guardian: { consentStatus: 'confirmed', consentTimestamp: new Date() },
    });

    await expect(service.declineConsent('consent-token-1')).rejects.toThrow(/withdrawal/i);
    expect(guardian.consentStatus).toBe('confirmed');
    expect(authService.startPendingDeletion).not.toHaveBeenCalled();
  });

  it('is idempotent: a second decline does NOT restart the 30-day deletion clock', async () => {
    const { service, authService, emailService } = buildService();

    await service.declineConsent('consent-token-1');
    await service.declineConsent('consent-token-1');

    // The critical assertion: calling startPendingDeletion twice would
    // reset pendingDeletionAt to now and silently push the minor's real
    // deletion date out by however long elapsed between the two clicks.
    expect(authService.startPendingDeletion).toHaveBeenCalledTimes(1);
    expect(emailService.sendConsentDeclinedEmail).toHaveBeenCalledTimes(1);
  });
});

describe('GuardianConsentService — confirm is blocked after a refusal', () => {
  it('cannot confirm a declined row with the original consent link', async () => {
    const { service, guardian } = buildService();

    await service.declineConsent('consent-token-1');
    // The consent token is NOT NULL and @unique, so it keeps resolving
    // after a decline — this is precisely why confirmConsent needs its own
    // declined branch. Without it, the guardian's original email would
    // silently reverse a refusal on an account already being deleted.
    await expect(service.confirmConsent('consent-token-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(guardian.consentStatus).toBe('declined');
  });
});

describe('GuardianConsentService — withdrawal request', () => {
  it('issues a withdrawal token and emails it to the GUARDIAN, not the minor', async () => {
    const { service, guardian, emailService } = buildService({
      guardian: { consentStatus: 'confirmed', consentTimestamp: new Date() },
    });

    await service.requestWithdrawal('minor@example.com');

    expect(guardian.withdrawalToken).toEqual(expect.any(String));
    expect(guardian.withdrawalTokenExpiresAt).toBeInstanceOf(Date);
    expect(emailService.sendGuardianWithdrawalRequestEmail).toHaveBeenCalledWith(
      'guardian@example.com',
      guardian.withdrawalToken,
      'Minor Person',
    );
  });

  it('normalizes the email before lookup (Decision Log #16)', async () => {
    const { service, guardian } = buildService({
      guardian: { consentStatus: 'confirmed' },
    });

    await service.requestWithdrawal('  MINOR@Example.COM  ');

    expect(guardian.withdrawalToken).toEqual(expect.any(String));
  });

  it('is a silent no-op for an unknown email (non-enumeration)', async () => {
    const { service, guardian, emailService } = buildService({
      guardian: { consentStatus: 'confirmed' },
    });

    await expect(service.requestWithdrawal('stranger@example.com')).resolves.toBeUndefined();

    expect(guardian.withdrawalToken).toBeNull();
    expect(emailService.sendGuardianWithdrawalRequestEmail).not.toHaveBeenCalled();
  });

  it('is a silent no-op when consent is only pending — that is a decline, not a withdrawal', async () => {
    const { service, guardian, emailService } = buildService();

    await expect(service.requestWithdrawal('minor@example.com')).resolves.toBeUndefined();

    expect(guardian.withdrawalToken).toBeNull();
    expect(emailService.sendGuardianWithdrawalRequestEmail).not.toHaveBeenCalled();
  });

  it('rotates the token, so a previously-issued withdrawal link stops working', async () => {
    const { service, guardian } = buildService({ guardian: { consentStatus: 'confirmed' } });

    await service.requestWithdrawal('minor@example.com');
    const first = guardian.withdrawalToken;
    await service.requestWithdrawal('minor@example.com');
    const second = guardian.withdrawalToken;

    expect(first).not.toEqual(second);
    await expect(service.withdrawConsent(first!)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('GuardianConsentService — withdraw', () => {
  async function withConfirmedAndRequested() {
    const ctx = buildService({
      guardian: { consentStatus: 'confirmed', consentTimestamp: new Date('2026-01-01T00:00:00Z') },
    });
    await ctx.service.requestWithdrawal('minor@example.com');
    return ctx;
  }

  it('withdraws consent, schedules deletion, and sends the withdrawal-specific email', async () => {
    const ctx = await withConfirmedAndRequested();
    const token = ctx.guardian.withdrawalToken!;

    await ctx.service.withdrawConsent(token);

    expect(ctx.guardian.consentStatus).toBe('declined');
    expect(ctx.guardian.consentDeclineSource).toBe('guardian_withdrawal');
    expect(ctx.user.accountStatus).toBe('pending_deletion');
    // Distinct copy from a plain decline — the account genuinely worked
    // before, so "was not approved" would be false.
    expect(ctx.emailService.sendConsentWithdrawnEmail).toHaveBeenCalledTimes(1);
    expect(ctx.emailService.sendConsentDeclinedEmail).not.toHaveBeenCalled();
  });

  it('preserves consentTimestamp, so the audit record can tell withdrawal from decline', async () => {
    const ctx = await withConfirmedAndRequested();

    await ctx.service.withdrawConsent(ctx.guardian.withdrawalToken!);

    // ConsentAuditRecord snapshots consentStatus + consentTimestamp. A
    // withdrawal is ('declined', non-null); a plain decline is
    // ('declined', null). That is the only thing distinguishing them
    // after the fact — see schema.prisma's comment on consentStatus.
    expect(ctx.guardian.consentStatus).toBe('declined');
    expect(ctx.guardian.consentTimestamp).toEqual(new Date('2026-01-01T00:00:00Z'));
  });

  it('is single-use: the same link cannot be replayed', async () => {
    const ctx = await withConfirmedAndRequested();
    const token = ctx.guardian.withdrawalToken!;

    await ctx.service.withdrawConsent(token);

    expect(ctx.guardian.withdrawalToken).toBeNull();
    await expect(ctx.service.withdrawConsent(token)).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.authService.startPendingDeletion).toHaveBeenCalledTimes(1);
  });

  it('rejects an expired withdrawal token', async () => {
    const ctx = await withConfirmedAndRequested();
    const token = ctx.guardian.withdrawalToken!;
    ctx.guardian.withdrawalTokenExpiresAt = new Date(Date.now() - HOUR);

    await expect(ctx.service.withdrawConsent(token)).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.guardian.consentStatus).toBe('confirmed');
    expect(ctx.authService.startPendingDeletion).not.toHaveBeenCalled();
  });

  it('rejects an unknown withdrawal token', async () => {
    const ctx = await withConfirmedAndRequested();
    await expect(ctx.service.withdrawConsent('not-a-real-token')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('GuardianConsentService — refuseConsentAndScheduleDeletion', () => {
  it("records 'expiry_timeout' when invoked with the expired reason (the sweep's path)", async () => {
    const { service, guardian } = buildService();

    await service.refuseConsentAndScheduleDeletion({
      guardianId: 'guardian-1',
      minorUserId: 'minor-1',
      reason: 'expired',
    });

    expect(guardian.consentStatus).toBe('declined');
    expect(guardian.consentDeclineSource).toBe('expiry_timeout');
  });

  it('does not overwrite the source when a second refusal arrives (first source wins)', async () => {
    const { service, guardian } = buildService();

    await service.declineConsent('consent-token-1');
    await service.refuseConsentAndScheduleDeletion({
      guardianId: 'guardian-1',
      minorUserId: 'minor-1',
      reason: 'expired',
    });

    expect(guardian.consentDeclineSource).toBe('guardian_explicit');
  });

  it('does not extend an existing deletion deadline when the account is already pending_deletion', async () => {
    // The minor had already requested deletion themselves while consent
    // was outstanding. A guardian then refuses. Re-running
    // startPendingDeletion would reset pendingDeletionAt to now, pushing
    // the existing, EARLIER deadline out — a guardian refusing consent
    // must never make the platform hold a minor's data for longer.
    const { service, guardian, authService, emailService } = buildService({
      user: { accountStatus: 'pending_deletion' },
    });

    await service.declineConsent('consent-token-1');

    expect(guardian.consentStatus).toBe('declined');
    expect(authService.startPendingDeletion).not.toHaveBeenCalled();
    // The minor is still told what happened.
    expect(emailService.sendConsentDeclinedEmail).toHaveBeenCalledTimes(1);
  });

  it('still refuses consent even if notifying the minor fails', async () => {
    const { service, guardian, emailService, authService } = buildService();
    emailService.sendConsentDeclinedEmail.mockRejectedValueOnce(new Error('postmark down'));

    await expect(service.declineConsent('consent-token-1')).resolves.toBeUndefined();

    expect(guardian.consentStatus).toBe('declined');
    expect(authService.startPendingDeletion).toHaveBeenCalledTimes(1);
  });
});
