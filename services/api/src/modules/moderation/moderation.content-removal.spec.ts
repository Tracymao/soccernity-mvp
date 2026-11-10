import { BadRequestException } from '@nestjs/common';
import { ModerationService } from './moderation.service';

// B-289 (Decision Log #483): how actionReport and decideAppeal wire the removal. The primitives are covered in
// content-removal.util.spec.ts; the real database behaviour is in test/content-removal.e2e-spec.ts.
function baseReport(over: Record<string, unknown> = {}) {
  return {
    id: 'report-1',
    reporterId: 'reporter-1',
    targetType: 'post',
    targetId: 'target-1',
    reason: '',
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
    post: {
      findUnique: jest.fn().mockResolvedValue({ id: 'target-1', authorId: 'author-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
    },
    comment: {
      findUnique: jest.fn().mockResolvedValue({ id: 'target-1', authorId: 'author-1', postId: 'post-1', hidden: false }),
      findFirst: jest.fn().mockResolvedValue({ id: 'target-1', postId: 'post-1', hidden: false }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    message: {
      findUnique: jest.fn().mockResolvedValue({ id: 'target-1', senderId: 'author-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'author-1' }) },
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
  const service = new ModerationService(
    prisma as never,
    emailService as never,
    { record: jest.fn().mockResolvedValue(undefined) } as never,
    { setRoomStatus: jest.fn() } as never,
    guardianNotices as never,
  );
  return { prisma, service, guardianNotices };
}

describe('ModerationService: content removal wiring', () => {
  describe('actionReport content_removed', () => {
    it.each(['user', 'banter_room', 'grassroots_team', 'fixture', 'enquiry'])(
      'is a 400 with code content_removal_not_applicable on a %s report, and writes nothing',
      async (targetType) => {
        const { prisma, service, guardianNotices } = build(baseReport({ targetType }));
        const err = await service.actionReport('report-1', 'admin-1', { action: 'content_removed' }).catch((e) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toMatchObject({ code: 'content_removal_not_applicable' });
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.report.update).not.toHaveBeenCalled();
        expect(guardianNotices.notifyInBackground).not.toHaveBeenCalled();
      },
    );

    it('the other actions are still allowed on a non-content target', async () => {
      const { service } = build(baseReport({ targetType: 'user' }));
      await expect(service.actionReport('report-1', 'admin-1', { action: 'warning_issued' })).resolves.toBeDefined();
    });

    it('removes the post in the SAME transaction as recording the action and says so', async () => {
      const { prisma, service, guardianNotices } = build(baseReport({ targetType: 'post' }));
      const res = await service.actionReport('report-1', 'admin-1', { action: 'content_removed' });
      expect(res.contentRemoval).toBe('removed');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.post.updateMany).toHaveBeenCalledWith({
        where: { id: 'target-1', removedByModerationAt: null },
        data: { removedByModerationAt: expect.any(Date), removedByReportId: 'report-1' },
      });
      // the guardian notice still fires after commit as before
      expect(guardianNotices.notifyInBackground).toHaveBeenCalledWith('author-1', 'content_removed');
    });

    it('reports already_removed when another report holds the claim, and still records the action', async () => {
      const { prisma, service } = build(baseReport({ targetType: 'post' }));
      prisma.post.updateMany.mockResolvedValue({ count: 0 });
      const res = await service.actionReport('report-1', 'admin-1', { action: 'content_removed' });
      expect(res.contentRemoval).toBe('already_removed');
      expect(prisma.report.update).toHaveBeenCalled();
    });

    it('has no contentRemoval key for any other action', async () => {
      const { prisma, service } = build(baseReport({ targetType: 'post' }));
      const res = await service.actionReport('report-1', 'admin-1', { action: 'warning_issued' });
      expect('contentRemoval' in res).toBe(false);
      expect(prisma.post.updateMany).not.toHaveBeenCalled();
    });

    it('a failure inside the removal rolls the action back with it (one transaction)', async () => {
      const { prisma, service } = build(baseReport({ targetType: 'post' }));
      prisma.post.updateMany.mockRejectedValue(new Error('boom'));
      await expect(service.actionReport('report-1', 'admin-1', { action: 'content_removed' })).rejects.toThrow('boom');
      expect(prisma.report.update).not.toHaveBeenCalled();
    });

    it('removes a comment and a message the same way (only the target id)', async () => {
      const c = build(baseReport({ targetType: 'comment' }));
      await c.service.actionReport('report-1', 'admin-1', { action: 'content_removed' });
      expect(c.prisma.comment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'target-1', removedByModerationAt: null } }),
      );
      const m = build(baseReport({ targetType: 'message' }));
      await m.service.actionReport('report-1', 'admin-1', { action: 'content_removed' });
      expect(m.prisma.message.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'target-1', removedByModerationAt: null } }),
      );
    });
  });

  describe('decideAppeal', () => {
    const appealed = (over: Record<string, unknown> = {}) =>
      baseReport({
        status: 'actioned',
        actionTaken: 'content_removed',
        appealStatus: 'pending',
        reviewedByAdminId: 'admin-1',
        ...over,
      });

    it('overturned on a content_removed report restores the content (only where THIS report removed it), same transaction', async () => {
      const { prisma, service } = build(appealed({ targetType: 'post' }));
      await service.decideAppeal('report-1', 'admin-2', { decision: 'overturned' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.post.updateMany).toHaveBeenCalledWith({
        where: { id: 'target-1', removedByReportId: 'report-1' },
        data: { removedByModerationAt: null, removedByReportId: null },
      });
    });

    it('upheld leaves the content removed', async () => {
      const { prisma, service } = build(appealed({ targetType: 'post' }));
      await service.decideAppeal('report-1', 'admin-2', { decision: 'upheld' });
      expect(prisma.post.updateMany).not.toHaveBeenCalled();
    });

    it('overturning a report that did not remove content restores nothing', async () => {
      const { prisma, service } = build(appealed({ targetType: 'user', actionTaken: 'warning_issued' }));
      await service.decideAppeal('report-1', 'admin-2', { decision: 'overturned' });
      expect(prisma.post.updateMany).not.toHaveBeenCalled();
      expect(prisma.comment.updateMany).not.toHaveBeenCalled();
      expect(prisma.message.updateMany).not.toHaveBeenCalled();
    });
  });
});
