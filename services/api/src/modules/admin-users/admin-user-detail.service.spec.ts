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
  const prisma = { user: { findUnique: jest.fn(async () => found) } };
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
