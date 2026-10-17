import { BadRequestException, ConflictException } from '@nestjs/common';
import { GuardianConsentService } from './guardian-consent.service';
import { MAX_EXPLICIT_DECLINES, isReopenableDecline } from './guardian-decline-cap.constants';

// B-102 / B-110 (Decision Log #389, #395 B2, #402, #403 items 2 and 15): the
// guardian decline cap. The rules under test:
//
//   - decline 1 and 2: sessions stay valid (the account is never touched), the
//     row becomes 'declined', the counter moves, NO email is sent;
//   - resend and change-guardian-email accept the account while fewer than
//     three declines are recorded, and reopen the request as 'pending';
//   - decline 3 (any time, three in one day included): login blocked at once
//     and pending deletion WITH the existing grace, via the shared refusal
//     primitive, plus the (functional) email to the minor;
//   - expiry, the second lapse and post-approval withdrawal never count;
//   - changing the guardian email does not reset the counter;
//   - no API response exposes the counter.

interface GuardianRow {
  id: string;
  minorUserId: string;
  name: string;
  email: string;
  relationship: string;
  consentStatus: string;
  consentToken: string;
  consentTokenExpiresAt: Date;
  consentTimestamp: Date | null;
  consentAutoResentAt: Date | null;
  withdrawalToken: string | null;
  withdrawalTokenExpiresAt: Date | null;
  consentDeclineSource: string | null;
  declineCount: number;
  cardVerifiedAt: Date | null;
  cardRefundedAt: Date | null;
  stripePaymentIntentId: string | null;
  incorrectDetailsReportedAt: Date | null;
}

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  accountStatus: string;
  isMinor: boolean;
}

const HOUR = 60 * 60 * 1000;

type Where = Record<string, unknown>;

