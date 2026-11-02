import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ADMIN_ACTION_LOG_ACTIONS } from '../admin-action-log/admin-action-log.constants';
import {
  GUARDIAN_NOTICES_ALREADY_WITHHELD_CODE,
  GUARDIAN_NOTICES_NOT_APPLICABLE_CODE,
  GUARDIAN_NOTICES_NOT_WITHHELD_CODE,
  GUARDIAN_NOTICES_TEXT_INVALID_CODE,
  WITHHOLD_REVIEW_DUE_DAYS,
} from '../guardian-security-notice/guardian-notice-withhold.constants';
import { AdminGuardianNoticesService } from './admin-guardian-notices.service';

const T0 = new Date('2026-11-01T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const REASON = 'Safeguarding concern about the home. Staff are supporting the child directly.';

interface Row {
  userId: string;
  setByAdmin: { id: string; fullName: string };
  reason: string;
  setAt: Date;
  lastReviewedAt: Date | null;
  lastReviewNote: string | null;
}

function build(opts: { user?: { id: string; isMinor: boolean; accountStatus: string } | null; row?: Row | null } = {}) {
  const clock = { current: T0.getTime(), now: () => new Date(clock.current) };
  const user = opts.user === undefined ? { id: 'minor-1', isMinor: true, accountStatus: 'active' } : opts.user;
  let row: Row | null = opts.row ?? null;
  const logs: Array<{ data: Record<string, unknown> }> = [];
  const recoveryUpdates: unknown[] = [];

  const tx = {
    user: { findUnique: jest.fn(async () => user) },
    guardianNoticeWithhold: {
      findUnique: jest.fn(async () => row),
      create: jest.fn(async ({ data }: { data: { userId: string; reason: string; setAt: Date } }) => {
        row = {
          userId: data.userId,
          setByAdmin: { id: 'admin-1', fullName: 'Dana Admin' },
          reason: data.reason,
          setAt: data.setAt,
          lastReviewedAt: null,
          lastReviewNote: null,
        };
        return row;
      }),
      deleteMany: jest.fn(async () => {
        const count = row ? 1 : 0;
        row = null;
        return { count };
      }),
      updateMany: jest.fn(async ({ data }: { data: { lastReviewedAt: Date; lastReviewNote: string } }) => {
        if (!row) return { count: 0 };
        row = { ...row, ...data };
        return { count: 1 };
      }),
      findUniqueOrThrow: jest.fn(async () => row as Row),
    },
    twoFactorRecoveryRequest: {
      updateMany: jest.fn(async (arg: unknown) => {
        recoveryUpdates.push(arg);
        return { count: 2 };
      }),
    },
    adminActionLog: { create: jest.fn(async (arg: { data: Record<string, unknown> }) => logs.push(arg)) },
  };
  const prisma = {
    user: tx.user,
    guardianNoticeWithhold: tx.guardianNoticeWithhold,
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
  };
  const service = new AdminGuardianNoticesService(prisma as never, clock);
  return { service, clock, tx, prisma, logs, recoveryUpdates, get row() { return row; } };
}

const rejects = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as Error & { getResponse?: () => Record<string, unknown> });

