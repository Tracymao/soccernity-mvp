import { UnauthorizedException } from '@nestjs/common';
import { buildTestDobEncryption } from '../../crypto/test-dob-encryption';
import { ACCOUNT_DEACTIVATED_CODE, AuthService } from './auth.service';

// AuthService's two-factor branches (B-086, Decision Log #446): a password alone does not make a session for an
// account that has two-factor on, on EITHER door (login and reactivate-account). TwoFactorService, PasswordService and
// the token service are fakes; what is under test is which door issues what.
const CHALLENGE = { twoFactorRequired: true, challengeToken: 'id.secret', challengeExpiresInSeconds: 300 };

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'kid@example.com',
    phone: null,
    passwordHash: 'hash:correct-password',
    displayName: 'Kid',
    username: 'kid',
    dateOfBirth: null,
    isMinor: false,
    role: 'fan',
    verificationStatus: 'verified',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    accountStatus: 'active',
    totpEnabledAt: new Date('2026-02-01T00:00:00.000Z'),
    ...overrides,
  };
}

function build(row: ReturnType<typeof userRow> | null) {
  const prisma = {
    user: {
      findUnique: jest.fn(async () => row),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data })),
    },
    guardian: { findUnique: jest.fn(async () => null) },
  };
  const passwords = {
    hash: jest.fn(async (p: string) => `hash:${p}`),
    verify: jest.fn(async (h: string, p: string) => h === `hash:${p}`),
  };
  const tokens = {
    issueTokenPair: jest.fn(async (_id: string, _role: string, persistent = false) => ({
      accessToken: { token: 'access', expiresIn: 900 },
      refreshToken: { token: 'refresh', expiresAt: new Date('2026-12-01T00:00:00.000Z') },
      persistent,
    })),
  };
  const twoFactor = {
    issueChallenge: jest.fn(async () => CHALLENGE),
    completeChallenge: jest.fn(),
  };
  const service = new AuthService(prisma as never, passwords as never, tokens as never, buildTestDobEncryption(), twoFactor as never);
  return { service, prisma, passwords, tokens, twoFactor };
}

describe('AuthService.login with two-factor', () => {
  it('answers a CHALLENGE, not a session, once the password is right', async () => {
    const { service, tokens, twoFactor } = build(userRow());
    await service.onModuleInit();
    const result = await service.login('Kid@Example.com', 'correct-password', true);
    expect(result).toEqual(CHALLENGE);
    expect(twoFactor.issueChallenge).toHaveBeenCalledWith('user', 'user-1', true);
    expect(tokens.issueTokenPair).not.toHaveBeenCalled();
  });

  it('never reaches a challenge for a wrong password or an unknown address (the same generic 401)', async () => {
    const wrong = build(userRow());
    await wrong.service.onModuleInit();
    await expect(wrong.service.login('kid@example.com', 'nope')).rejects.toThrow(UnauthorizedException);
    expect(wrong.twoFactor.issueChallenge).not.toHaveBeenCalled();

    const unknown = build(null);
    await unknown.service.onModuleInit();
    await expect(unknown.service.login('ghost@example.com', 'nope')).rejects.toThrow('Invalid credentials');
    expect(unknown.twoFactor.issueChallenge).not.toHaveBeenCalled();
  });

  it('a closed account never gets a challenge: deactivated keeps its coded 401, the rest the generic one', async () => {
    const deactivated = build(userRow({ accountStatus: 'deactivated' }));
    await deactivated.service.onModuleInit();
    await expect(deactivated.service.login('kid@example.com', 'correct-password')).rejects.toMatchObject({
      response: { code: ACCOUNT_DEACTIVATED_CODE },
    });
    for (const accountStatus of ['pending_deletion', 'suspended']) {
      const closed = build(userRow({ accountStatus }));
      await closed.service.onModuleInit();
      await expect(closed.service.login('kid@example.com', 'correct-password')).rejects.toThrow('Invalid credentials');
      expect(closed.twoFactor.issueChallenge).not.toHaveBeenCalled();
    }
  });

  it('an account WITHOUT two-factor still gets its session straight away (nothing about the old path changed)', async () => {
    const { service, tokens, twoFactor } = build(userRow({ totpEnabledAt: null }));
    await service.onModuleInit();
    const result = await service.login('kid@example.com', 'correct-password', false);
    expect(result).toMatchObject({ accessToken: 'access', refreshToken: 'refresh' });
    expect(twoFactor.issueChallenge).not.toHaveBeenCalled();
    expect(tokens.issueTokenPair).toHaveBeenCalledWith('user-1', 'fan', false);
  });
});