function buildHarness(overrides: { guardian?: Partial<GuardianRow>; user?: Partial<UserRow> } = {}) {
  const guardian: GuardianRow = {
    id: 'guardian-1',
    minorUserId: 'minor-1',
    name: 'Pat Guardian',
    email: 'guardian@example.com',
    relationship: 'Parent',
    consentStatus: 'pending',
    consentToken: 'token-0',
    consentTokenExpiresAt: new Date(Date.now() + 24 * HOUR),
    consentTimestamp: null,
    consentAutoResentAt: null,
    withdrawalToken: null,
    withdrawalTokenExpiresAt: null,
    consentDeclineSource: null,
    declineCount: 0,
    cardVerifiedAt: null,
    cardRefundedAt: null,
    stripePaymentIntentId: null,
    incorrectDetailsReportedAt: null,
    ...overrides.guardian,
  };
  const user: UserRow = {
    id: 'minor-1',
    email: 'minor@example.com',
    displayName: 'Minor Person',
    accountStatus: 'active',
    isMinor: true,
    ...overrides.user,
  };

  // A tiny where-clause evaluator covering exactly the operators the service's
  // queries use. Anything it does not understand FAILS the test loudly rather
  // than silently matching.
  function matches(where: Where): boolean {
    for (const [key, cond] of Object.entries(where)) {
      switch (key) {
        case 'id':
          if (cond !== guardian.id) return false;
          break;
        case 'minorUserId':
          if (cond !== guardian.minorUserId) return false;
          break;
        case 'consentToken':
          if (cond !== guardian.consentToken) return false;
          break;
        case 'withdrawalToken':
          if (guardian.withdrawalToken === null || cond !== guardian.withdrawalToken) return false;
          break;
        case 'consentStatus': {
          if (typeof cond === 'string') {
            if (guardian.consentStatus !== cond) return false;
          } else if ((cond as { not?: string }).not !== undefined) {
            if (guardian.consentStatus === (cond as { not: string }).not) return false;
          } else throw new Error('unsupported consentStatus condition');
          break;
        }
        case 'declineCount': {
          if (typeof cond === 'number') {
            if (guardian.declineCount !== cond) return false;
          } else if ((cond as { lt?: number }).lt !== undefined) {
            if (!(guardian.declineCount < (cond as { lt: number }).lt)) return false;
          } else throw new Error('unsupported declineCount condition');
          break;
        }
        case 'consentDeclineSource':
          if (guardian.consentDeclineSource !== cond) return false;
          break;
        case 'cardVerifiedAt':
          if (guardian.cardVerifiedAt !== cond) return false;
          break;
        case 'cardRefundedAt':
          if (guardian.cardRefundedAt !== cond) return false;
          break;
        case 'minorUser': {
          const m = cond as { isMinor?: boolean; accountStatus?: string };
          if (m.isMinor !== undefined && user.isMinor !== m.isMinor) return false;
          if (m.accountStatus !== undefined && user.accountStatus !== m.accountStatus) return false;
          break;
        }
        default:
          throw new Error(`unsupported where key: ${key}`);
      }
    }
    return true;
  }

  function apply(data: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(data)) {
      if (key === 'declineCount' && typeof value === 'object' && value !== null) {
        guardian.declineCount += (value as { increment: number }).increment;
      } else {
        (guardian as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }

  const prisma = {
    guardian: {
      findUnique: jest.fn(async ({ where }: { where: Where }) => (matches(where) ? { ...guardian } : null)),
      update: jest.fn(async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
        if (!matches(where)) throw new Error('guardian not found');
        apply(data);
        return { ...guardian };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
        if (!matches(where)) return { count: 0 };
        apply(data);
        return { count: 1 };
      }),
    },
    user: {
      findUnique: jest.fn(async ({ where }: { where: Where }) => {
        if (where.id !== undefined) return where.id === user.id ? { ...user } : null;
        if (where.email !== undefined) return where.email === user.email ? { ...user } : null;
        return null;
      }),
    },
  };

  const config = { get: () => undefined } as never;
  const emailService = {
    sendGuardianConsentEmail: jest.fn().mockResolvedValue(undefined),
    sendGuardianEmailReplacedEmail: jest.fn().mockResolvedValue(undefined),
    sendConsentDeclinedEmail: jest.fn().mockResolvedValue(undefined),
    sendConsentWithdrawnEmail: jest.fn().mockResolvedValue(undefined),
    sendConsentExpiredEmail: jest.fn().mockResolvedValue(undefined),
  };
  const authService = {
    startPendingDeletion: jest.fn(async (userId: string) => {
      if (userId === user.id) user.accountStatus = 'pending_deletion';
    }),
  };

  const service = new GuardianConsentService(prisma as never, config, emailService as never, authService as never);
  return { service, prisma, emailService, authService, guardian, user };
}

const newGuardian = { name: 'New Guardian', email: 'new-guardian@example.com', relationship: 'Parent' };

describe('isReopenableDecline', () => {
  const base = { consentStatus: 'declined', consentDeclineSource: 'guardian_explicit', declineCount: 1 };
  it('is true for an explicit decline under the cap', () => {
    expect(isReopenableDecline(base)).toBe(true);
    expect(isReopenableDecline({ ...base, declineCount: MAX_EXPLICIT_DECLINES - 1 })).toBe(true);
  });
  it('is false at the cap, for withdrawal/expiry rows, and for non-declined rows', () => {
    expect(isReopenableDecline({ ...base, declineCount: MAX_EXPLICIT_DECLINES })).toBe(false);
    expect(isReopenableDecline({ ...base, consentDeclineSource: 'guardian_withdrawal' })).toBe(false);
    expect(isReopenableDecline({ ...base, consentDeclineSource: 'expiry_timeout' })).toBe(false);
    expect(isReopenableDecline({ ...base, consentDeclineSource: null })).toBe(false);
    expect(isReopenableDecline({ ...base, consentStatus: 'pending' })).toBe(false);
  });
});

describe('decline 1 and 2 (B-110: sessions stay valid, account stays open)', () => {
  it.each([
    [0, 1],
    [1, 2],
  ])('decline with %i earlier declines records it and leaves the account untouched (count -> %i)', async (before, after) => {
    const { service, guardian, user, authService, emailService } = buildHarness({
      guardian: { declineCount: before },
    });

    await service.declineConsent('token-0');

    expect(guardian.consentStatus).toBe('declined');
    expect(guardian.consentDeclineSource).toBe('guardian_explicit');
    expect(guardian.declineCount).toBe(after);
    // The whole point of B-110: no deletion path, no session revocation (that
    // happens inside startPendingDeletion), account still active.
    expect(authService.startPendingDeletion).not.toHaveBeenCalled();
    expect(user.accountStatus).toBe('active');
    // No email on a non-final decline (the minor sees the decline page).
    expect(emailService.sendConsentDeclinedEmail).not.toHaveBeenCalled();
  });

  it('counts a double-click on the same decline link once (idempotent while declined)', async () => {
    const { service, guardian } = buildHarness();
    await service.declineConsent('token-0');
    await service.declineConsent('token-0');
    expect(guardian.declineCount).toBe(1);
  });

  it('a concurrent decline that loses the counter race is a silent no-op, not a double count', async () => {
    const { service, guardian, prisma } = buildHarness();
    // This request read the row while it was still pending (count 0)...
    const stale = { ...guardian };
    prisma.guardian.findUnique.mockImplementationOnce(async () => stale);
    // ...but another request declined it before this one wrote.
    guardian.declineCount = 1;
    guardian.consentStatus = 'declined';

    await service.declineConsent('token-0');

    expect(guardian.declineCount).toBe(1);
  });

  it('does nothing for a user reclassified as an adult', async () => {
    const { service, guardian } = buildHarness({ user: { isMinor: false } });
    await service.declineConsent('token-0');
    expect(guardian.consentStatus).toBe('pending');
    expect(guardian.declineCount).toBe(0);
  });
});

describe('decline 3 (the cap): login blocked at once, pending deletion with the grace', () => {
  it('goes through the shared refusal primitive: counter 3, pending_deletion, one email', async () => {
    const { service, guardian, user, authService, emailService } = buildHarness({
      guardian: { declineCount: 2 },
    });

    await service.declineConsent('token-0');

    expect(guardian.consentStatus).toBe('declined');
    expect(guardian.consentDeclineSource).toBe('guardian_explicit');
    expect(guardian.declineCount).toBe(3);
    // startPendingDeletion is the existing primitive that stamps
    // pendingDeletionAt (the 30-day grace) and revokes every session.
    expect(authService.startPendingDeletion).toHaveBeenCalledTimes(1);
    expect(authService.startPendingDeletion).toHaveBeenCalledWith('minor-1');
    expect(user.accountStatus).toBe('pending_deletion');
    expect(emailService.sendConsentDeclinedEmail).toHaveBeenCalledTimes(1);
    // The grace passed to the email is the existing 30 days.
    expect(emailService.sendConsentDeclinedEmail).toHaveBeenCalledWith('minor@example.com', 'Minor Person', 30);
  });

  it('three declines in ONE day (decline, resend, decline, resend, decline) close the account', async () => {
    const { service, guardian, user, authService, emailService } = buildHarness();

    await service.declineConsent('token-0');
    expect(user.accountStatus).toBe('active');
    await service.resendConsent('minor@example.com');
    await service.declineConsent(guardian.consentToken);
    expect(user.accountStatus).toBe('active');
    await service.resendConsent('minor@example.com');
    await service.declineConsent(guardian.consentToken);

    expect(guardian.declineCount).toBe(3);
    expect(user.accountStatus).toBe('pending_deletion');
    expect(authService.startPendingDeletion).toHaveBeenCalledTimes(1);
    expect(emailService.sendConsentDeclinedEmail).toHaveBeenCalledTimes(1);
  });

  it('a repeated click on the final decline link does not restart the deletion clock', async () => {
    const { service, authService, emailService } = buildHarness({ guardian: { declineCount: 2 } });
    await service.declineConsent('token-0');
    await service.declineConsent('token-0');
    expect(authService.startPendingDeletion).toHaveBeenCalledTimes(1);
    expect(emailService.sendConsentDeclinedEmail).toHaveBeenCalledTimes(1);
  });

  it('is not reopenable afterwards: resend does nothing once the cap is reached', async () => {
    const { service, guardian, emailService } = buildHarness({ guardian: { declineCount: 2 } });
    await service.declineConsent('token-0');
    emailService.sendGuardianConsentEmail.mockClear();

    await service.resendConsent('minor@example.com');

    expect(guardian.consentStatus).toBe('declined');
    expect(emailService.sendGuardianConsentEmail).not.toHaveBeenCalled();
  });
});

describe('resend after a decline (B-110)', () => {
  it('reopens a row with fewer than three declines: pending, new token, email sent, counter kept', async () => {
    const { service, guardian, emailService } = buildHarness({
      guardian: { consentStatus: 'declined', consentDeclineSource: 'guardian_explicit', declineCount: 2 },
    });

    await service.resendConsent('Minor@Example.com');

    expect(guardian.consentStatus).toBe('pending');
    expect(guardian.consentDeclineSource).toBeNull();
    expect(guardian.consentToken).not.toBe('token-0');
    expect(guardian.declineCount).toBe(2); // not reset, not incremented
    expect(emailService.sendGuardianConsentEmail).toHaveBeenCalledWith(
      'guardian@example.com',
      guardian.consentToken,
      'Minor Person',
    );
  });

  it('the old link stops working after the resend', async () => {
    const { service, guardian } = buildHarness({
      guardian: { consentStatus: 'declined', consentDeclineSource: 'guardian_explicit', declineCount: 1 },
    });
    await service.resendConsent('minor@example.com');
    await expect(service.declineConsent('token-0')).rejects.toBeInstanceOf(BadRequestException);
    expect(guardian.declineCount).toBe(1);
  });

  it.each([
    ['guardian_withdrawal', 0],
    ['expiry_timeout', 0],
    ['guardian_explicit', 3],
  ])('does not reopen a %s row with count %i', async (source, count) => {
    const { service, guardian, emailService } = buildHarness({
      guardian: { consentStatus: 'declined', consentDeclineSource: source, declineCount: count },
    });
    await service.resendConsent('minor@example.com');
    expect(guardian.consentStatus).toBe('declined');
    expect(emailService.sendGuardianConsentEmail).not.toHaveBeenCalled();
  });

  it('does not reopen when the account is no longer active', async () => {
    const { service, guardian, emailService } = buildHarness({
      guardian: { consentStatus: 'declined', consentDeclineSource: 'guardian_explicit', declineCount: 1 },
      user: { accountStatus: 'pending_deletion' },
    });
    await service.resendConsent('minor@example.com');
    expect(guardian.consentStatus).toBe('declined');
    expect(emailService.sendGuardianConsentEmail).not.toHaveBeenCalled();
  });

  it('a plain resend of a still-pending request is unchanged (no reopen path used)', async () => {
    const { service, guardian, prisma } = buildHarness();
    await service.resendConsent('minor@example.com');
    expect(guardian.consentToken).not.toBe('token-0');
    expect(prisma.guardian.update).toHaveBeenCalledTimes(1);
    expect(guardian.consentAutoResentAt).toBeNull();
  });
});

describe('change guardian email after a decline (B-110)', () => {
  it('accepts a declined account under the cap, reopens it, and does NOT reset the counter', async () => {
    const { service, guardian, emailService } = buildHarness({
      guardian: { consentStatus: 'declined', consentDeclineSource: 'guardian_explicit', declineCount: 2 },
    });

    await service.changeGuardianEmail('minor-1', newGuardian);

    expect(guardian.consentStatus).toBe('pending');
    expect(guardian.consentDeclineSource).toBeNull();
    expect(guardian.email).toBe('new-guardian@example.com');
    expect(guardian.declineCount).toBe(2); // #395 B2 / #403 item 15: only a DOB-correction restart resets it
    expect(emailService.sendGuardianConsentEmail).toHaveBeenCalledWith(
      'new-guardian@example.com',
      guardian.consentToken,
      'Minor Person',
    );
  });

  it('then the new guardian declining is decline 3: the cap is per account, not per guardian', async () => {
    const { service, guardian, user } = buildHarness({
      guardian: { consentStatus: 'declined', consentDeclineSource: 'guardian_explicit', declineCount: 2 },
    });
    await service.changeGuardianEmail('minor-1', newGuardian);
    await service.declineConsent(guardian.consentToken);
    expect(guardian.declineCount).toBe(3);
    expect(user.accountStatus).toBe('pending_deletion');
  });

  it.each([
    ['at the cap', { consentDeclineSource: 'guardian_explicit', declineCount: 3 }],
    ['after a withdrawal', { consentDeclineSource: 'guardian_withdrawal', declineCount: 0 }],
    ['after an expiry', { consentDeclineSource: 'expiry_timeout', declineCount: 0 }],
  ])('is refused %s', async (_label, fields) => {
    const { service, guardian } = buildHarness({
      guardian: { consentStatus: 'declined', ...fields },
    });
    await expect(service.changeGuardianEmail('minor-1', newGuardian)).rejects.toBeInstanceOf(ConflictException);
    expect(guardian.consentStatus).toBe('declined');
  });

  it('is refused for a declined row whose account is no longer active', async () => {
    const { service } = buildHarness({
      guardian: { consentStatus: 'declined', consentDeclineSource: 'guardian_explicit', declineCount: 1 },
      user: { accountStatus: 'pending_deletion' },
    });
    await expect(service.changeGuardianEmail('minor-1', newGuardian)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('refusal routes that do NOT count', () => {
  it.each(['expired', 'withdrawn'] as const)('%s leaves the decline counter alone', async (reason) => {
    const { service, guardian, authService } = buildHarness({
      guardian: { consentStatus: reason === 'withdrawn' ? 'confirmed' : 'pending', declineCount: 1 },
    });

    await service.refuseConsentAndScheduleDeletion({
      guardianId: 'guardian-1',
      minorUserId: 'minor-1',
      reason,
    });

    expect(guardian.consentStatus).toBe('declined');
    expect(guardian.declineCount).toBe(1);
    expect(authService.startPendingDeletion).toHaveBeenCalledTimes(1);
  });
});

describe('the counter is never exposed', () => {
  it('GET status carries no decline count, and canResend is true only while reopenable', async () => {
    const reopenable = buildHarness({
      guardian: { consentStatus: 'declined', consentDeclineSource: 'guardian_explicit', declineCount: 1 },
    });
    const status = await reopenable.service.getConsentStatus('minor-1');
    expect(Object.keys(status).sort()).toEqual(['canResend', 'consentStatus', 'consentTimestamp', 'guardianEmail']);
    expect(JSON.stringify(status)).not.toMatch(/declineCount/);
    expect(status.consentStatus).toBe('declined');
    expect(status.canResend).toBe(true);

    const final = buildHarness({
      guardian: { consentStatus: 'declined', consentDeclineSource: 'guardian_explicit', declineCount: 3 },
    });
    expect((await final.service.getConsentStatus('minor-1')).canResend).toBe(false);

    const expired = buildHarness({
      guardian: { consentStatus: 'declined', consentDeclineSource: 'expiry_timeout', declineCount: 0 },
    });
    expect((await expired.service.getConsentStatus('minor-1')).canResend).toBe(false);
  });
});
