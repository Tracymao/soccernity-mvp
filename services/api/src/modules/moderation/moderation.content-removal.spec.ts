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
  const postMediaObjects = {
    withdrawForPost: jest.fn().mockResolvedValue({ withdrawn: 1, failed: 0 }),
    republishForPost: jest.fn().mockResolvedValue({ published: 1, failed: 0 }),
  };
  const service = new ModerationService(
    prisma as never,
    emailService as never,
    { record: jest.fn().mockResolvedValue(undefined) } as never,
    { setRoomStatus: jest.fn() } as never,
    guardianNotices as never,
    postMediaObjects as never,
  );
  return { prisma, service, guardianNotices, postMediaObjects };
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

// backend/b290-removed-post-media (B-290; Decision Log #484): a removed POST also has its media files taken out of
// the public prefix (after the commit), and an overturned appeal puts them back.
describe('ModerationService: removed-post media wiring (B-290)', () => {
  const flush = () => new Promise((r) => setImmediate(r));

  it('Remove Content on a post withdraws its media AFTER the transaction, for exactly that post', async () => {
    const { prisma, service, postMediaObjects } = build(baseReport({ targetType: 'post', targetId: 'post-9' }));
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const out = await fn(prisma);
      expect(postMediaObjects.withdrawForPost).not.toHaveBeenCalled(); // not yet: still inside the transaction
      return out;
    });
    await service.actionReport('report-1', 'admin-1', { action: 'content_removed' });
    await flush();
    expect(postMediaObjects.withdrawForPost).toHaveBeenCalledTimes(1);
    expect(postMediaObjects.withdrawForPost).toHaveBeenCalledWith('post-9');
  });

  it('does not withdraw when another report already removed the post, for other actions, or for a comment or a message', async () => {
    const already = build(baseReport({ targetType: 'post' }));
    already.prisma.post.updateMany.mockResolvedValue({ count: 0 });
    await already.service.actionReport('report-1', 'admin-1', { action: 'content_removed' });

    const warn = build(baseReport({ targetType: 'post' }));
    await warn.service.actionReport('report-1', 'admin-1', { action: 'warning_issued' });

    const comment = build(baseReport({ targetType: 'comment' }));
    await comment.service.actionReport('report-1', 'admin-1', { action: 'content_removed' });

    const message = build(baseReport({ targetType: 'message' }));
    await message.service.actionReport('report-1', 'admin-1', { action: 'content_removed' });
    await flush();
    for (const t of [already, warn, comment, message]) expect(t.postMediaObjects.withdrawForPost).not.toHaveBeenCalled();
  });

  it('a failed withdraw never fails or delays the moderator action', async () => {
    const { service, postMediaObjects } = build(baseReport({ targetType: 'post' }));
    postMediaObjects.withdrawForPost.mockResolvedValue({ withdrawn: 0, failed: 1 });
    await expect(service.actionReport('report-1', 'admin-1', { action: 'content_removed' })).resolves.toBeDefined();
  });

  it('works with no object store wired (the dependency is optional)', async () => {
    const prisma = build(baseReport({ targetType: 'post' })).prisma;
    const service = new ModerationService(
      prisma as never,
      { sendReportActionedEmail: jest.fn().mockResolvedValue(undefined) } as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      { setRoomStatus: jest.fn() } as never,
      { notifyInBackground: jest.fn() } as never,
    );
    await expect(service.actionReport('report-1', 'admin-1', { action: 'content_removed' })).resolves.toBeDefined();
  });

  const appealed = (over: Record<string, unknown> = {}) =>
    baseReport({ status: 'actioned', actionTaken: 'content_removed', appealStatus: 'pending', reviewedByAdminId: 'admin-1', targetId: 'post-9', ...over });

  it('an overturned appeal that really restored the post republishes its media, after the commit', async () => {
    const { service, postMediaObjects } = build(appealed({ targetType: 'post' }));
    await service.decideAppeal('report-1', 'admin-2', { decision: 'overturned' });
    await flush();
    expect(postMediaObjects.republishForPost).toHaveBeenCalledWith('post-9');
  });

  it('does not republish when upheld, when another report holds the removal (nothing restored), or for a comment', async () => {
    const upheld = build(appealed({ targetType: 'post' }));
    await upheld.service.decideAppeal('report-1', 'admin-2', { decision: 'upheld' });

    const otherClaim = build(appealed({ targetType: 'post' }));
    otherClaim.prisma.post.updateMany.mockResolvedValue({ count: 0 });
    await otherClaim.service.decideAppeal('report-1', 'admin-2', { decision: 'overturned' });

    const comment = build(appealed({ targetType: 'comment' }));
    await comment.service.decideAppeal('report-1', 'admin-2', { decision: 'overturned' });
    await flush();
    for (const t of [upheld, otherClaim, comment]) expect(t.postMediaObjects.republishForPost).not.toHaveBeenCalled();
  });
});
