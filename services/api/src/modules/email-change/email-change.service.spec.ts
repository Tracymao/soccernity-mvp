import { BadRequestException, ForbiddenException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { AuthLimitExceeded } from '../auth/rate-limit/auth-limits/auth-limits.service';
import { CodeEntryLockedException } from '../two-factor/two-factor-attempt.limiter';
import { EmailChangeService } from './email-change.service';

// backend/email-change (B-059). Every branch of the request and the confirmation, with mocked collaborators. The real
// database behaviours (single use, the transaction, the cascade) are covered by test/email-change.e2e-spec.ts.

type User = { id: string; email: string; passwordHash: string; isMinor: boolean; accountStatus?: string };

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function build(opts: { user?: User | null; taken?: boolean; guardian?: { email: string; consentStatus: string } | null; twoFactor?: boolean } = {}) {
  const user: User | null =
    opts.user === undefined ? { id: 'u1', email: 'old@example.com', passwordHash: 'h', isMinor: false, accountStatus: 'active' } : opts.user;
  const prisma: any = {
    user: {
      findUnique: jest.fn(async () => user),
      findFirst: jest.fn(async () => (opts.taken ? { id: 'other' } : null)),
      update: jest.fn(async () => ({})),
    },
    guardian: { findUnique: jest.fn(async () => (opts.guardian === undefined ? null : opts.guardian)) },
    emailChangeRequest: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      create: jest.fn(async () => ({ id: 'req1' })),
      findUnique: jest.fn(),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const passwordService = { verify: jest.fn(async () => true) };
  const tokenService = { revokeAllSessionsForUser: jest.fn(async () => undefined) };
  const twoFactor = {
    isEnabledForUser: jest.fn(async () => Boolean(opts.twoFactor)),
    assertUserCode: jest.fn(async () => undefined),
  };
  const email = {
    sendEmailChangeVerifyEmail: jest.fn(async (..._args: string[]) => true),
    sendEmailChangeNoticeEmail: jest.fn(async (..._args: string[]) => undefined),
  };
  const guardianNotices = { notifyInBackground: jest.fn() };
  const limiter = { reserve: jest.fn(async () => undefined), release: jest.fn(async () => undefined) };
  const service = new EmailChangeService(
    prisma,
    passwordService as never,
    tokenService as never,
    twoFactor as never,
    email as never,
    guardianNotices as never,
    limiter as never,
  );
  return { service, prisma, passwordService, tokenService, twoFactor, email, guardianNotices, limiter };
}

const dto = (over: Record<string, unknown> = {}) => ({ password: 'pw', newEmail: 'New@Example.com', ...over }) as never;

describe('EmailChangeService.requestChange', () => {
  it('stores a HASH of the secret, mails the link to the NEW address and the notice to the OLD one', async () => {
    const t = build();
    await t.service.requestChange('u1', dto());
    const data = t.prisma.emailChangeRequest.create.mock.calls[0][0].data;
    expect(data.newEmail).toBe('new@example.com');
    expect(data.userId).toBe('u1');
    const [to, secret] = t.email.sendEmailChangeVerifyEmail.mock.calls[0];
    expect(to).toBe('new@example.com');
    expect(data.tokenHash).toBe(sha(secret));
    expect(data.tokenHash).not.toBe(secret);
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 47 * 3_600_000);
    expect(t.email.sendEmailChangeNoticeEmail).toHaveBeenCalledWith('old@example.com');
    // Nothing on User changes until the link is used.
    expect(t.prisma.user.update).not.toHaveBeenCalled();
  });

  it('replaces any earlier pending request in the same transaction (its link stops working)', async () => {
    const t = build();
    await t.service.requestChange('u1', dto());
    expect(t.prisma.emailChangeRequest.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', usedAt: null } });
    const del = t.prisma.emailChangeRequest.deleteMany.mock.invocationCallOrder[0];
    const create = t.prisma.emailChangeRequest.create.mock.invocationCallOrder[0];
    expect(del).toBeLessThan(create);
  });

  it('a wrong password is a coded 403 wrong_password, keeps its limiter slot and stores nothing', async () => {
    const t = build();
    t.passwordService.verify.mockResolvedValueOnce(false);
    const err = await t.service.requestChange('u1', dto()).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({ statusCode: 403, code: 'wrong_password' });
    expect(t.limiter.reserve).toHaveBeenCalledTimes(1);
    expect(t.limiter.release).not.toHaveBeenCalled();
    expect(t.prisma.emailChangeRequest.create).not.toHaveBeenCalled();
    expect(t.email.sendEmailChangeVerifyEmail).not.toHaveBeenCalled();
    expect(t.email.sendEmailChangeNoticeEmail).not.toHaveBeenCalled();
  });

  it('takes the limiter slot BEFORE the password is checked, and a spent budget stops it before any check', async () => {
    const t = build();
    t.limiter.reserve.mockRejectedValueOnce(new AuthLimitExceeded(120));
    await expect(t.service.requestChange('u1', dto())).rejects.toBeInstanceOf(AuthLimitExceeded);
    expect(t.passwordService.verify).not.toHaveBeenCalled();
  });

  it('a since-deleted account behind a valid token is a 401', async () => {
    const t = build({ user: null });
    await expect(t.service.requestChange('u1', dto())).rejects.toBeInstanceOf(UnauthorizedException);
    expect(t.limiter.reserve).not.toHaveBeenCalled();
  });

  describe('two-factor', () => {
    it('is required when it is on: coded 403 two_factor_required, the slot is given back, nothing stored', async () => {
      const t = build({ twoFactor: true });
      const err = await t.service.requestChange('u1', dto()).catch((e) => e);
      expect(err.getResponse()).toMatchObject({ statusCode: 403, code: 'two_factor_required' });
      expect(t.limiter.release).toHaveBeenCalledTimes(1);
      expect(t.twoFactor.assertUserCode).not.toHaveBeenCalled();
      expect(t.prisma.emailChangeRequest.create).not.toHaveBeenCalled();
    });

    it('a blank code counts as missing', async () => {
      const t = build({ twoFactor: true });
      const err = await t.service.requestChange('u1', dto({ twoFactorCode: '   ' })).catch((e) => e);
      expect(err.getResponse()).toMatchObject({ code: 'two_factor_required' });
    });

    it('a wrong code is a coded 403 two_factor_invalid, nothing stored', async () => {
      const t = build({ twoFactor: true });
      t.twoFactor.assertUserCode.mockRejectedValueOnce(new UnauthorizedException('x'));
      const err = await t.service.requestChange('u1', dto({ twoFactorCode: '123456' })).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.getResponse()).toMatchObject({ statusCode: 403, code: 'two_factor_invalid' });
      expect(t.prisma.emailChangeRequest.create).not.toHaveBeenCalled();
    });

    it('the per-account code lock (a 429) passes through untouched', async () => {
      const t = build({ twoFactor: true });
      const lock = new CodeEntryLockedException(900);
      t.twoFactor.assertUserCode.mockRejectedValueOnce(lock);
      await expect(t.service.requestChange('u1', dto({ twoFactorCode: '123456' }))).rejects.toBe(lock);
    });

    it('a valid code goes through the shared sign-in check and the request is stored', async () => {
      const t = build({ twoFactor: true });
      await t.service.requestChange('u1', dto({ twoFactorCode: '123456' }));
      expect(t.twoFactor.assertUserCode).toHaveBeenCalledWith('u1', '123456');
      expect(t.prisma.emailChangeRequest.create).toHaveBeenCalledTimes(1);
    });

    it('is not asked for when the account has none', async () => {
      const t = build({ twoFactor: false });
      await t.service.requestChange('u1', dto());
      expect(t.twoFactor.assertUserCode).not.toHaveBeenCalled();
    });
  });

  describe('every unusable address is the ONE identical email_change_not_accepted', () => {
    const cases: Array<[string, Parameters<typeof build>[0], string]> = [
      ['not an address', {}, 'not-an-address'],
      ['an empty address', {}, '   '],
      ['too long', {}, `${'a'.repeat(250)}@example.com`],
      ['the same as the current address (any case)', {}, ' OLD@Example.com '],
      ['already used by someone', { taken: true }, 'someone@example.com'],
      [
        "a minor's guardian address",
        { user: { id: 'u1', email: 'old@example.com', passwordHash: 'h', isMinor: true }, guardian: { email: 'Parent@Example.com', consentStatus: 'confirmed' } },
        'parent@example.com',
      ],
    ];
    it.each(cases)('%s', async (_name, opts, address) => {
      const t = build(opts);
      const err = await t.service.requestChange('u1', dto({ newEmail: address })).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.getResponse()).toEqual({
        statusCode: 400,
        error: 'Bad Request',
        code: 'email_change_not_accepted',
        message: 'That email address cannot be used.',
      });
      expect(t.prisma.emailChangeRequest.create).not.toHaveBeenCalled();
      expect(t.email.sendEmailChangeVerifyEmail).not.toHaveBeenCalled();
      expect(t.email.sendEmailChangeNoticeEmail).not.toHaveBeenCalled();
      // A not-accepted attempt spends the failed-attempt budget again (released once after the password, reserved
      // again here), so asking about addresses is rate-limited like guessing passwords.
      expect(t.limiter.reserve).toHaveBeenCalledTimes(2);
    });

    it('the bodies of two different reasons are byte-identical', async () => {
      const a = await build({ taken: true }).service.requestChange('u1', dto({ newEmail: 'x@example.com' })).catch((e) => e);
      const b = await build().service.requestChange('u1', dto({ newEmail: 'nonsense' })).catch((e) => e);
      expect(JSON.stringify(a.getResponse())).toBe(JSON.stringify(b.getResponse()));
      expect(a.getStatus()).toBe(b.getStatus());
    });

    it('a minor with a different guardian address is accepted', async () => {
      const t = build({
        user: { id: 'u1', email: 'old@example.com', passwordHash: 'h', isMinor: true },
        guardian: { email: 'parent@example.com', consentStatus: 'confirmed' },
      });
      await t.service.requestChange('u1', dto());
      expect(t.prisma.emailChangeRequest.create).toHaveBeenCalledTimes(1);
    });
  });

  it('with no usable link base the request is discarded and the answer is a 503, the same for every address', async () => {
    const t = build();
    t.email.sendEmailChangeVerifyEmail.mockResolvedValueOnce(false);
    await expect(t.service.requestChange('u1', dto())).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(t.prisma.emailChangeRequest.deleteMany).toHaveBeenLastCalledWith({ where: { id: 'req1' } });
    expect(t.email.sendEmailChangeNoticeEmail).not.toHaveBeenCalled();
  });

  it('a notice that fails to send never fails the request', async () => {
    const t = build();
    t.email.sendEmailChangeNoticeEmail.mockRejectedValueOnce(new Error('postmark down'));
    await expect(t.service.requestChange('u1', dto())).resolves.toBeUndefined();
  });
});

