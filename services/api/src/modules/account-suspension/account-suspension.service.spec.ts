import { ConflictException, Logger } from '@nestjs/common';
import { AccountSuspensionService } from './account-suspension.service';

// B-291 (Decision Log #485): the shared suspend / reinstate path used by the admin user page AND by a report's
// user_suspended action and the overturn of its appeal. Real database behaviour is in
// test/b291-suspension-on-report.e2e-spec.ts.

function build(initial: { accountStatus: string; suspendedByReportId?: string | null; email?: string | null }) {
  const row = { accountStatus: initial.accountStatus, suspendedByReportId: initial.suspendedByReportId ?? null, email: 'email' in initial ? initial.email : 'p@example.com' };
  const prisma = {
    user: {
      findUnique: jest.fn().mockImplementation(async (args: { select: Record<string, boolean> }) => {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(args.select)) out[k] = (row as Record<string, unknown>)[k];
        return out;
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    pointsLedgerEntry: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  const tokenService = { revokeAllSessionsForUser: jest.fn().mockResolvedValue(undefined) };
  const guardianNotices = { notifyInBackground: jest.fn() };
  const email = {
    sendAccountSuspendedEmail: jest.fn().mockResolvedValue(undefined),
    sendAccountReinstatedEmail: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AccountSuspensionService(prisma as never, tokenService as never, guardianNotices as never, email as never);
  return { service, prisma, tokenService, guardianNotices, email, row };
}

// The email is queued in the background; let the detached promise settle.
const flush = () => new Promise((r) => setImmediate(r));

describe('AccountSuspensionService', () => {
  describe('applySuspensionInTx', () => {
    it.each(['active', 'deactivated'])('suspends a %s account with a status-guarded write', async (accountStatus) => {
      const { service, prisma } = build({ accountStatus });

      const out = await service.applySuspensionInTx(prisma as never, 'u-1');

      expect(out).toEqual({ userId: 'u-1', outcome: 'suspended', previousStatus: accountStatus });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u-1', accountStatus },
        data: { accountStatus: 'suspended' },
      });
    });

    it('also clears a stale pendingDeletionAt when the account was pending deletion', async () => {
      const { service, prisma } = build({ accountStatus: 'pending_deletion' });
      const out = await service.applySuspensionInTx(prisma as never, 'u-1');
      expect(out.outcome).toBe('suspended');
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u-1', accountStatus: 'pending_deletion' },
        data: { accountStatus: 'suspended', pendingDeletionAt: null },
      });
    });

    it('records the report link ONLY when a report causes the suspension', async () => {
      const a = build({ accountStatus: 'active' });
      await a.service.applySuspensionInTx(a.prisma as never, 'u-1', { reportId: 'report-9' });
      expect(a.prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u-1', accountStatus: 'active' },
        data: { accountStatus: 'suspended', suspendedByReportId: 'report-9' },
      });

      const b = build({ accountStatus: 'active' });
      await b.service.applySuspensionInTx(b.prisma as never, 'u-1');
      expect(JSON.stringify(b.prisma.user.updateMany.mock.calls[0][0].data)).not.toContain('suspendedByReportId');
    });

    it('an account that is already suspended is not written again, and an existing link is never overwritten', async () => {
      const { service, prisma } = build({ accountStatus: 'suspended', suspendedByReportId: 'report-1' });

      const out = await service.applySuspensionInTx(prisma as never, 'u-1', { reportId: 'report-2' });

      expect(out).toEqual({ userId: 'u-1', outcome: 'already_suspended', previousStatus: 'suspended' });
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('a deleted (anonymised) account is never touched', async () => {
      const { service, prisma } = build({ accountStatus: 'deleted' });
      const out = await service.applySuspensionInTx(prisma as never, 'u-1', { reportId: 'report-1' });
      expect(out.outcome).toBe('deleted');
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('an unknown user is reported as not_found', async () => {
      const { service, prisma } = build({ accountStatus: 'active' });
      prisma.user.findUnique.mockResolvedValue(null);
      expect((await service.applySuspensionInTx(prisma as never, 'u-1')).outcome).toBe('not_found');
    });

    it('losing a race to a concurrent suspension resolves to already_suspended, not a second set of side effects', async () => {
      const { service, prisma, row } = build({ accountStatus: 'active' });
      prisma.user.updateMany.mockImplementationOnce(async () => {
        row.accountStatus = 'suspended';
        return { count: 0 };
      });
      expect((await service.applySuspensionInTx(prisma as never, 'u-1')).outcome).toBe('already_suspended');
    });

    it('gives up with a 409 if the status keeps changing underneath it', async () => {
      const { service, prisma } = build({ accountStatus: 'active' });
      prisma.user.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.applySuspensionInTx(prisma as never, 'u-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('completeSuspension', () => {
    it('ends sessions, revokes baseline points, tells the guardian ONCE and emails the person with the category', async () => {
      const { service, tokenService, prisma, guardianNotices, email } = build({ accountStatus: 'suspended' });

      await service.completeSuspension(
        { userId: 'u-1', outcome: 'suspended', previousStatus: 'active' },
        { reasonCategory: 'spam_or_scam' },
      );
      await flush();

      expect(tokenService.revokeAllSessionsForUser).toHaveBeenCalledWith('u-1');
      expect(prisma.pointsLedgerEntry.updateMany).toHaveBeenCalled();
      expect(guardianNotices.notifyInBackground).toHaveBeenCalledTimes(1);
      expect(guardianNotices.notifyInBackground).toHaveBeenCalledWith('u-1', 'account_suspended');
      expect(email.sendAccountSuspendedEmail).toHaveBeenCalledTimes(1);
      expect(email.sendAccountSuspendedEmail).toHaveBeenCalledWith('p@example.com', 'spam_or_scam');
    });

    it('a missing category is passed as null (the generic line)', async () => {
      const { service, email } = build({ accountStatus: 'suspended' });
      await service.completeSuspension({ userId: 'u-1', outcome: 'suspended', previousStatus: 'active' });
      await flush();
      expect(email.sendAccountSuspendedEmail).toHaveBeenCalledWith('p@example.com', null);
    });

    it.each(['already_suspended', 'deleted', 'not_found'] as const)(
      'does nothing at all for outcome %s: no sessions, points, notice or email',
      async (outcome) => {
        const { service, tokenService, prisma, guardianNotices, email } = build({ accountStatus: 'suspended' });

        await service.completeSuspension({ userId: 'u-1', outcome, previousStatus: 'suspended' }, { reasonCategory: 'other' });
        await flush();

        expect(tokenService.revokeAllSessionsForUser).not.toHaveBeenCalled();
        expect(prisma.pointsLedgerEntry.updateMany).not.toHaveBeenCalled();
        expect(guardianNotices.notifyInBackground).not.toHaveBeenCalled();
        expect(email.sendAccountSuspendedEmail).not.toHaveBeenCalled();
      },
    );

    it('a session-revocation failure is thrown (a suspended account with live sessions must not pass silently) and sends nothing', async () => {
      const { service, tokenService, guardianNotices, email } = build({ accountStatus: 'suspended' });
      tokenService.revokeAllSessionsForUser.mockRejectedValue(new Error('redis down'));

      await expect(
        service.completeSuspension({ userId: 'u-1', outcome: 'suspended', previousStatus: 'active' }),
      ).rejects.toThrow('redis down');
      await flush();

      expect(guardianNotices.notifyInBackground).not.toHaveBeenCalled();
      expect(email.sendAccountSuspendedEmail).not.toHaveBeenCalled();
    });

    it('an email failure is logged and never thrown', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const { service, email } = build({ accountStatus: 'suspended' });
      email.sendAccountSuspendedEmail.mockRejectedValue(new Error('postmark down'));

      await expect(
        service.completeSuspension({ userId: 'u-1', outcome: 'suspended', previousStatus: 'active' }),
      ).resolves.toBeUndefined();
      await flush();

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('postmark down'));
      warn.mockRestore();
    });

    it('never emails an anonymised account or one with no address', async () => {
      for (const over of [{ accountStatus: 'deleted' }, { accountStatus: 'suspended', email: null }]) {
        const { service, email } = build(over);
        await service.completeSuspension({ userId: 'u-1', outcome: 'suspended', previousStatus: 'active' });
        await flush();
        expect(email.sendAccountSuspendedEmail).not.toHaveBeenCalled();
      }
    });
  });

  describe('applyReinstatementInTx: the user page (no report option)', () => {
    it('reinstates a suspended account and clears the stored report link', async () => {
      const { service, prisma } = build({ accountStatus: 'suspended', suspendedByReportId: 'report-1' });

      const out = await service.applyReinstatementInTx(prisma as never, 'u-1');

      expect(out).toEqual({ userId: 'u-1', outcome: 'reinstated', previousStatus: 'suspended' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { accountStatus: 'active', suspendedByReportId: null },
      });
    });

    it('moving a pending_deletion account to active clears pendingDeletionAt and is not a reinstatement', async () => {
      const { service, prisma } = build({ accountStatus: 'pending_deletion' });
      const out = await service.applyReinstatementInTx(prisma as never, 'u-1');
      expect(out.outcome).toBe('activated');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { accountStatus: 'active', pendingDeletionAt: null },
      });
    });

    it('a deleted account is not resurrected', async () => {
      const { service, prisma } = build({ accountStatus: 'deleted' });
      expect((await service.applyReinstatementInTx(prisma as never, 'u-1')).outcome).toBe('deleted');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('applyReinstatementInTx: an overturned appeal (onlyIfSuspendedByReportId)', () => {
    it('reinstates only when the stored link is THIS report, and clears the link in the same write', async () => {
      const { service, prisma } = build({ accountStatus: 'suspended', suspendedByReportId: 'report-1' });

      const out = await service.applyReinstatementInTx(prisma as never, 'u-1', { onlyIfSuspendedByReportId: 'report-1' });

      expect(out).toEqual({ userId: 'u-1', outcome: 'reinstated', previousStatus: 'suspended' });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u-1', suspendedByReportId: 'report-1' },
        data: { accountStatus: 'active', suspendedByReportId: null },
      });
    });

    it.each([
      ['a different report holds the link', 'report-2'],
      ['no report holds the link (a manual suspension, or one already cleared)', null],
    ])('changes nothing when %s', async (_label, link) => {
      const { service, prisma } = build({ accountStatus: 'suspended', suspendedByReportId: link });

      const out = await service.applyReinstatementInTx(prisma as never, 'u-1', { onlyIfSuspendedByReportId: 'report-1' });

      expect(out.outcome).toBe('not_linked');
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('if the account is no longer suspended (deleted, or reinstated by hand) only the link is cleared', async () => {
      const { service, prisma } = build({ accountStatus: 'deleted', suspendedByReportId: 'report-1' });

      const out = await service.applyReinstatementInTx(prisma as never, 'u-1', { onlyIfSuspendedByReportId: 'report-1' });

      expect(out.outcome).toBe('link_cleared');
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u-1', suspendedByReportId: 'report-1' },
        data: { suspendedByReportId: null },
      });
    });

    it('losing a race on the link is not_linked, not an error', async () => {
      const { service, prisma } = build({ accountStatus: 'suspended', suspendedByReportId: 'report-1' });
      prisma.user.updateMany.mockResolvedValue({ count: 0 });
      expect((await service.applyReinstatementInTx(prisma as never, 'u-1', { onlyIfSuspendedByReportId: 'report-1' })).outcome).toBe('not_linked');
    });
  });

  describe('completeReinstatement', () => {
    it('tells the guardian once and emails the person, only when a suspension was really lifted', async () => {
      const { service, guardianNotices, email } = build({ accountStatus: 'active' });

      await service.completeReinstatement({ userId: 'u-1', outcome: 'reinstated', previousStatus: 'suspended' });
      await flush();

      expect(guardianNotices.notifyInBackground).toHaveBeenCalledTimes(1);
      expect(guardianNotices.notifyInBackground).toHaveBeenCalledWith('u-1', 'account_reinstated');
      expect(email.sendAccountReinstatedEmail).toHaveBeenCalledWith('p@example.com');
    });

    it.each(['activated', 'link_cleared', 'not_linked', 'deleted', 'not_found'] as const)(
      'sends nothing for outcome %s',
      async (outcome) => {
        const { service, guardianNotices, email } = build({ accountStatus: 'active' });
        await service.completeReinstatement({ userId: 'u-1', outcome, previousStatus: 'x' });
        await flush();
        expect(guardianNotices.notifyInBackground).not.toHaveBeenCalled();
        expect(email.sendAccountReinstatedEmail).not.toHaveBeenCalled();
      },
    );
  });

  describe('the user-page conveniences run apply and complete around one transaction', () => {
    it('suspend()', async () => {
      const { service, prisma, tokenService, email } = build({ accountStatus: 'active' });
      const out = await service.suspend('u-1', { reasonCategory: 'other' });
      await flush();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(out.outcome).toBe('suspended');
      expect(tokenService.revokeAllSessionsForUser).toHaveBeenCalledWith('u-1');
      expect(email.sendAccountSuspendedEmail).toHaveBeenCalledWith('p@example.com', 'other');
    });

    it('suspend() of an already-suspended account does nothing more', async () => {
      const { service, tokenService, guardianNotices, email } = build({ accountStatus: 'suspended' });
      const out = await service.suspend('u-1', { reasonCategory: 'other' });
      await flush();
      expect(out.outcome).toBe('already_suspended');
      expect(tokenService.revokeAllSessionsForUser).not.toHaveBeenCalled();
      expect(guardianNotices.notifyInBackground).not.toHaveBeenCalled();
      expect(email.sendAccountSuspendedEmail).not.toHaveBeenCalled();
    });

    it('reinstate() of a suspended account', async () => {
      const { service, prisma, email } = build({ accountStatus: 'suspended', suspendedByReportId: 'report-1' });
      const out = await service.reinstate('u-1');
      await flush();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(out.outcome).toBe('reinstated');
      expect(email.sendAccountReinstatedEmail).toHaveBeenCalledTimes(1);
    });
  });
});
