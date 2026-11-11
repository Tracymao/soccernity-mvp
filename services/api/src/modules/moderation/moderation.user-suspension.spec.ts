import { BadRequestException, Logger } from '@nestjs/common';
import { ModerationService } from './moderation.service';

// B-291 (Decision Log #485): how actionReport and decideAppeal wire the suspension. The status write, the
// "already suspended" rules and the follow-up (sessions, points, guardian notice, emails) are tested on the shared
// path in account-suspension.service.spec.ts; the real database behaviour is in test/b291-suspension-on-report.e2e-spec.ts.
// These specs check WHEN moderation hands work to that path, with what, and what it refuses.

function baseReport(over: Record<string, unknown> = {}) {
  return {
    id: 'report-1',
    reporterId: 'reporter-1',
    targetType: 'user',
    targetId: 'target-1',
    reason: '',
    reasonCategory: 'harassment_or_bullying',
    status: 'open',
    concernsMinor: false,
    reviewedByAdminId: null,
    actionTaken: null,
    appealStatus: null,
    ...over,
  };
}

function build(reportRow: Record<string, unknown>) {
  const prisma = {
    report: {
      findUnique: jest.fn().mockResolvedValue(reportRow),
      update: jest.fn().mockResolvedValue(reportRow),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'target-1' }) },
    post: { findUnique: jest.fn().mockResolvedValue({ id: 'target-1', authorId: 'author-1' }), updateMany: jest.fn() },
    comment: { findUnique: jest.fn().mockResolvedValue({ id: 'target-1', authorId: 'author-1' }) },
    message: { findUnique: jest.fn().mockResolvedValue({ id: 'target-1', senderId: 'author-1' }) },
    banterRoom: { findUnique: jest.fn().mockResolvedValue({ id: 'target-1', createdBy: 'author-1' }) },
    adminUser: { findUnique: jest.fn().mockResolvedValue({ childSafetyVetted: true }) },
    notification: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  const guardianNotices = { notifyInBackground: jest.fn() };
  const emailService = {
    sendReportActionedEmail: jest.fn().mockResolvedValue(undefined),
    sendAppealDecisionEmail: jest.fn().mockResolvedValue(undefined),
  };
  const accountSuspension = {
    applySuspensionInTx: jest.fn().mockImplementation(async (_tx: unknown, userId: string) => ({
      userId,
      outcome: 'suspended',
      previousStatus: 'active',
    })),
    completeSuspension: jest.fn().mockResolvedValue(undefined),
    applyReinstatementInTx: jest.fn().mockImplementation(async (_tx: unknown, userId: string) => ({
      userId,
      outcome: 'reinstated',
      previousStatus: 'suspended',
    })),
    completeReinstatement: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ModerationService(
    prisma as never,
    emailService as never,
    { record: jest.fn().mockResolvedValue(undefined) } as never,
    { setRoomStatus: jest.fn() } as never,
    guardianNotices as never,
    accountSuspension as never,
  );
  return { prisma, service, guardianNotices, accountSuspension };
}

