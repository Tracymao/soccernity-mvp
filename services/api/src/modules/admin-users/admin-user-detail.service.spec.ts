import { NotFoundException } from '@nestjs/common';
import { buildTestDobEncryption } from '../../crypto/test-dob-encryption';
import { ADMIN_ACTION_LOG_ACTIONS, ADMIN_ACTION_LOG_TARGET_TYPES } from '../admin-action-log/admin-action-log.constants';
import { AdminUserDetailService } from './admin-user-detail.service';

// B-109 (Decision Log #398 D4): GET /admin/users/:id.

const dobEncryption = buildTestDobEncryption();

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'minor@example.com',
    displayName: 'Minor Person',
    username: 'minor_p',
    role: 'player',
    accountStatus: 'active',
    verificationStatus: 'verified',
    isMinor: true,
    isUnder16: true,
    dateOfBirth: dobEncryption.encrypt(new Date('2014-05-02')),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    pendingDeletionAt: null,
    declaredCountry: 'GB',
    derivedCountry: 'GB',
    countryDerivationMethod: 'geolite2_local',
    countryDerivedAt: new Date('2026-01-01T00:00:00Z'),
    guardian: {
      name: 'Pat',
      email: 'pat@example.com',
      relationship: 'Parent',
      consentStatus: 'pending',
      consentDeclineSource: null,
      consentTimestamp: null,
      consentTokenExpiresAt: new Date('2026-01-04T00:00:00Z'),
      incorrectDetailsReportedAt: null,
      cardVerificationRequired: false,
      cardVerifiedAt: null,
      consentVerificationMethod: null,
    },
    ...overrides,
  };
}

function build(found: unknown) {
  const order: string[] = [];
  const prisma = {
    user: { findUnique: jest.fn(async () => found) },
    revokedUsername: { findMany: jest.fn(async () => [] as unknown[]) },
  };
  const audit = {
    record: jest.fn(async () => {
      order.push('audit');
      return {} as never;
    }),
  };
  const service = new AdminUserDetailService(prisma as never, dobEncryption, audit as never);
  return { service, prisma, audit, order };
}