describe('EmailChangeService.confirmChange', () => {
  const future = () => new Date(Date.now() + 3_600_000);
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'req1',
    userId: 'u1',
    newEmail: 'new@example.com',
    tokenHash: sha('secret-secret-secret'),
    expiresAt: future(),
    usedAt: null,
    ...over,
  });
  const invalid = { statusCode: 400, code: 'email_change_link_invalid' };

  it('looks the link up by the HASH of the secret', async () => {
    const t = build();
    t.prisma.emailChangeRequest.findUnique.mockResolvedValue(row());
    await t.service.confirmChange('secret-secret-secret');
    expect(t.prisma.emailChangeRequest.findUnique).toHaveBeenCalledWith({ where: { tokenHash: sha('secret-secret-secret') } });
  });

  it('sets the address, marks the request used, ends every session; no guardian notice for an adult', async () => {
    const t = build();
    t.prisma.emailChangeRequest.findUnique.mockResolvedValue(row());
    await t.service.confirmChange('secret-secret-secret');
    expect(t.prisma.emailChangeRequest.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'req1', usedAt: null }, data: { usedAt: expect.any(Date) } });
    expect(t.prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { email: 'new@example.com', verificationStatus: 'verified' } });
    expect(t.tokenService.revokeAllSessionsForUser).toHaveBeenCalledWith('u1');
    expect(t.guardianNotices.notifyInBackground).not.toHaveBeenCalled();
  });

  it('for a minor with a confirmed guardian, fires the email_changed event after the change', async () => {
    const t = build({
      user: { id: 'u1', email: 'old@example.com', passwordHash: 'h', isMinor: true, accountStatus: 'active' },
      guardian: { email: 'parent@example.com', consentStatus: 'confirmed' },
    });
    t.prisma.emailChangeRequest.findUnique.mockResolvedValue(row());
    await t.service.confirmChange('secret-secret-secret');
    expect(t.guardianNotices.notifyInBackground).toHaveBeenCalledWith('u1', 'email_changed');
    expect(t.prisma.user.update.mock.invocationCallOrder[0]).toBeLessThan(t.guardianNotices.notifyInBackground.mock.invocationCallOrder[0]);
  });

  it.each([
    ['an unknown link', null],
    ['an already used link', row({ usedAt: new Date() })],
    ['an expired link', row({ expiresAt: new Date(Date.now() - 1000) })],
  ])('%s is the coded 400 and changes nothing', async (_n, found) => {
    const t = build();
    t.prisma.emailChangeRequest.findUnique.mockResolvedValue(found);
    const err = await t.service.confirmChange('secret-secret-secret').catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject(invalid);
    expect(t.prisma.user.update).not.toHaveBeenCalled();
    expect(t.tokenService.revokeAllSessionsForUser).not.toHaveBeenCalled();
    expect(t.guardianNotices.notifyInBackground).not.toHaveBeenCalled();
  });

  it('losing the single-use claim (a second simultaneous click) is the same coded 400', async () => {
    const t = build();
    t.prisma.emailChangeRequest.findUnique.mockResolvedValue(row());
    t.prisma.emailChangeRequest.updateMany.mockResolvedValueOnce({ count: 0 });
    const err = await t.service.confirmChange('secret-secret-secret').catch((e) => e);
    expect(err.getResponse()).toMatchObject(invalid);
    expect(t.prisma.user.update).not.toHaveBeenCalled();
  });

  it('an address taken in the meantime (unique violation) is the same coded 400 and ends no session', async () => {
    const t = build();
    t.prisma.emailChangeRequest.findUnique.mockResolvedValue(row());
    t.prisma.user.update.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    const err = await t.service.confirmChange('secret-secret-secret').catch((e) => e);
    expect(err.getResponse()).toMatchObject(invalid);
    expect(t.tokenService.revokeAllSessionsForUser).not.toHaveBeenCalled();
  });

  it('any other database error is NOT swallowed', async () => {
    const t = build();
    t.prisma.emailChangeRequest.findUnique.mockResolvedValue(row());
    t.prisma.user.update.mockRejectedValueOnce(new Error('connection lost'));
    await expect(t.service.confirmChange('secret-secret-secret')).rejects.toThrow('connection lost');
  });

  it.each([
    ['a deactivated account', { id: 'u1', email: 'o@e.com', passwordHash: 'h', isMinor: false, accountStatus: 'deactivated' }, undefined],
    ['a vanished account', null, undefined],
    [
      'a minor whose consent is no longer confirmed',
      { id: 'u1', email: 'o@e.com', passwordHash: 'h', isMinor: true, accountStatus: 'active' },
      { email: 'parent@example.com', consentStatus: 'declined' },
    ],
    ['a minor with no guardian row', { id: 'u1', email: 'o@e.com', passwordHash: 'h', isMinor: true, accountStatus: 'active' }, null],
    [
      "a minor whose guardian's address became the new address",
      { id: 'u1', email: 'o@e.com', passwordHash: 'h', isMinor: true, accountStatus: 'active' },
      { email: 'NEW@example.com', consentStatus: 'confirmed' },
    ],
  ] as Array<[string, User | null, { email: string; consentStatus: string } | null | undefined]>)(
    'refuses (same coded 400, nothing changes) for %s',
    async (_n, user, guardian) => {
      const t = build({ user, guardian });
      t.prisma.emailChangeRequest.findUnique.mockResolvedValue(row());
      const err = await t.service.confirmChange('secret-secret-secret').catch((e) => e);
      expect(err.getResponse()).toMatchObject(invalid);
      expect(t.prisma.user.update).not.toHaveBeenCalled();
      expect(t.tokenService.revokeAllSessionsForUser).not.toHaveBeenCalled();
      expect(t.guardianNotices.notifyInBackground).not.toHaveBeenCalled();
    },
  );
});
