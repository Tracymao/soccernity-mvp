import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { buildTestDobEncryption } from '../../crypto/test-dob-encryption';
import { ADMIN_ACTION_LOG_ACTIONS, ADMIN_ACTION_LOG_TARGET_TYPES } from '../admin-action-log/admin-action-log.constants';
import { calculateAge } from '../auth/registration/age.util';
import { AdminUserDobCorrectionService } from './admin-user-dob-correction.service';

// B-103 (Decision Log #390, #395 B4, #398, #403 item 15): the audited support
// DOB correction. The rules under test:
//   - the corrected date goes through the registration validation;
//   - isMinor / isUnder16 and the card-verification policy are re-derived;
//   - an age-tier change cancels (-> adult) or restarts (-> minor) the guardian
//     request; a restart resets the decline counter; the incorrect-details flag
//     is always cleared;
//   - the audit row (written in the SAME transaction) holds admin, target,
//     reason, old tier, new tier -- never a DOB value.

const dobEncryption = buildTestDobEncryption();

// A birth date that makes someone exactly `age` years old today, away from the
// birthday edge (first day of the previous month).
function dobForAge(age: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - age, now.getUTCMonth() - 1, 1));
}
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  dateOfBirth: string | null;
  isMinor: boolean;
  isUnder16: boolean;
  accountStatus: string;
  derivedCountry: string | null;
}
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
  consentDeclineSource: string | null;
  declineCount: number;
  incorrectDetailsReportedAt: Date | null;
  withdrawalToken: string | null;
  withdrawalTokenExpiresAt: Date | null;
  cardVerificationRequired: boolean;
  cardVerifiedAt: Date | null;
  cardRefundedAt: Date | null;
  stripePaymentIntentId: string | null;
  consentScreenVersion: string | null;
  consentDeviceType: string | null;
  consentVerificationMethod: string | null;
  consentVerificationAt: Date | null;
}

function build(opts: {
  age: number;
  user?: Partial<UserRow>;
  guardian?: Partial<GuardianRow> | null;
}) {
  const oldDob = dobForAge(opts.age);
  const user: UserRow = {
    id: 'user-1',
    email: 'minor@example.com',
    displayName: 'Minor Person',
    dateOfBirth: dobEncryption.encrypt(oldDob),
    isMinor: opts.age < 18,
    isUnder16: opts.age < 16,
    accountStatus: 'active',
    derivedCountry: 'GB',
    ...opts.user,
  };
  const guardian: GuardianRow | null =
    opts.guardian === null
      ? null
      : {
          id: 'guardian-1',
          minorUserId: 'user-1',
          name: 'Pat Guardian',
          email: 'guardian@example.com',
          relationship: 'Parent',
          consentStatus: 'pending',
          consentToken: 'old-token',
          consentTokenExpiresAt: new Date(Date.now() + 24 * 3600 * 1000),
          consentTimestamp: null,
          consentAutoResentAt: null,
          consentDeclineSource: null,
          declineCount: 0,
          incorrectDetailsReportedAt: null,
          withdrawalToken: null,
          withdrawalTokenExpiresAt: null,
          cardVerificationRequired: false,
          cardVerifiedAt: null,
          cardRefundedAt: null,
          stripePaymentIntentId: null,
          consentScreenVersion: null,
          consentDeviceType: null,
          consentVerificationMethod: null,
          consentVerificationAt: null,
          ...opts.guardian,
        };
  let guardianRow = guardian;
  const auditRows: Array<{ data: Record<string, unknown> }> = [];

  const tx = {
    user: {
      findUnique: jest.fn(async () => ({ ...user, guardian: guardianRow ? { ...guardianRow } : null })),
      updateMany: jest.fn(async ({ where, data }: { where: { dateOfBirth: string }; data: Partial<UserRow> }) => {
        if (where.dateOfBirth !== user.dateOfBirth) return { count: 0 };
        Object.assign(user, data);
        return { count: 1 };
      }),
    },
    guardian: {
      update: jest.fn(async ({ data }: { data: Partial<GuardianRow> }) => {
        Object.assign(guardianRow as GuardianRow, data);
        return { ...(guardianRow as GuardianRow) };
      }),
      create: jest.fn(async ({ data }: { data: Partial<GuardianRow> }) => {
        guardianRow = {
          id: 'guardian-new',
          consentStatus: 'pending',
          consentDeclineSource: null,
          declineCount: 0,
          incorrectDetailsReportedAt: null,
          ...data,
        } as GuardianRow;
        return { ...guardianRow };
      }),
    },
    adminActionLog: {
      create: jest.fn(async (arg: { data: Record<string, unknown> }) => {
        auditRows.push(arg);
        return arg.data;
      }),
    },
  };
  const prisma = { $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)) };
  const emailService = { sendGuardianConsentEmail: jest.fn().mockResolvedValue(undefined) };
  const config = { get: () => undefined } as never;

  const service = new AdminUserDobCorrectionService(prisma as never, dobEncryption, config, emailService as never);
  const storedDob = () => (user.dateOfBirth ? dobEncryption.decrypt(user.dateOfBirth) : null);
  return { service, user, tx, prisma, emailService, auditRows, getGuardian: () => guardianRow, storedDob, oldDob };
}