describe('ModerationService: suspension on a report (B-291)', () => {
  describe('actionReport user_suspended', () => {
    it.each([
      ['user', 'target-1'],
      ['post', 'author-1'],
      ['comment', 'author-1'],
      ['message', 'author-1'],
    ])('on a %s report suspends the account behind the target (%s) in the SAME transaction', async (targetType, accountId) => {
      const { prisma, service, accountSuspension } = build(baseReport({ targetType }));

      await service.actionReport('report-1', 'admin-1', { action: 'user_suspended' });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // The write happens with the transaction client, carries THIS report's id as the link, and runs before the
      // report row is updated (a failed report update rolls the status back with it).
      expect(accountSuspension.applySuspensionInTx).toHaveBeenCalledWith(prisma, accountId, { reportId: 'report-1' });
      expect(accountSuspension.applySuspensionInTx.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.report.update.mock.invocationCallOrder[0],
      );
      // Sessions, points, guardian notice and email happen AFTER the commit, with the report's category.
      expect(accountSuspension.completeSuspension).toHaveBeenCalledTimes(1);
      expect(accountSuspension.completeSuspension).toHaveBeenCalledWith(
        { userId: accountId, outcome: 'suspended', previousStatus: 'active' },
        { reasonCategory: 'harassment_or_bullying' },
      );
      expect(accountSuspension.completeSuspension.mock.invocationCallOrder[0]).toBeGreaterThan(
        prisma.$transaction.mock.invocationCallOrder[0],
      );
    });

    it.each(['banter_room', 'grassroots_team', 'fixture', 'enquiry'])(
      'is a 400 with code user_suspension_not_applicable on a %s report, and writes nothing',
      async (targetType) => {
        const { prisma, service, accountSuspension, guardianNotices } = build(baseReport({ targetType }));

        const err = await service.actionReport('report-1', 'admin-1', { action: 'user_suspended' }).catch((e) => e);

        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toMatchObject({
          statusCode: 400,
          code: 'user_suspension_not_applicable',
        });
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.report.update).not.toHaveBeenCalled();
        expect(accountSuspension.applySuspensionInTx).not.toHaveBeenCalled();
        expect(guardianNotices.notifyInBackground).not.toHaveBeenCalled();
      },
    );

    it('every other action leaves the account alone, including on the same user report', async () => {
      for (const action of ['warning_issued', 'dismissed'] as const) {
        const { service, accountSuspension } = build(baseReport({ targetType: 'user' }));
        await service.actionReport('report-1', 'admin-1', { action });
        expect(accountSuspension.applySuspensionInTx).not.toHaveBeenCalled();
        expect(accountSuspension.completeSuspension).not.toHaveBeenCalled();
      }
    });

    it('a report whose target no longer exists is recorded and suspends nobody', async () => {
      const { prisma, service, accountSuspension } = build(baseReport({ targetType: 'post' }));
      prisma.post.findUnique.mockResolvedValue(null);

      await service.actionReport('report-1', 'admin-1', { action: 'user_suspended' });

      expect(prisma.report.update).toHaveBeenCalled();
      expect(accountSuspension.applySuspensionInTx).not.toHaveBeenCalled();
      expect(accountSuspension.completeSuspension).not.toHaveBeenCalled();
    });

    it('an uncategorised report passes null, so the email gets the generic line', async () => {
      const { service, accountSuspension } = build(baseReport({ reasonCategory: null }));
      await service.actionReport('report-1', 'admin-1', { action: 'user_suspended' });
      expect(accountSuspension.completeSuspension).toHaveBeenCalledWith(expect.anything(), { reasonCategory: null });
    });

    it('an account that is already suspended or deleted: the action is recorded and the shared path decides (outcome passed through)', async () => {
      for (const outcome of ['already_suspended', 'deleted']) {
        const { prisma, service, accountSuspension } = build(baseReport());
        accountSuspension.applySuspensionInTx.mockResolvedValue({ userId: 'target-1', outcome, previousStatus: outcome });

        await service.actionReport('report-1', 'admin-1', { action: 'user_suspended' });

        expect(prisma.report.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ actionTaken: 'user_suspended', status: 'actioned' }) }),
        );
        // The shared path is the one that skips sessions, points, notice and email for these outcomes.
        expect(accountSuspension.completeSuspension).toHaveBeenCalledWith(
          expect.objectContaining({ outcome }),
          expect.anything(),
        );
      }
    });

    it('a failed suspension write rolls the report update back with it (one transaction)', async () => {
      const { prisma, service, accountSuspension } = build(baseReport());
      accountSuspension.applySuspensionInTx.mockRejectedValue(new Error('boom'));

      await expect(service.actionReport('report-1', 'admin-1', { action: 'user_suspended' })).rejects.toThrow('boom');

      expect(prisma.report.update).not.toHaveBeenCalled();
      expect(accountSuspension.completeSuspension).not.toHaveBeenCalled();
    });

    it('a follow-up failure after the commit is logged and does NOT fail the request (the report cannot be actioned twice)', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { service, accountSuspension } = build(baseReport());
      accountSuspension.completeSuspension.mockRejectedValue(new Error('redis down'));

      await expect(service.actionReport('report-1', 'admin-1', { action: 'user_suspended' })).resolves.toBeDefined();

      expect(error).toHaveBeenCalledWith(expect.stringContaining('redis down'));
      error.mockRestore();
    });

    it('sends no guardian notice itself: the shared path sends account_suspended once', async () => {
      const { service, guardianNotices } = build(baseReport());
      await service.actionReport('report-1', 'admin-1', { action: 'user_suspended' });
      expect(guardianNotices.notifyInBackground).not.toHaveBeenCalled();
    });
  });

  describe('decideAppeal', () => {
    const appealed = (over: Record<string, unknown> = {}) =>
      baseReport({
        status: 'actioned',
        actionTaken: 'user_suspended',
        reviewedByAdminId: 'admin-1',
        appealStatus: 'pending',
        ...over,
      });

    it('overturning an appeal of a user_suspended report reinstates, only where the stored link is THIS report, in the same transaction', async () => {
      const { prisma, service, accountSuspension } = build(appealed());

      await service.decideAppeal('report-1', 'admin-2', { decision: 'overturned' });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(accountSuspension.applyReinstatementInTx).toHaveBeenCalledWith(prisma, 'target-1', {
        onlyIfSuspendedByReportId: 'report-1',
      });
      expect(accountSuspension.applyReinstatementInTx.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.report.update.mock.invocationCallOrder[0],
      );
      expect(accountSuspension.completeReinstatement).toHaveBeenCalledWith({
        userId: 'target-1',
        outcome: 'reinstated',
        previousStatus: 'suspended',
      });
    });

    it('resolves the account behind a post / comment / message target, not the target id', async () => {
      const { prisma, service, accountSuspension } = build(appealed({ targetType: 'post' }));
      await service.decideAppeal('report-1', 'admin-2', { decision: 'overturned' });
      expect(accountSuspension.applyReinstatementInTx).toHaveBeenCalledWith(prisma, 'author-1', {
        onlyIfSuspendedByReportId: 'report-1',
      });
    });

    it('an UPHELD appeal changes nothing about the account', async () => {
      const { service, accountSuspension } = build(appealed());
      await service.decideAppeal('report-1', 'admin-2', { decision: 'upheld' });
      expect(accountSuspension.applyReinstatementInTx).not.toHaveBeenCalled();
      expect(accountSuspension.completeReinstatement).not.toHaveBeenCalled();
    });

    it('overturning an appeal of a different action does not touch the account', async () => {
      const { service, accountSuspension } = build(appealed({ actionTaken: 'warning_issued' }));
      await service.decideAppeal('report-1', 'admin-2', { decision: 'overturned' });
      expect(accountSuspension.applyReinstatementInTx).not.toHaveBeenCalled();
    });

    it('no reported account (the target is gone): nothing to reinstate', async () => {
      const { prisma, service, accountSuspension } = build(appealed({ targetType: 'post' }));
      prisma.post.findUnique.mockResolvedValue(null);
      await service.decideAppeal('report-1', 'admin-2', { decision: 'overturned' });
      expect(accountSuspension.applyReinstatementInTx).not.toHaveBeenCalled();
    });

    it('a follow-up failure after the commit is logged and does not fail the decision', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { service, accountSuspension } = build(appealed());
      accountSuspension.completeReinstatement.mockRejectedValue(new Error('mail down'));
      await expect(service.decideAppeal('report-1', 'admin-2', { decision: 'overturned' })).resolves.toBeDefined();
      expect(error).toHaveBeenCalledWith(expect.stringContaining('mail down'));
      error.mockRestore();
    });

    it('a failed reinstatement write rolls the appeal decision back with it', async () => {
      const { prisma, service, accountSuspension } = build(appealed());
      accountSuspension.applyReinstatementInTx.mockRejectedValue(new Error('boom'));
      await expect(service.decideAppeal('report-1', 'admin-2', { decision: 'overturned' })).rejects.toThrow('boom');
      expect(prisma.report.update).not.toHaveBeenCalled();
    });
  });
});