describe('AdminUserDetailService.getUserDetail', () => {
  it('404s for an unknown user and writes no audit row', async () => {
    const { service, audit } = build(null);
    await expect(service.getUserDetail('nope', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('lists the handles revoked from this user, newest first, with when everyone else may take them (B-033)', async () => {
    const { service, prisma } = build(row());
    const revokedAt = new Date('2026-10-01T00:00:00Z');
    const holdUntil = new Date('2026-10-31T00:00:00Z');
    prisma.revokedUsername.findMany.mockResolvedValue([{ username: 'old_handle', revokedAt, holdUntil }]);
    const detail = await service.getUserDetail('user-1', 'admin-1');
    expect(prisma.revokedUsername.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' }, orderBy: { revokedAt: 'desc' } }),
    );
    expect(detail.usernameRevocations).toEqual([{ username: 'old_handle', revokedAt, heldUntil: holdUntil }]);
    // the reason lives in the audit log only
    expect(JSON.stringify(detail.usernameRevocations)).not.toContain('reason');
  });

  it('has an empty revocation list for a user with none', async () => {
    const { service } = build(row());
    expect((await service.getUserDetail('user-1', 'admin-1')).usernameRevocations).toEqual([]);
  });

  it('returns the DOB decrypted server-side as YYYY-MM-DD, with the age tier', async () => {
    const { service } = build(row());
    const detail = await service.getUserDetail('user-1', 'admin-1');
    expect(detail.dateOfBirth).toBe('2014-05-02');
    expect(detail.ageTier).toBe('under_13');
    expect(detail.id).toBe('user-1');
    expect(detail.guardian?.consentStatus).toBe('pending');
  });

  it('writes an audit row for the admin, the target and the DOB-viewed action on EVERY response containing a DOB', async () => {
    const { service, audit } = build(row());
    await service.getUserDetail('user-1', 'admin-1');
    await service.getUserDetail('user-1', 'admin-1'); // repeat read by the same admin
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledWith(
      'admin-1',
      ADMIN_ACTION_LOG_ACTIONS.USER_DOB_VIEWED,
      ADMIN_ACTION_LOG_TARGET_TYPES.USER,
      'user-1',
    );
  });

  it('the audit row never carries the DOB (no notes argument at all)', async () => {
    const { service, audit } = build(row());
    await service.getUserDetail('user-1', 'admin-1');
    const args = (audit.record.mock.calls[0] as unknown as unknown[]);
    expect(args).toHaveLength(4);
    expect(JSON.stringify(args)).not.toContain('2014');
  });

  it('FAILS CLOSED: if the audit write fails, no DOB is returned', async () => {
    const { service, audit } = build(row());
    audit.record.mockRejectedValueOnce(new Error('db down'));
    await expect(service.getUserDetail('user-1', 'admin-1')).rejects.toThrow('db down');
  });

  it('writes no audit row for an anonymized account, whose response holds no DOB', async () => {
    const { service, audit } = build(row({ dateOfBirth: null, accountStatus: 'deleted', guardian: null }));
    const detail = await service.getUserDetail('user-1', 'admin-1');
    expect(detail.dateOfBirth).toBeNull();
    expect(detail.ageTier).toBeNull();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('NEVER selects, and so cannot return, tokens, secrets or the decline counter', async () => {
    const { service, prisma } = build(row());
    const detail = await service.getUserDetail('user-1', 'admin-1');

    const select = (prisma.user.findUnique.mock.calls[0] as unknown as [{ select: Record<string, unknown> }])[0].select;
    const guardianSelect = (select.guardian as { select: Record<string, unknown> }).select;
    for (const forbidden of ['passwordHash', 'phone']) {
      expect(select).not.toHaveProperty(forbidden);
    }
    for (const forbidden of [
      'consentToken',
      'withdrawalToken',
      'withdrawalTokenExpiresAt',
      'stripePaymentIntentId',
      'declineCount',
    ]) {
      expect(guardianSelect).not.toHaveProperty(forbidden);
    }
    expect(JSON.stringify(detail)).not.toMatch(/"(passwordHash|consentToken|withdrawalToken|withdrawalTokenExpiresAt|stripePaymentIntentId|declineCount)"/);
  });

  it('shows the safeguarding country to support', async () => {
    const { service } = build(row());
    const detail = await service.getUserDetail('user-1', 'admin-1');
    expect(detail.safeguardingCountry).toEqual(
      expect.objectContaining({ declared: 'GB', derived: 'GB', method: 'geolite2_local' }),
    );
  });
});

// B-129 (Decision Log #406 item 4): GET /admin/users/:id/summary. User Detail
// WITHOUT the date of birth. The DOB column is never selected, so there is
// nothing to decrypt and nothing to audit.
describe('AdminUserDetailService.getUserSummary (B-129)', () => {
  it('404s for an unknown user', async () => {
    const { service } = build(null);
    await expect(service.getUserSummary('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the user with NO date of birth and NO age tier', async () => {
    const { service } = build(row());
    const summary = await service.getUserSummary('user-1');
    expect(summary).not.toHaveProperty('dateOfBirth');
    expect(summary).not.toHaveProperty('ageTier');
    // Nothing derived from the DOB leaks in another key or form either.
    expect(JSON.stringify(summary)).not.toContain('2014');
    expect(JSON.stringify(summary)).not.toContain('v1:');
    // The flags the platform acts on, and the rest of User Detail, are all there.
    expect(summary).toEqual(
      expect.objectContaining({
        id: 'user-1',
        email: 'minor@example.com',
        username: 'minor_p',
        accountStatus: 'active',
        isMinor: true,
        isUnder16: true,
        safeguardingCountry: expect.objectContaining({ derived: 'GB' }),
        guardian: expect.objectContaining({ name: 'Pat', consentStatus: 'pending' }),
        usernameRevocations: [],
      }),
    );
  });

  it('does not select the DOB column at all', async () => {
    const { service, prisma } = build(row());
    await service.getUserSummary('user-1');
    const call = prisma.user.findUnique.mock.calls[0] as unknown as [{ select: Record<string, unknown> }];
    expect(call[0].select).not.toHaveProperty('dateOfBirth');
  });

  it('writes NO user.dob_viewed audit row, however many times it is read', async () => {
    const { service, audit } = build(row());
    await service.getUserSummary('user-1');
    await service.getUserSummary('user-1');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('works for an anonymised account (no DOB to omit) without error', async () => {
    const { service } = build(row({ accountStatus: 'deleted', dateOfBirth: null, username: null }));
    await expect(service.getUserSummary('user-1')).resolves.toEqual(
      expect.objectContaining({ accountStatus: 'deleted' }),
    );
  });

  it('the full detail read is unchanged: still returns the DOB and still audits it', async () => {
    const { service, audit } = build(row());
    const detail = await service.getUserDetail('user-1', 'admin-1');
    expect(detail.dateOfBirth).toBe('2014-05-02');
    expect(audit.record).toHaveBeenCalledWith(
      'admin-1',
      ADMIN_ACTION_LOG_ACTIONS.USER_DOB_VIEWED,
      ADMIN_ACTION_LOG_TARGET_TYPES.USER,
      'user-1',
    );
  });

  it('never selects or returns tokens, hashes or the decline counter (same allow-list as the detail read)', async () => {
    const { service, prisma } = build(row());
    const summary = await service.getUserSummary('user-1');
    const call = prisma.user.findUnique.mock.calls[0] as unknown as [
      { select: Record<string, unknown> & { guardian: { select: Record<string, unknown> } } },
    ];
    for (const forbidden of ['passwordHash', 'consentToken', 'withdrawalToken', 'stripePaymentIntentId', 'declineCount']) {
      expect(call[0].select).not.toHaveProperty(forbidden);
      expect(call[0].select.guardian.select).not.toHaveProperty(forbidden);
    }
    expect(JSON.stringify(summary)).not.toMatch(
      /"(passwordHash|consentToken|withdrawalToken|stripePaymentIntentId|declineCount)"/,
    );
  });
});