describe('AdminGuardianNoticesService (B-280, Decision Log #458)', () => {
  describe('withhold', () => {
    it('creates the row, cancels active guardian recovery requests and logs the reason, all in ONE transaction', async () => {
      const t = build();

      const state = await t.service.withhold('minor-1', 'admin-1', `  ${REASON}  `);

      expect(t.prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(t.tx.guardianNoticeWithhold.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { userId: 'minor-1', setByAdminId: 'admin-1', reason: REASON, setAt: T0 } }),
      );
      // Only guardian-kind requests that are still active are cancelled (the adult flow is not touched).
      expect(t.recoveryUpdates).toEqual([
        { where: { userId: 'minor-1', kind: 'guardian', state: { in: ['pending', 'waiting'] } }, data: { state: 'cancelled', doneAt: T0 } },
      ]);
      expect(t.logs).toHaveLength(1);
      expect(t.logs[0].data).toMatchObject({
        adminId: 'admin-1',
        action: ADMIN_ACTION_LOG_ACTIONS.USER_GUARDIAN_NOTICES_WITHHELD,
        targetType: 'user',
        targetId: 'minor-1',
      });
      expect(String(t.logs[0].data.notes)).toContain(REASON);
      expect(state).toMatchObject({
        withheld: true,
        reason: REASON,
        setAt: T0.toISOString(),
        setBy: { id: 'admin-1', displayName: 'Dana Admin' },
        lastReviewedAt: null,
        lastReviewNote: null,
        reviewDue: false,
      });
    });

    it('works for a minor with no confirmed guardian (the flag simply has no effect until one is confirmed)', async () => {
      // The service never looks at the Guardian row: its select is { id, isMinor, accountStatus } only.
      const t = build();
      await expect(t.service.withhold('minor-1', 'admin-1', REASON)).resolves.toMatchObject({ withheld: true });
      expect(t.tx.user.findUnique).toHaveBeenCalledWith({ where: { id: 'minor-1' }, select: { id: true, isMinor: true, accountStatus: true } });
    });

    it('404 for an unknown user', async () => {
      const t = build({ user: null });
      expect(await rejects(t.service.withhold('nobody', 'admin-1', REASON))).toBeInstanceOf(NotFoundException);
      expect(t.logs).toHaveLength(0);
    });

    it.each([
      ['an adult', { id: 'a', isMinor: false, accountStatus: 'active' }],
      ['an anonymised account', { id: 'a', isMinor: true, accountStatus: 'deleted' }],
    ])('409 guardian_notices_not_applicable for %s, and nothing is written', async (_n, user) => {
      const t = build({ user });
      const err = await rejects(t.service.withhold('a', 'admin-1', REASON));
      expect(err).toBeInstanceOf(ConflictException);
      expect(err?.getResponse?.()).toMatchObject({ code: GUARDIAN_NOTICES_NOT_APPLICABLE_CODE });
      expect(t.tx.guardianNoticeWithhold.create).not.toHaveBeenCalled();
      expect(t.logs).toHaveLength(0);
    });

    it('409 guardian_notices_already_withheld when it is already on, and nothing is written', async () => {
      const t = build();
      await t.service.withhold('minor-1', 'admin-1', REASON);
      t.logs.length = 0;
      t.recoveryUpdates.length = 0;

      const err = await rejects(t.service.withhold('minor-1', 'admin-2', REASON));

      expect(err?.getResponse?.()).toMatchObject({ code: GUARDIAN_NOTICES_ALREADY_WITHHELD_CODE });
      expect(t.logs).toHaveLength(0);
      expect(t.recoveryUpdates).toHaveLength(0);
    });

    it('409 already_withheld (not a 500) when another admin wins the race on the unique index', async () => {
      const t = build();
      t.tx.guardianNoticeWithhold.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
      );
      const err = await rejects(t.service.withhold('minor-1', 'admin-1', REASON));
      expect(err?.getResponse?.()).toMatchObject({ code: GUARDIAN_NOTICES_ALREADY_WITHHELD_CODE });
    });

    it.each([
      ['empty', ''],
      ['only spaces', ' '.repeat(40)],
      ['9 characters', '123456789'],
      ['9 characters padded with spaces', '   123456789   '],
      ['1001 characters', 'x'.repeat(1001)],
    ])('400 guardian_notices_text_invalid for a reason that is %s, before anything is read or written', async (_n, reason) => {
      const t = build();
      const err = await rejects(t.service.withhold('minor-1', 'admin-1', reason));
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err?.getResponse?.()).toMatchObject({ code: GUARDIAN_NOTICES_TEXT_INVALID_CODE });
      expect(t.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('accepts exactly 10 and exactly 1000 characters (after trimming)', async () => {
      await expect(build().service.withhold('minor-1', 'admin-1', '1234567890')).resolves.toMatchObject({ withheld: true });
      await expect(build().service.withhold('minor-1', 'admin-1', ` ${'x'.repeat(1000)} `)).resolves.toMatchObject({ withheld: true });
    });
  });

  describe('getState', () => {
    it('not set: exactly { withheld: false } (no other key)', async () => {
      const t = build();
      expect(await t.service.getState('minor-1')).toEqual({ withheld: false });
    });

    it('404 for an unknown user', async () => {
      const t = build({ user: null });
      expect(await rejects(t.service.getState('nobody'))).toBeInstanceOf(NotFoundException);
    });

    it('set: returns who, when, why, the review fields and when a review is due', async () => {
      const t = build();
      await t.service.withhold('minor-1', 'admin-1', REASON);

      const state = await t.service.getState('minor-1');

      expect(state).toEqual({
        withheld: true,
        setAt: T0.toISOString(),
        setBy: { id: 'admin-1', displayName: 'Dana Admin' },
        reason: REASON,
        lastReviewedAt: null,
        lastReviewNote: null,
        reviewDueAt: new Date(T0.getTime() + WITHHOLD_REVIEW_DUE_DAYS * DAY).toISOString(),
        reviewDue: false,
      });
    });

    it('reviewDue turns true exactly 30 days after the set time (nothing else happens)', async () => {
      const t = build();
      await t.service.withhold('minor-1', 'admin-1', REASON);

      t.clock.current = T0.getTime() + 30 * DAY - 1;
      expect(await t.service.getState('minor-1')).toMatchObject({ reviewDue: false });
      t.clock.current = T0.getTime() + 30 * DAY;
      expect(await t.service.getState('minor-1')).toMatchObject({ reviewDue: true });
      // Still on: there is no automatic expiry.
      t.clock.current = T0.getTime() + 400 * DAY;
      expect(await t.service.getState('minor-1')).toMatchObject({ withheld: true, reviewDue: true });
    });
  });

  describe('review', () => {
    it('records the latest review, restarts the 30 days from the review and logs the note', async () => {
      const t = build();
      await t.service.withhold('minor-1', 'admin-1', REASON);
      t.logs.length = 0;
      t.clock.current = T0.getTime() + 31 * DAY;
      expect(await t.service.getState('minor-1')).toMatchObject({ reviewDue: true });

      const state = await t.service.review('minor-1', 'admin-2', '  Still needed, spoke to the safeguarding lead.  ');

      const reviewedAt = new Date(T0.getTime() + 31 * DAY);
      expect(state).toMatchObject({
        withheld: true,
        lastReviewedAt: reviewedAt.toISOString(),
        lastReviewNote: 'Still needed, spoke to the safeguarding lead.',
        reviewDueAt: new Date(reviewedAt.getTime() + 30 * DAY).toISOString(),
        reviewDue: false,
      });
      expect(t.logs[0].data).toMatchObject({
        adminId: 'admin-2',
        action: ADMIN_ACTION_LOG_ACTIONS.USER_GUARDIAN_NOTICES_REVIEWED,
        targetType: 'user',
        targetId: 'minor-1',
      });
      expect(String(t.logs[0].data.notes)).toContain('Still needed, spoke to the safeguarding lead.');
    });

    it('the admin who set the flag may also review it', async () => {
      const t = build();
      await t.service.withhold('minor-1', 'admin-1', REASON);
      await expect(t.service.review('minor-1', 'admin-1', 'Reviewed by the same admin.')).resolves.toMatchObject({ withheld: true });
    });

    it('only the latest review is kept', async () => {
      const t = build();
      await t.service.withhold('minor-1', 'admin-1', REASON);
      await t.service.review('minor-1', 'admin-1', 'First review note here');
      await t.service.review('minor-1', 'admin-1', 'Second review note here');
      expect(await t.service.getState('minor-1')).toMatchObject({ lastReviewNote: 'Second review note here' });
      expect(t.logs.filter((l) => l.data.action === ADMIN_ACTION_LOG_ACTIONS.USER_GUARDIAN_NOTICES_REVIEWED)).toHaveLength(2);
    });

    it('409 guardian_notices_not_withheld when it is off, and nothing is logged', async () => {
      const t = build();
      const err = await rejects(t.service.review('minor-1', 'admin-1', 'A review note here'));
      expect(err?.getResponse?.()).toMatchObject({ code: GUARDIAN_NOTICES_NOT_WITHHELD_CODE });
      expect(t.logs).toHaveLength(0);
    });

    it('404 for an unknown user; 400 for a short note', async () => {
      expect(await rejects(build({ user: null }).service.review('nobody', 'admin-1', 'A review note here'))).toBeInstanceOf(NotFoundException);
      const err = await rejects(build().service.review('minor-1', 'admin-1', 'short'));
      expect(err?.getResponse?.()).toMatchObject({ code: GUARDIAN_NOTICES_TEXT_INVALID_CODE });
    });
  });

  describe('clear', () => {
    it('deletes the row, logs who set it, when and the clearing reason, and returns { withheld: false }', async () => {
      const t = build();
      await t.service.withhold('minor-1', 'admin-1', REASON);
      t.logs.length = 0;

      const state = await t.service.clear('minor-1', 'admin-2', 'Safeguarding plan has ended.');

      expect(state).toEqual({ withheld: false });
      expect(t.row).toBeNull();
      expect(t.logs).toHaveLength(1);
      expect(t.logs[0].data).toMatchObject({
        adminId: 'admin-2',
        action: ADMIN_ACTION_LOG_ACTIONS.USER_GUARDIAN_NOTICES_CLEARED,
        targetType: 'user',
        targetId: 'minor-1',
      });
      expect(String(t.logs[0].data.notes)).toContain('Safeguarding plan has ended.');
    });

    it('does not bring cancelled recovery requests back: clearing writes to no recovery request at all', async () => {
      const t = build();
      await t.service.withhold('minor-1', 'admin-1', REASON);
      t.recoveryUpdates.length = 0;
      await t.service.clear('minor-1', 'admin-1', 'Safeguarding plan has ended.');
      expect(t.recoveryUpdates).toHaveLength(0);
    });

    it('409 guardian_notices_not_withheld when it is off', async () => {
      const t = build();
      const err = await rejects(t.service.clear('minor-1', 'admin-1', 'Safeguarding plan has ended.'));
      expect(err).toBeInstanceOf(ConflictException);
      expect(err?.getResponse?.()).toMatchObject({ code: GUARDIAN_NOTICES_NOT_WITHHELD_CODE });
      expect(t.logs).toHaveLength(0);
    });

    it('can clear the flag on an account that is no longer a minor (the flag was inert; it is not stuck)', async () => {
      const t = build({ user: { id: 'minor-1', isMinor: false, accountStatus: 'active' } });
      // Seed the row as if it was set while the account was a minor.
      await t.tx.guardianNoticeWithhold.create({ data: { userId: 'minor-1', reason: REASON, setAt: T0 } });
      await expect(t.service.clear('minor-1', 'admin-1', 'Account turned eighteen.')).resolves.toEqual({ withheld: false });
    });

    it('a lost race (the row vanished between the read and the delete) is a 409, not a log entry', async () => {
      const t = build();
      await t.service.withhold('minor-1', 'admin-1', REASON);
      t.logs.length = 0;
      t.tx.guardianNoticeWithhold.deleteMany.mockResolvedValueOnce({ count: 0 });
      const err = await rejects(t.service.clear('minor-1', 'admin-2', 'Safeguarding plan has ended.'));
      expect(err?.getResponse?.()).toMatchObject({ code: GUARDIAN_NOTICES_NOT_WITHHELD_CODE });
      expect(t.logs).toHaveLength(0);
    });

    it('400 for a short reason; 404 for an unknown user', async () => {
      const err = await rejects(build().service.clear('minor-1', 'admin-1', 'short'));
      expect(err?.getResponse?.()).toMatchObject({ code: GUARDIAN_NOTICES_TEXT_INVALID_CODE });
      expect(await rejects(build({ user: null }).service.clear('nobody', 'admin-1', 'Safeguarding plan has ended.'))).toBeInstanceOf(NotFoundException);
    });
  });
});
