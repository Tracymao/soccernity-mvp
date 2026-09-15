import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { encodeModerationCursor } from './cursor.util';
import { ModerationService } from './moderation.service';

// Mocked-Prisma unit tests, following grassroots.service.spec.ts /
// community-groups.service.spec.ts. The real Report.reviewedByAdminId /
// .appealReviewedByAdminId FKs, the new columns, and the real
// transactional notification-writing behavior are proven in
// test/moderation.e2e-spec.ts against Postgres — this file covers the
// branching/guard logic a mock can prove.
function buildPrismaMock() {
  const prisma = {
    report: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    post: {
      findUnique: jest.fn(),
    },
    comment: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
  } as unknown as PrismaService;

  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn(
    (fn: (tx: unknown) => unknown) => fn(prisma),
  );

  return prisma;
}

function report(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'report-1',
    reporterId: 'reporter-1',
    targetType: 'post',
    targetId: 'post-1',
    reason: 'spam',
    status: 'open',
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    reviewedByAdminId: null,
    reviewedAt: null,
    actionTaken: null,
    appealStatus: null,
    appealReason: null,
    appealedAt: null,
    appealReviewedByAdminId: null,
    appealReviewedAt: null,
    ...overrides,
  };
}

describe('ModerationService', () => {
  // ---------- POST /reports ----------

  describe('createReport', () => {
    it('creates a report against an existing post target, reporterId = the caller', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      (prisma.report.create as jest.Mock).mockResolvedValue(report());

      const service = new ModerationService(prisma);
      const result = await service.createReport('reporter-1', {
        targetType: 'post',
        targetId: 'post-1',
        reason: 'spam',
      });

      expect(prisma.report.create).toHaveBeenCalledWith({
        data: { reporterId: 'reporter-1', targetType: 'post', targetId: 'post-1', reason: 'spam' },
      });
      expect(result.id).toBe('report-1');
    });

    it('404s when the reported post does not exist', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new ModerationService(prisma);

      await expect(
        service.createReport('reporter-1', { targetType: 'post', targetId: 'missing', reason: 'spam' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.report.create).not.toHaveBeenCalled();
    });

    it('404s when the reported comment does not exist', async () => {
      const prisma = buildPrismaMock();
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new ModerationService(prisma);

      await expect(
        service.createReport('reporter-1', { targetType: 'comment', targetId: 'missing', reason: 'abuse' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('404s when the reported user does not exist', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new ModerationService(prisma);

      await expect(
        service.createReport('reporter-1', { targetType: 'user', targetId: 'missing', reason: 'harassment' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a report against an existing user target', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-9' });
      (prisma.report.create as jest.Mock).mockResolvedValue(report({ targetType: 'user', targetId: 'user-9' }));
      const service = new ModerationService(prisma);

      await service.createReport('reporter-1', { targetType: 'user', targetId: 'user-9', reason: 'harassment' });

      expect(prisma.report.create).toHaveBeenCalledWith({
        data: { reporterId: 'reporter-1', targetType: 'user', targetId: 'user-9', reason: 'harassment' },
      });
    });
  });

  // ---------- POST /reports/:id/appeal ----------

  describe('appealReport', () => {
    it('404s when the report does not exist', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new ModerationService(prisma);

      await expect(service.appealReport('missing', 'user-1', { reason: 'unfair' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("403s when the report is still 'open' (never actioned)", async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ status: 'open' }));
      const service = new ModerationService(prisma);

      await expect(service.appealReport('report-1', 'reporter-1', { reason: 'unfair' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("403s when the report was dismissed ('reviewed', not 'actioned')", async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ status: 'reviewed' }));
      const service = new ModerationService(prisma);

      await expect(service.appealReport('report-1', 'post-author', { reason: 'unfair' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('403s when the caller is the REPORTER, not the reported user', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(
        report({ status: 'actioned', targetType: 'post', targetId: 'post-1' }),
      );
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ authorId: 'post-author' });
      const service = new ModerationService(prisma);

      // reporter-1 is the reporter (see report() default), not post-author
      await expect(service.appealReport('report-1', 'reporter-1', { reason: 'unfair' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.report.update).not.toHaveBeenCalled();
    });

    it('403s when the reported target no longer resolves to anyone (e.g. the post was deleted)', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ status: 'actioned' }));
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new ModerationService(prisma);

      await expect(service.appealReport('report-1', 'anyone', { reason: 'unfair' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('409s when the report has already been appealed', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(
        report({ status: 'actioned', appealStatus: 'pending' }),
      );
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ authorId: 'post-author' });
      const service = new ModerationService(prisma);

      await expect(service.appealReport('report-1', 'post-author', { reason: 'again' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('the reported user (post author) successfully appeals an actioned report', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ status: 'actioned' }));
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ authorId: 'post-author' });
      (prisma.report.update as jest.Mock).mockResolvedValue(
        report({ status: 'actioned', appealStatus: 'pending' }),
      );
      const service = new ModerationService(prisma);

      const result = await service.appealReport('report-1', 'post-author', { reason: 'I was misidentified' });

      expect(prisma.report.update).toHaveBeenCalledWith({
        where: { id: 'report-1' },
        data: expect.objectContaining({
          appealStatus: 'pending',
          appealReason: 'I was misidentified',
          appealedAt: expect.any(Date),
        }),
      });
      expect(result.appealStatus).toBe('pending');
    });

    it('the reported user (a directly-reported user, targetType user) successfully appeals', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(
        report({ status: 'actioned', targetType: 'user', targetId: 'user-9' }),
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-9' });
      (prisma.report.update as jest.Mock).mockResolvedValue(report({ appealStatus: 'pending' }));
      const service = new ModerationService(prisma);

      await service.appealReport('report-1', 'user-9', { reason: 'it was a joke' });

      expect(prisma.report.update).toHaveBeenCalled();
    });
  });

  // ---------- GET /admin/moderation/reports ----------

  describe('listReports', () => {
    it('lists reports newest-first with the default page size and no status filter', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findMany as jest.Mock).mockResolvedValue([report()]);
      const service = new ModerationService(prisma);

      const result = await service.listReports({});

      expect(prisma.report.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
      });
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    });

    it('ANDs an explicit status filter into the where clause', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findMany as jest.Mock).mockResolvedValue([]);
      const service = new ModerationService(prisma);

      await service.listReports({ status: 'open' });

      expect(prisma.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { AND: [{ status: 'open' }] } }),
      );
    });

    it('returns a real nextCursor when more rows exist than the page size, and trims the extra row', async () => {
      const prisma = buildPrismaMock();
      const rows = Array.from({ length: 3 }, (_, i) =>
        report({ id: `report-${i}`, createdAt: new Date(2026, 8, 10 - i) }),
      );
      (prisma.report.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new ModerationService(prisma);

      const result = await service.listReports({ limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe(
        encodeModerationCursor({ createdAt: rows[1].createdAt, id: rows[1].id }),
      );
    });
  });

  // ---------- PATCH /admin/moderation/reports/:id ----------

  describe('actionReport', () => {
    it('404s when the report does not exist', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new ModerationService(prisma);

      await expect(service.actionReport('missing', 'admin-1', { action: 'dismissed' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("409s when the report is not 'open' (already reviewed once)", async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ status: 'actioned' }));
      const service = new ModerationService(prisma);

      await expect(service.actionReport('report-1', 'admin-1', { action: 'warning_issued' })).rejects.toThrow(
        ConflictException,
      );
    });

    it("dismissed maps to status 'reviewed' and notifies only the reporter when the target is unresolvable", async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ status: 'open' }));
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null); // target deleted
      (prisma.report.update as jest.Mock).mockResolvedValue(report({ status: 'reviewed', actionTaken: 'dismissed' }));
      const service = new ModerationService(prisma);

      const result = await service.actionReport('report-1', 'admin-1', { action: 'dismissed' });

      expect(prisma.report.update).toHaveBeenCalledWith({
        where: { id: 'report-1' },
        data: {
          status: 'reviewed',
          actionTaken: 'dismissed',
          reviewedByAdminId: 'admin-1',
          reviewedAt: expect.any(Date),
          appealStatus: null,
          appealReason: null,
          appealedAt: null,
          appealReviewedByAdminId: null,
          appealReviewedAt: null,
        },
      });
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: { userId: 'reporter-1', type: 'moderation_decision', payloadRefId: 'report-1' },
      });
      expect(result.status).toBe('reviewed');
    });

    it("a real action (e.g. content_removed) maps to status 'actioned' and notifies BOTH reporter and reported user when they differ", async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(
        report({ status: 'open', targetType: 'post', targetId: 'post-1' }),
      );
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ authorId: 'post-author' });
      (prisma.report.update as jest.Mock).mockResolvedValue(
        report({ status: 'actioned', actionTaken: 'content_removed' }),
      );
      const service = new ModerationService(prisma);

      await service.actionReport('report-1', 'admin-1', { action: 'content_removed' });

      expect(prisma.notification.create).toHaveBeenCalledTimes(2);
      expect(prisma.notification.create).toHaveBeenNthCalledWith(1, {
        data: { userId: 'reporter-1', type: 'moderation_decision', payloadRefId: 'report-1' },
      });
      expect(prisma.notification.create).toHaveBeenNthCalledWith(2, {
        data: { userId: 'post-author', type: 'moderation_decision', payloadRefId: 'report-1' },
      });
    });

    it('notifies only once when the reporter and the reported user are the same person (a self-report)', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(
        report({ status: 'open', reporterId: 'user-1', targetType: 'user', targetId: 'user-1' }),
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' });
      (prisma.report.update as jest.Mock).mockResolvedValue(report({ status: 'actioned' }));
      const service = new ModerationService(prisma);

      await service.actionReport('report-1', 'admin-1', { action: 'warning_issued' });

      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    });
  });

  // ---------- PATCH /admin/moderation/reports/:id/appeal ----------

  describe('decideAppeal', () => {
    it('404s when the report does not exist', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new ModerationService(prisma);

      await expect(service.decideAppeal('missing', 'admin-2', { decision: 'upheld' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("409s when there is no pending appeal on the report", async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ status: 'actioned', appealStatus: null }));
      const service = new ModerationService(prisma);

      await expect(service.decideAppeal('report-1', 'admin-2', { decision: 'upheld' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('403s (Decision Log #138) when the reviewing admin is the SAME admin who actioned the original report', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(
        report({ status: 'actioned', appealStatus: 'pending', reviewedByAdminId: 'admin-1' }),
      );
      const service = new ModerationService(prisma);

      await expect(service.decideAppeal('report-1', 'admin-1', { decision: 'upheld' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.report.update).not.toHaveBeenCalled();
    });

    it('upheld keeps status actioned, records the second reviewer, and notifies only the reported user', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(
        report({
          status: 'actioned',
          appealStatus: 'pending',
          reviewedByAdminId: 'admin-1',
          targetType: 'post',
          targetId: 'post-1',
        }),
      );
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ authorId: 'post-author' });
      (prisma.report.update as jest.Mock).mockResolvedValue(report({ appealStatus: 'upheld' }));
      const service = new ModerationService(prisma);

      await service.decideAppeal('report-1', 'admin-2', { decision: 'upheld' });

      expect(prisma.report.update).toHaveBeenCalledWith({
        where: { id: 'report-1' },
        data: {
          appealStatus: 'upheld',
          appealReviewedByAdmin: { connect: { id: 'admin-2' } },
          appealReviewedAt: expect.any(Date),
        },
      });
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: { userId: 'post-author', type: 'moderation_decision', payloadRefId: 'report-1' },
      });
    });

    it('overturned reverses the report to a non-actioned state and preserves appealStatus as the historical record', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(
        report({
          status: 'actioned',
          appealStatus: 'pending',
          reviewedByAdminId: 'admin-1',
          actionTaken: 'content_removed',
          targetType: 'post',
          targetId: 'post-1',
        }),
      );
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ authorId: 'post-author' });
      (prisma.report.update as jest.Mock).mockResolvedValue(report({ status: 'open', appealStatus: 'overturned' }));
      const service = new ModerationService(prisma);

      const result = await service.decideAppeal('report-1', 'admin-2', { decision: 'overturned' });

      expect(prisma.report.update).toHaveBeenCalledWith({
        where: { id: 'report-1' },
        data: {
          appealStatus: 'overturned',
          appealReviewedByAdmin: { connect: { id: 'admin-2' } },
          appealReviewedAt: expect.any(Date),
          status: 'open',
          reviewedByAdmin: { disconnect: true },
          reviewedAt: null,
          actionTaken: null,
        },
      });
      expect(result.status).toBe('open');
    });

    it('does not notify anyone when the reported target no longer resolves', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(
        report({ status: 'actioned', appealStatus: 'pending', reviewedByAdminId: 'admin-1' }),
      );
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.report.update as jest.Mock).mockResolvedValue(report({ appealStatus: 'upheld' }));
      const service = new ModerationService(prisma);

      await service.decideAppeal('report-1', 'admin-2', { decision: 'upheld' });

      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });
});
