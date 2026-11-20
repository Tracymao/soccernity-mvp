import { UnauthorizedException } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';

// AdminAuthService's three outcomes after a correct password (B-086, B-270; Decision Log #446): a challenge (two-factor
// on), an enrolment token (not enrolled and ADMIN_2FA_ENFORCED is "true"), or the session (not enrolled, enforcement
// off). Only the session path touches the token service.
const CHALLENGE = { twoFactorRequired: true, challengeToken: 'id.secret', challengeExpiresInSeconds: 300 };
const ENROLMENT = { twoFactorEnrolmentRequired: true, enrolmentToken: 'id.secret', expiresInSeconds: 600 };

function adminRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'admin-1',
    email: 'admin@example.com',
    passwordHash: 'hash:correct-password',
    fullName: 'Ada Admin',
    phone: null,
    accountStatus: 'active',
    role: 'moderator',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    totpEnabledAt: null,
    ...overrides,
  };
}

function build(row: ReturnType<typeof adminRow> | null, enforced: boolean) {
  const prisma = { adminUser: { findUnique: jest.fn(async () => row) } };
  const passwords = {
    hash: jest.fn(async (p: string) => `hash:${p}`),
    verify: jest.fn(async (h: string, p: string) => h === `hash:${p}`),
  };
  const adminTokens = {
    issueTokenPair: jest.fn(async (_id: string, _role: string, persistent = false) => ({
      accessToken: { token: 'access', expiresIn: 900 },
      refreshToken: { token: 'refresh', expiresAt: new Date('2026-12-01T00:00:00.000Z') },
      persistent,
    })),
  };
  const twoFactor = {
    isAdminEnforced: jest.fn(() => enforced),
    issueChallenge: jest.fn(async () => CHALLENGE),
    issueAdminEnrolmentToken: jest.fn(async () => ENROLMENT),
    completeChallenge: jest.fn(),
    confirmAdminEnrolmentWithToken: jest.fn(),
  };
  const service = new AdminAuthService(prisma as never, passwords as never, adminTokens as never, twoFactor as never);
  return { service, prisma, adminTokens, twoFactor };
}

describe('AdminAuthService.login with two-factor', () => {
  it('an admin WITH two-factor gets a challenge and no session, whether or not enforcement is on', async () => {
    for (const enforced of [true, false]) {
      const { service, adminTokens, twoFactor } = build(adminRow({ totpEnabledAt: new Date() }), enforced);
      await service.onModuleInit();
      expect(await service.login('Admin@Example.com', 'correct-password', false)).toEqual(CHALLENGE);
      expect(twoFactor.issueChallenge).toHaveBeenCalledWith('admin', 'admin-1', false);
      expect(adminTokens.issueTokenPair).not.toHaveBeenCalled();
    }
  });

  it('an admin WITHOUT two-factor, enforcement ON: an enrolment token and no session (no grace period)', async () => {
    const { service, adminTokens, twoFactor } = build(adminRow(), true);
    await service.onModuleInit();
    expect(await service.login('admin@example.com', 'correct-password', true)).toEqual(ENROLMENT);
    expect(twoFactor.issueAdminEnrolmentToken).toHaveBeenCalledWith('admin-1', true);
    expect(twoFactor.issueChallenge).not.toHaveBeenCalled();
    expect(adminTokens.issueTokenPair).not.toHaveBeenCalled();
  });

  it('an admin WITHOUT two-factor, enforcement OFF (the default): the session, exactly as before', async () => {
    const { service, adminTokens, twoFactor } = build(adminRow(), false);
    await service.onModuleInit();
    const result = await service.login('admin@example.com', 'correct-password', false);
    expect(result).toMatchObject({ accessToken: 'access', refreshToken: 'refresh', admin: { id: 'admin-1' } });
    expect(adminTokens.issueTokenPair).toHaveBeenCalledWith('admin-1', 'moderator', false);
    expect(twoFactor.issueChallenge).not.toHaveBeenCalled();
    expect(twoFactor.issueAdminEnrolmentToken).not.toHaveBeenCalled();
  });

  it('a wrong password, an unknown address or a deactivated admin gets neither a challenge nor an enrolment token', async () => {
    const cases: Array<[string, ReturnType<typeof adminRow> | null, string]> = [
      ['wrong password', adminRow({ totpEnabledAt: new Date() }), 'nope'],
      ['unknown address', null, 'correct-password'],
      ['deactivated', adminRow({ accountStatus: 'deactivated', totpEnabledAt: new Date() }), 'correct-password'],
    ];
    for (const [, row, password] of cases) {
      const { service, twoFactor } = build(row, true);
      await service.onModuleInit();
      await expect(service.login('admin@example.com', password)).rejects.toThrow('Invalid credentials');
      expect(twoFactor.issueChallenge).not.toHaveBeenCalled();
      expect(twoFactor.issueAdminEnrolmentToken).not.toHaveBeenCalled();
    }
  });
});

describe('AdminAuthService: second step', () => {
  it('completeTwoFactorLogin issues the session after a good code, keeping the persistent flag', async () => {
    const { service, adminTokens, twoFactor } = build(adminRow({ totpEnabledAt: new Date() }), true);
    twoFactor.completeChallenge.mockResolvedValue({ subjectId: 'admin-1', persistent: true, purpose: 'login' });
    const { response, persistent } = await service.completeTwoFactorLogin('id.secret', '123456');
    expect(twoFactor.completeChallenge).toHaveBeenCalledWith('admin', 'id.secret', '123456');
    expect(persistent).toBe(true);
    expect(adminTokens.issueTokenPair).toHaveBeenCalledWith('admin-1', 'moderator', true);
    expect(response.admin.id).toBe('admin-1');
  });

  it('completeTwoFactorLogin refuses an admin who was deactivated meanwhile', async () => {
    const { service, adminTokens, twoFactor } = build(adminRow({ accountStatus: 'deactivated' }), true);
    twoFactor.completeChallenge.mockResolvedValue({ subjectId: 'admin-1', persistent: false, purpose: 'login' });
    await expect(service.completeTwoFactorLogin('id.secret', '123456')).rejects.toThrow(UnauthorizedException);
    expect(adminTokens.issueTokenPair).not.toHaveBeenCalled();
  });

  it('completeEnrolmentLogin returns the session AND the backup codes, once', async () => {
    const { service, adminTokens, twoFactor } = build(adminRow({ totpEnabledAt: new Date() }), true);
    twoFactor.confirmAdminEnrolmentWithToken.mockResolvedValue({ adminId: 'admin-1', persistent: false, backupCodes: ['AAAAAAAAAA'] });
    const done = await service.completeEnrolmentLogin('enrol.token', '123456');
    expect(twoFactor.confirmAdminEnrolmentWithToken).toHaveBeenCalledWith('enrol.token', '123456');
    expect(done.backupCodes).toEqual(['AAAAAAAAAA']);
    expect(done.response.admin.id).toBe('admin-1');
    expect(adminTokens.issueTokenPair).toHaveBeenCalledTimes(1);
  });
});
