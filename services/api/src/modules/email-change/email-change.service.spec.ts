import { BadRequestException, ForbiddenException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { AuthLimitExceeded } from '../auth/rate-limit/auth-limits/auth-limits.service';
import { CodeEntryLockedException } from '../two-factor/two-factor-attempt.limiter';
import { EmailChangeService } from './email-change.service';

// backend/email-change (B-059; reworked by Decision Log #476). Every branch of the request and the confirmation, with
// mocked collaborators. The real database behaviours (single use, the transaction, the cascade) are covered by
// test/email-change.e2e-spec.ts.
//
// The address is dealt with AFTER the response, in the background, so every test of what an address causes awaits
// service.whenIdle() first.

type User = { id: string; email: string; passwordHash: string; isMinor: boolean; accountStatus?: string };

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function build(
  opts: {
    user?: User | null;
    taken?: { email: string } | boolean;
    guardian?: { email: string; consentStatus: string } | null;
    twoFactor?: boolean;
    baseUrlUsable?: boolean;
  } = {},
) {
  const user: User | null =
    opts.user === undefined ? { id: 'u1', email: 'old@example.com', passwordHash: 'h', isMinor: false, accountStatus: 'active' } : opts.user;
  const takenRow = opts.taken === true ? { id: 'other', email: 'someone@example.com' } : opts.taken ? { id: 'other', ...opts.taken } : null;
  const prisma: any = {
    user: {
      findUnique: jest.fn(async () => user),
      findFirst: jest.fn(async () => takenRow),
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
    isWebAppBaseUrlUsable: jest.fn(() => opts.baseUrlUsable ?? true),
    sendEmailChangeVerifyEmail: jest.fn(async (..._args: string[]) => true),
    sendEmailChangeNoticeEmail: jest.fn(async (..._args: string[]) => undefined),
    sendEmailChangeUnavailableEmail: jest.fn(async (..._args: string[]) => undefined),
  };
  const guardianNotices = { notifyInBackground: jest.fn() };
  const limiter = {
    reserve: jest.fn(async () => undefined),
    release: jest.fn(async () => undefined),
    reserveRequest: jest.fn(async () => undefined),
    claimRecipientSlot: jest.fn(async (_to: string) => true),
  };
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

// Runs the request and lets the background step finish.
async function request(t: ReturnType<typeof build>, body: never = dto()) {
  const result = await t.service.requestChange('u1', body);
  await t.service.whenIdle();
  return result;
}

describe('EmailChangeService.requestChange', () => {
  it('stores a HASH of the secret, mails the link to the NEW address and the notice to the OLD one', async () => {
    const t = build();
    await request(t);
    const data = t.prisma.emailChangeRequest.create.mock.calls[0][0].data;
    expect(data.newEmail).toBe('new@example.com');
    expect(data.userId).toBe('u1');
    const [to, secret] = t.email.sendEmailChangeVerifyEmail.mock.calls[0];
    expect(to).toBe('new@example.com');
    expect(data.tokenHash).toBe(sha(secret));
    expect(data.tokenHash).not.toBe(secret);
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 47 * 3_600_000);
    expect(t.email.sendEmailChangeNoticeEmail).toHaveBeenCalledWith('old@example.com');
    expect(t.email.sendEmailChangeUnavailableEmail).not.toHaveBeenCalled();
    // Nothing on User changes until the link is used.
    expect(t.prisma.user.update).not.toHaveBeenCalled();
  });

  it('replaces any earlier pending request in the same transaction (its link stops working)', async () => {
    const t = build();
    await request(t);
    expect(t.prisma.emailChangeRequest.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', usedAt: null } });
    const del = t.prisma.emailChangeRequest.deleteMany.mock.invocationCallOrder[0];
    const create = t.prisma.emailChangeRequest.create.mock.invocationCallOrder[0];
    expect(del).toBeLessThan(create);
  });

  it('a wrong password is a coded 403 wrong_password, keeps its limiter slot and stores or sends nothing', async () => {
    const t = build();
    t.passwordService.verify.mockResolvedValueOnce(false);
    const err = await request(t).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({ statusCode: 403, code: 'wrong_password' });
    expect(t.limiter.reserve).toHaveBeenCalledTimes(1);
    expect(t.limiter.release).not.toHaveBeenCalled();
    // A wrong password is bounded by its own budget, not by the request cap.
    expect(t.limiter.reserveRequest).not.toHaveBeenCalled();
    expect(t.prisma.emailChangeRequest.create).not.toHaveBeenCalled();
    expect(t.email.sendEmailChangeVerifyEmail).not.toHaveBeenCalled();
    expect(t.email.sendEmailChangeNoticeEmail).not.toHaveBeenCalled();
  });

  it('takes the wrong-password slot BEFORE the password is checked, and a spent budget stops it before any check', async () => {
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
      const err = await request(t).catch((e) => e);
      expect(err.getResponse()).toMatchObject({ statusCode: 403, code: 'two_factor_required' });
      expect(t.limiter.release).toHaveBeenCalledTimes(1);
      expect(t.limiter.reserveRequest).not.toHaveBeenCalled();
      expect(t.twoFactor.assertUserCode).not.toHaveBeenCalled();
      expect(t.prisma.emailChangeRequest.create).not.toHaveBeenCalled();
    });

    it('a blank code counts as missing', async () => {
      const t = build({ twoFactor: true });
      const err = await request(t, dto({ twoFactorCode: '   ' })).catch((e) => e);
      expect(err.getResponse()).toMatchObject({ code: 'two_factor_required' });
    });

    it('a wrong code is a coded 403 two_factor_invalid, nothing stored', async () => {
      const t = build({ twoFactor: true });
      t.twoFactor.assertUserCode.mockRejectedValueOnce(new UnauthorizedException('x'));
      const err = await request(t, dto({ twoFactorCode: '123456' })).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.getResponse()).toMatchObject({ statusCode: 403, code: 'two_factor_invalid' });
      expect(t.prisma.emailChangeRequest.create).not.toHaveBeenCalled();
    });

    it('the per-account code lock (a 429) passes through untouched', async () => {
      const t = build({ twoFactor: true });
      const lock = new CodeEntryLockedException(900);
      t.twoFactor.assertUserCode.mockRejectedValueOnce(lock);
      await expect(request(t, dto({ twoFactorCode: '123456' }))).rejects.toBe(lock);
    });

    it('a valid code goes through the shared sign-in check and the request is stored', async () => {
      const t = build({ twoFactor: true });
      await request(t, dto({ twoFactorCode: '123456' }));
      expect(t.twoFactor.assertUserCode).toHaveBeenCalledWith('u1', '123456');
      expect(t.prisma.emailChangeRequest.create).toHaveBeenCalledTimes(1);
    });

    it('is not asked for when the account has none', async () => {
      const t = build({ twoFactor: false });
      await request(t);
      expect(t.twoFactor.assertUserCode).not.toHaveBeenCalled();
    });
  });

  // Decision Log #476: the answer no longer depends on the address; only the emails do.
  describe('what each kind of address causes (all of them answer the same 202 first)', () => {
    const minor = { id: 'u1', email: 'old@example.com', passwordHash: 'h', isMinor: true };

    it('a usable address: the confirm link to it, the notice to the old address, and nothing else', async () => {
      const t = build();
      await request(t, dto({ newEmail: 'fresh@example.com' }));
      expect(t.email.sendEmailChangeVerifyEmail).toHaveBeenCalledTimes(1);
      expect(t.email.sendEmailChangeNoticeEmail).toHaveBeenCalledTimes(1);
      expect(t.email.sendEmailChangeUnavailableEmail).not.toHaveBeenCalled();
      expect(t.prisma.emailChangeRequest.create).toHaveBeenCalledTimes(1);
    });

    it('an address that belongs to an account: the "cannot be used" email goes to it, with NO link and no request row', async () => {
      const t = build({ taken: { email: 'Someone@Example.com' } });
      await request(t, dto({ newEmail: 'someone@example.com' }));
      // Sent to the address as it is registered, and nothing but the address is passed (no token, no requester).
      expect(t.email.sendEmailChangeUnavailableEmail.mock.calls).toEqual([['Someone@Example.com']]);
      expect(t.email.sendEmailChangeVerifyEmail).not.toHaveBeenCalled();
      expect(t.prisma.emailChangeRequest.create).not.toHaveBeenCalled();
      expect(t.prisma.emailChangeRequest.deleteMany).not.toHaveBeenCalled();
      // The current address is still told a request was made.
      expect(t.email.sendEmailChangeNoticeEmail).toHaveBeenCalledWith('old@example.com');
    });

    const sendNothingToTheNewAddress: Array<[string, Parameters<typeof build>[0], string]> = [
      ['not an address', {}, 'not-an-address'],
      ['an empty address', {}, '   '],
      ['too long', {}, `${'a'.repeat(250)}@example.com`],
      ['the same as the current address (any case)', {}, ' OLD@Example.com '],
      [
        "a minor's guardian address",
        { user: minor, guardian: { email: 'Parent@Example.com', consentStatus: 'confirmed' } },
        'parent@example.com',
      ],
      [
        "a minor's guardian address even when it also belongs to an account",
        { user: minor, guardian: { email: 'Parent@Example.com', consentStatus: 'confirmed' }, taken: true },
        'parent@example.com',
      ],
    ];
    it.each(sendNothingToTheNewAddress)('%s: nothing is sent to the new address, nothing stored, the old address still gets the notice', async (_n, opts, address) => {
      const t = build(opts);
      await request(t, dto({ newEmail: address }));
      expect(t.email.sendEmailChangeVerifyEmail).not.toHaveBeenCalled();
      expect(t.email.sendEmailChangeUnavailableEmail).not.toHaveBeenCalled();
      expect(t.prisma.emailChangeRequest.create).not.toHaveBeenCalled();
      expect(t.email.sendEmailChangeNoticeEmail).toHaveBeenCalledWith('old@example.com');
    });

    it('the notice to the old address never contains the new address', async () => {
      const t = build();
      await request(t, dto({ newEmail: 'secret-new@example.com' }));
      expect(t.email.sendEmailChangeNoticeEmail.mock.calls).toEqual([['old@example.com']]);
    });

    it('a minor with a different guardian address gets the normal flow', async () => {
      const t = build({ user: minor, guardian: { email: 'parent@example.com', consentStatus: 'confirmed' } });
      await request(t);
      expect(t.prisma.emailChangeRequest.create).toHaveBeenCalledTimes(1);
    });
  });

  it('answers with the SAME resolved value for a taken, a malformed, a same-as-current and a usable address', async () => {
    const answers = [];
    for (const [newEmail, opts] of [
      ['fresh@example.com', {}],
      ['someone@example.com', { taken: true }],
      ['nonsense', {}],
      ['old@example.com', {}],
    ] as const) {
      const t = build(opts);
      answers.push(await t.service.requestChange('u1', dto({ newEmail })));
      await t.service.whenIdle();
    }
    expect(answers.every((a) => a === undefined)).toBe(true);
  });

  it('the request path does the same work whatever the address is (every lookup waits until after the response)', async () => {
    for (const [newEmail, opts] of [
      ['fresh@example.com', {}],
      ['someone@example.com', { taken: true }],
      ['nonsense', {}],
    ] as const) {
      const t = build(opts);
      // Hold the background step back; the request must already have returned.
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      t.limiter.claimRecipientSlot.mockImplementation(async () => {
        await gate;
        return true;
      });
      await t.service.requestChange('u1', dto({ newEmail }));
      expect(t.prisma.user.findFirst).not.toHaveBeenCalled();
      expect(t.prisma.emailChangeRequest.create).not.toHaveBeenCalled();
      expect(t.email.sendEmailChangeNoticeEmail).not.toHaveBeenCalled();
      release();
      await t.service.whenIdle();
    }
  });

  describe('limits', () => {
    it('the request cap is counted on EVERY outcome, after identity is proven', async () => {
      for (const [newEmail, opts] of [
        ['fresh@example.com', {}],
        ['someone@example.com', { taken: true }],
        ['nonsense', {}],
        ['old@example.com', {}],
      ] as const) {
        const t = build(opts);
        await request(t, dto({ newEmail }));
        expect(t.limiter.reserveRequest).toHaveBeenCalledWith('u1');
      }
    });

    it('a not-accepted address no longer spends the wrong-password budget (it is reserved once, released once)', async () => {
      const t = build({ taken: true });
      await request(t, dto({ newEmail: 'someone@example.com' }));
      expect(t.limiter.reserve).toHaveBeenCalledTimes(1);
      expect(t.limiter.release).toHaveBeenCalledTimes(1);
    });

    it('a spent request cap is a 429 (AuthLimitExceeded, so the controller sends Retry-After) and nothing is sent or stored', async () => {
      const t = build();
      t.limiter.reserveRequest.mockRejectedValueOnce(new AuthLimitExceeded(1800));
      const err = await request(t).catch((e) => e);
      expect(err).toBeInstanceOf(AuthLimitExceeded);
      expect(err.retryAfterSeconds).toBe(1800);
      expect(t.email.sendEmailChangeNoticeEmail).not.toHaveBeenCalled();
      expect(t.prisma.emailChangeRequest.create).not.toHaveBeenCalled();
    });

    it('a recipient over its 24-hour share is skipped silently: no email, no row, and the response is unchanged', async () => {
      const t = build();
      t.limiter.claimRecipientSlot.mockImplementation(async (to: string) => to !== 'new@example.com');
      await expect(request(t)).resolves.toBeUndefined();
      expect(t.email.sendEmailChangeVerifyEmail).not.toHaveBeenCalled();
      // Skipped BEFORE the row is made, so an earlier pending request is not replaced by a dead one.
      expect(t.prisma.emailChangeRequest.deleteMany).not.toHaveBeenCalled();
      expect(t.prisma.emailChangeRequest.create).not.toHaveBeenCalled();
      // The old address is a different recipient with its own share.
      expect(t.email.sendEmailChangeNoticeEmail).toHaveBeenCalledTimes(1);
    });

    it('an over-share "taken" address and an over-share old address are skipped the same way', async () => {
      const t = build({ taken: { email: 'someone@example.com' } });
      t.limiter.claimRecipientSlot.mockResolvedValue(false);
      await expect(request(t, dto({ newEmail: 'someone@example.com' }))).resolves.toBeUndefined();
      expect(t.email.sendEmailChangeUnavailableEmail).not.toHaveBeenCalled();
      expect(t.email.sendEmailChangeNoticeEmail).not.toHaveBeenCalled();
    });

    it('each recipient claim names the address it is for', async () => {
      const t = build();
      await request(t, dto({ newEmail: 'fresh@example.com' }));
      expect(t.limiter.claimRecipientSlot.mock.calls.map((c) => c[0]).sort()).toEqual(['fresh@example.com', 'old@example.com']);
    });
  });

  describe('configuration', () => {
    it('an unusable WEB_APP_BASE_URL is a 503 decided before any lookup, the same for every address', async () => {
      for (const [newEmail, opts] of [
        ['fresh@example.com', {}],
        ['someone@example.com', { taken: true }],
        ['nonsense', {}],
      ] as const) {
        const t = build({ ...opts, baseUrlUsable: false });
        const err = await t.service.requestChange('u1', dto({ newEmail })).catch((e) => e);
        expect(err).toBeInstanceOf(ServiceUnavailableException);
        expect(err.getResponse()).toMatchObject({ statusCode: 503, code: 'email_change_unavailable' });
        // Before ANY lookup: not even the account, the password or a limiter slot.
        expect(t.prisma.user.findUnique).not.toHaveBeenCalled();
        expect(t.prisma.user.findFirst).not.toHaveBeenCalled();
        expect(t.prisma.guardian.findUnique).not.toHaveBeenCalled();
        expect(t.passwordService.verify).not.toHaveBeenCalled();
        expect(t.limiter.reserve).not.toHaveBeenCalled();
        expect(t.limiter.reserveRequest).not.toHaveBeenCalled();
        expect(t.email.sendEmailChangeNoticeEmail).not.toHaveBeenCalled();
      }
    });

    it('if the link cannot be built after all, the row is discarded and nothing reaches the caller', async () => {
      const t = build();
      t.email.sendEmailChangeVerifyEmail.mockResolvedValueOnce(false);
      await expect(request(t)).resolves.toBeUndefined();
      expect(t.prisma.emailChangeRequest.deleteMany).toHaveBeenLastCalledWith({ where: { id: 'req1' } });
    });
  });

  describe('background failures never reach the caller', () => {
    it('a notice that fails to send does not fail the request or stop the confirm link', async () => {
      const t = build();
      t.email.sendEmailChangeNoticeEmail.mockRejectedValueOnce(new Error('postmark down'));
      await expect(request(t)).resolves.toBeUndefined();
      expect(t.email.sendEmailChangeVerifyEmail).toHaveBeenCalledTimes(1);
    });

    it('a database failure in the address step does not fail the request, and the notice still went', async () => {
      const t = build();
      t.prisma.user.findFirst.mockRejectedValueOnce(new Error('db down'));
      await expect(request(t)).resolves.toBeUndefined();
      expect(t.email.sendEmailChangeNoticeEmail).toHaveBeenCalledTimes(1);
      expect(t.email.sendEmailChangeVerifyEmail).not.toHaveBeenCalled();
    });

    it('whenIdle resolves even when a step failed', async () => {
      const t = build();
      t.limiter.claimRecipientSlot.mockRejectedValue(new Error('redis down'));
      await t.service.requestChange('u1', dto());
      await expect(t.service.whenIdle()).resolves.toBeUndefined();
    });
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