const REASON = 'Birth certificate seen by support';
const call = (h: ReturnType<typeof build>, newAge: number, extra: Record<string, unknown> = {}) =>
  h.service.correctDateOfBirth('user-1', 'admin-1', {
    dateOfBirth: isoDay(dobForAge(newAge)),
    reason: REASON,
    ...extra,
  } as never);

describe('validation and refusals', () => {
  it('rejects an implausible or future date with the registration message, before any read', async () => {
    const h = build({ age: 10 });
    const future = new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10);
    await expect(
      h.service.correctDateOfBirth('user-1', 'admin-1', { dateOfBirth: future, reason: REASON } as never),
    ).rejects.toThrow('dateOfBirth must be a real, non-future date');
    await expect(
      h.service.correctDateOfBirth('user-1', 'admin-1', { dateOfBirth: '1800-01-01', reason: REASON } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires a real reason', async () => {
    const h = build({ age: 10 });
    await expect(
      h.service.correctDateOfBirth('user-1', 'admin-1', {
        dateOfBirth: isoDay(dobForAge(11)),
        reason: '          ',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('404s for an unknown user', async () => {
    const h = build({ age: 10 });
    h.tx.user.findUnique.mockResolvedValueOnce(null as never);
    await expect(call(h, 11)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409s for an anonymized account', async () => {
    const h = build({ age: 10, user: { dateOfBirth: null, accountStatus: 'deleted' }, guardian: null });
    await expect(call(h, 11)).rejects.toBeInstanceOf(ConflictException);
  });

  it('400s when the date is already the one on file', async () => {
    const h = build({ age: 10 });
    await expect(call(h, 10)).rejects.toThrow('already the date of birth on file');
  });

  it('409s if the stored value changed since it was read (optimistic lock) and writes no audit row', async () => {
    const h = build({ age: 10 });
    h.tx.user.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    await expect(call(h, 11)).rejects.toBeInstanceOf(ConflictException);
    expect(h.auditRows).toHaveLength(0);
  });
});

describe('same age tier', () => {
  it('updates the DOB and flags, clears the incorrect-details flag, leaves the request and counter alone', async () => {
    const h = build({
      age: 9,
      guardian: { declineCount: 2, consentStatus: 'declined', consentDeclineSource: 'guardian_explicit', incorrectDetailsReportedAt: new Date() },
    });

    const result = await call(h, 11); // both under_13

    expect(result).toEqual({
      userId: 'user-1',
      ageTierBefore: 'under_13',
      ageTierAfter: 'under_13',
      guardianRequest: 'unchanged',
      declineCounterReset: false,
      incorrectDetailsFlagCleared: true,
    });
    expect(calculateAge(h.storedDob() as Date)).toBe(11);
    const g = h.getGuardian() as GuardianRow;
    expect(g.incorrectDetailsReportedAt).toBeNull();
    expect(g.declineCount).toBe(2); // not a restart: counter untouched
    expect(g.consentToken).toBe('old-token');
    expect(h.emailService.sendGuardianConsentEmail).not.toHaveBeenCalled();
  });
});

describe('tier change to a minor tier: the in-flight request is cancelled and restarted', () => {
  it('restarts a pending request: fresh token, expiry, counter reset, flag cleared, email sent', async () => {
    const h = build({
      age: 17,
      guardian: { declineCount: 2, incorrectDetailsReportedAt: new Date(), consentAutoResentAt: new Date() },
    });

    const result = await call(h, 12); // under_18 -> under_13

    expect(result.guardianRequest).toBe('restarted');
    expect(result.declineCounterReset).toBe(true);
    expect(result.incorrectDetailsFlagCleared).toBe(true);
    const g = h.getGuardian() as GuardianRow;
    expect(g.consentStatus).toBe('pending');
    expect(g.consentToken).not.toBe('old-token');
    expect(g.declineCount).toBe(0);
    expect(g.incorrectDetailsReportedAt).toBeNull();
    expect(g.consentAutoResentAt).toBeNull();
    expect(g.consentTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(h.emailService.sendGuardianConsentEmail).toHaveBeenCalledWith(
      'guardian@example.com',
      g.consentToken,
      'Minor Person',
    );
  });

  it('restarts a reopenable decline (counter 2): pending again, decline cause cleared, counter reset', async () => {
    const h = build({
      age: 17,
      guardian: { consentStatus: 'declined', consentDeclineSource: 'guardian_explicit', declineCount: 2 },
    });
    const result = await call(h, 14);
    expect(result.guardianRequest).toBe('restarted');
    const g = h.getGuardian() as GuardianRow;
    expect(g.consentStatus).toBe('pending');
    expect(g.consentDeclineSource).toBeNull();
    expect(g.declineCount).toBe(0);
  });

  it('reports no counter reset when the counter was already zero', async () => {
    const h = build({ age: 17 });
    const result = await call(h, 14);
    expect(result.guardianRequest).toBe('restarted');
    expect(result.declineCounterReset).toBe(false);
  });

  it('re-runs the card-verification policy: under 13 with an unresolved/US country now needs the card step', async () => {
    const h = build({ age: 15, user: { derivedCountry: 'US' } });
    await call(h, 9);
    expect((h.getGuardian() as GuardianRow).cardVerificationRequired).toBe(true);
  });

  it('and drops it when the corrected age no longer needs it', async () => {
    const h = build({ age: 9, user: { derivedCountry: 'US' }, guardian: { cardVerificationRequired: true } });
    await call(h, 15);
    expect((h.getGuardian() as GuardianRow).cardVerificationRequired).toBe(false);
  });

  it('re-derives isMinor and isUnder16 immediately', async () => {
    const h = build({ age: 17 });
    await call(h, 12);
    expect(h.user.isMinor).toBe(true);
    expect(h.user.isUnder16).toBe(true);
  });

  it('can replace the guardian details in the same step', async () => {
    const h = build({ age: 17 });
    await call(h, 12, { guardian: { name: 'New G', email: 'New-G@Example.com', relationship: 'Legal Guardian' } });
    const g = h.getGuardian() as GuardianRow;
    expect(g.email).toBe('new-g@example.com');
    expect(h.emailService.sendGuardianConsentEmail).toHaveBeenCalledWith(
      'new-g@example.com',
      g.consentToken,
      'Minor Person',
    );
  });

  it('refuses to restart while an unrefunded card charge is settling, and writes nothing', async () => {
    const h = build({ age: 15, guardian: { cardVerifiedAt: new Date(), cardRefundedAt: null } });
    await expect(call(h, 9)).rejects.toBeInstanceOf(ConflictException);
    expect(h.tx.user.updateMany).not.toHaveBeenCalled();
    expect(h.auditRows).toHaveLength(0);
  });
});

describe('confirmed consent', () => {
  const confirmed = { consentStatus: 'confirmed', consentTimestamp: new Date(), consentToken: 'old-token' };

  it('is KEPT on a minor-to-minor correction that needs nothing new', async () => {
    const h = build({ age: 17, guardian: confirmed }); // GB
    const result = await call(h, 14);
    expect(result.guardianRequest).toBe('kept_confirmed');
    const g = h.getGuardian() as GuardianRow;
    expect(g.consentStatus).toBe('confirmed');
    expect(g.consentToken).toBe('old-token');
    expect(h.emailService.sendGuardianConsentEmail).not.toHaveBeenCalled();
  });

  it('is restarted when the corrected age newly needs the card step the guardian never did', async () => {
    const h = build({ age: 15, user: { derivedCountry: 'US' }, guardian: confirmed });
    const result = await call(h, 9);
    expect(result.guardianRequest).toBe('restarted');
    const g = h.getGuardian() as GuardianRow;
    expect(g.consentStatus).toBe('pending');
    expect(g.consentTimestamp).toBeNull();
    expect(g.cardVerificationRequired).toBe(true);
  });

  it('is restarted when an ADULT account is corrected to a minor (consent was about other age facts)', async () => {
    const h = build({ age: 20, guardian: confirmed });
    const result = await call(h, 15);
    expect(result.guardianRequest).toBe('restarted');
    expect((h.getGuardian() as GuardianRow).consentStatus).toBe('pending');
  });
});

describe('tier change to adult', () => {
  it('cancels an open request: the old link is dead, the row and history are kept, no email', async () => {
    const h = build({ age: 15, guardian: { declineCount: 1, incorrectDetailsReportedAt: new Date() } });
    const result = await call(h, 20);
    expect(result.guardianRequest).toBe('cancelled');
    expect(h.user.isMinor).toBe(false);
    expect(h.user.isUnder16).toBe(false);
    const g = h.getGuardian() as GuardianRow;
    expect(g.consentToken).not.toBe('old-token');
    expect(g.consentTokenExpiresAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(g.incorrectDetailsReportedAt).toBeNull();
    expect(g.declineCount).toBe(1); // history kept; only a restart resets it
    expect(h.emailService.sendGuardianConsentEmail).not.toHaveBeenCalled();
  });

  it('leaves a confirmed record untouched', async () => {
    const h = build({ age: 15, guardian: { consentStatus: 'confirmed', consentToken: 'old-token' } });
    const result = await call(h, 20);
    expect(result.guardianRequest).toBe('unchanged');
    expect((h.getGuardian() as GuardianRow).consentToken).toBe('old-token');
  });
});

describe('an adult account corrected to a minor (#390)', () => {
  it('requires guardian details when none are on file', async () => {
    const h = build({ age: 20, guardian: null });
    await expect(call(h, 15)).rejects.toThrow(/no guardian is on file/);
    expect(h.tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('creates a Guardian row and sends the consent request', async () => {
    const h = build({ age: 20, guardian: null });
    const result = await call(h, 15, {
      guardian: { name: 'Pat', email: 'pat@example.com', relationship: 'Parent' },
    });
    expect(result.guardianRequest).toBe('created');
    const g = h.getGuardian() as GuardianRow;
    expect(g.email).toBe('pat@example.com');
    expect(g.consentStatus).toBe('pending');
    expect(h.user.isMinor).toBe(true);
    expect(h.emailService.sendGuardianConsentEmail).toHaveBeenCalledWith('pat@example.com', g.consentToken, 'Minor Person');
  });

  it("refuses the user's own email as the guardian", async () => {
    const h = build({ age: 20, guardian: null });
    await expect(
      call(h, 15, { guardian: { name: 'Me', email: 'Minor@example.com', relationship: 'Parent' } }),
    ).rejects.toThrow(/own email/);
  });
});

describe('an account on the deletion path', () => {
  it('has its DOB corrected but its guardian request left alone', async () => {
    const h = build({
      age: 15,
      user: { accountStatus: 'pending_deletion' },
      guardian: { consentStatus: 'declined', consentDeclineSource: 'expiry_timeout' },
    });
    const result = await call(h, 9);
    expect(result.guardianRequest).toBe('skipped_pending_deletion');
    expect((h.getGuardian() as GuardianRow).consentStatus).toBe('declined');
    expect(h.emailService.sendGuardianConsentEmail).not.toHaveBeenCalled();
  });
});

describe('the audit entry', () => {
  it('is written in the SAME transaction, with admin, target, reason, old and new tier, and no DOB', async () => {
    const h = build({ age: 17, guardian: { declineCount: 1 } });
    const newAge = 12;
    const oldIso = isoDay(h.oldDob);
    const newIso = isoDay(dobForAge(newAge));

    await call(h, newAge);

    expect(h.tx.adminActionLog.create).toHaveBeenCalledTimes(1);
    const { data } = h.auditRows[0];
    expect(data).toEqual(
      expect.objectContaining({
        adminId: 'admin-1',
        action: ADMIN_ACTION_LOG_ACTIONS.USER_DOB_CORRECTED,
        targetType: ADMIN_ACTION_LOG_TARGET_TYPES.USER,
        targetId: 'user-1',
      }),
    );
    const notes = data.notes as string;
    expect(notes).toContain('under_18 -> under_13');
    expect(notes).toContain(REASON);
    expect(notes).toContain('decline_counter_reset=true');
    // Never a DOB value: not the old date, the new date, or either year-month.
    for (const forbidden of [oldIso, newIso, oldIso.slice(0, 7), newIso.slice(0, 7)]) {
      expect(notes).not.toContain(forbidden);
    }
  });

  it('is written even when nothing about the guardian changes', async () => {
    const h = build({ age: 9 });
    await call(h, 10);
    expect(h.auditRows).toHaveLength(1);
    expect((h.auditRows[0].data.notes as string)).toContain('under_13 -> under_13');
  });

  it('the response does not echo either date of birth', async () => {
    const h = build({ age: 17 });
    const result = await call(h, 12);
    expect(JSON.stringify(result)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('email', () => {
  it('a failing consent email does not undo the correction', async () => {
    const h = build({ age: 17 });
    h.emailService.sendGuardianConsentEmail.mockRejectedValueOnce(new Error('postmark down'));
    await expect(call(h, 12)).resolves.toEqual(expect.objectContaining({ guardianRequest: 'restarted' }));
    expect(h.user.isMinor).toBe(true);
  });
});