describe('AuthService.reactivateAccount with two-factor (it would otherwise be a way round the second factor)', () => {
  it('a deactivated account with two-factor gets a REACTIVATION challenge; it is NOT reactivated and gets no session yet', async () => {
    const { service, prisma, tokens, twoFactor } = build(userRow({ accountStatus: 'deactivated' }));
    await service.onModuleInit();
    const result = await service.reactivateAccount('kid@example.com', 'correct-password');
    expect(result).toEqual(CHALLENGE);
    expect(twoFactor.issueChallenge).toHaveBeenCalledWith('user', 'user-1', false, 'reactivate');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(tokens.issueTokenPair).not.toHaveBeenCalled();
  });

  it('suspended and pending-deletion accounts are still refused outright, before any challenge', async () => {
    for (const accountStatus of ['suspended', 'pending_deletion']) {
      const { service, twoFactor } = build(userRow({ accountStatus }));
      await service.onModuleInit();
      await expect(service.reactivateAccount('kid@example.com', 'correct-password')).rejects.toThrow('Invalid credentials');
      expect(twoFactor.issueChallenge).not.toHaveBeenCalled();
    }
  });

  it('a wrong password gets no challenge', async () => {
    const { service, twoFactor } = build(userRow({ accountStatus: 'deactivated' }));
    await service.onModuleInit();
    await expect(service.reactivateAccount('kid@example.com', 'nope')).rejects.toThrow('Invalid credentials');
    expect(twoFactor.issueChallenge).not.toHaveBeenCalled();
  });
});

describe('AuthService.completeTwoFactorLogin', () => {
  it('issues the session with the "stay signed in" choice from the challenge', async () => {
    const { service, tokens, twoFactor } = build(userRow());
    twoFactor.completeChallenge.mockResolvedValue({ subjectId: 'user-1', persistent: true, purpose: 'login' });
    const { response, persistent } = await service.completeTwoFactorLogin('id.secret', '123456');
    expect(twoFactor.completeChallenge).toHaveBeenCalledWith('user', 'id.secret', '123456');
    expect(persistent).toBe(true);
    expect(tokens.issueTokenPair).toHaveBeenCalledWith('user-1', 'fan', true);
    expect(response).toMatchObject({ accessToken: 'access', refreshToken: 'refresh', user: { id: 'user-1', email: 'kid@example.com' } });
  });

  it('finishes a REACTIVATION: the account flips deactivated -> active only now, then the session is issued', async () => {
    const { service, prisma, tokens, twoFactor } = build(userRow({ accountStatus: 'deactivated' }));
    twoFactor.completeChallenge.mockResolvedValue({ subjectId: 'user-1', persistent: false, purpose: 'reactivate' });
    await service.completeTwoFactorLogin('id.secret', '123456');
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { accountStatus: 'active' } });
    expect(tokens.issueTokenPair).toHaveBeenCalledTimes(1);
  });

  it('an ordinary-login challenge never reactivates a deactivated account', async () => {
    const { service, prisma, tokens, twoFactor } = build(userRow({ accountStatus: 'deactivated' }));
    twoFactor.completeChallenge.mockResolvedValue({ subjectId: 'user-1', persistent: false, purpose: 'login' });
    await expect(service.completeTwoFactorLogin('id.secret', '123456')).rejects.toThrow('Invalid credentials');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(tokens.issueTokenPair).not.toHaveBeenCalled();
  });

  it('a reactivation challenge cannot be used on a suspended account that changed state in between', async () => {
    const { service, prisma, tokens, twoFactor } = build(userRow({ accountStatus: 'suspended' }));
    twoFactor.completeChallenge.mockResolvedValue({ subjectId: 'user-1', persistent: false, purpose: 'reactivate' });
    await expect(service.completeTwoFactorLogin('id.secret', '123456')).rejects.toThrow('Invalid credentials');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(tokens.issueTokenPair).not.toHaveBeenCalled();
  });

  it('lets a wrong code / expired challenge / lock from the two-factor service through unchanged', async () => {
    const { service, tokens, twoFactor } = build(userRow());
    twoFactor.completeChallenge.mockRejectedValue(new UnauthorizedException('That code did not work. Check it and try again.'));
    await expect(service.completeTwoFactorLogin('id.secret', '000000')).rejects.toThrow('That code did not work');
    expect(tokens.issueTokenPair).not.toHaveBeenCalled();
  });
});
