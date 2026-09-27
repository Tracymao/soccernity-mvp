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
    // schema/report-severity-escalation-admin-vetting-application —
    // ModerationService now fresh-reads AdminUser.childSafetyVetted for
    // the concernsMinor gate / escalate's own vetting requirement.
    // Defaults to "vetted" so every PRE-EXISTING test in this file that
    // doesn't care about vetting keeps behaving exactly as before
    // (listReports adds no extra filter, actionReport/decideAppeal never
    // trip the gate since report()'s own default concernsMinor is falsy)
    // — only the dedicated new tests below override this mock.
    adminUser: {
      findUnique: jest.fn().mockResolvedValue({ childSafetyVetted: true }),
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

// feat/public-report-submission — ModerationService now takes a
// RegistrationEmailService too (for POST /reports/public's acknowledgment
// send). Same mocking convention as
// guardian-consent.service.spec.ts's own emailService fixture.
function buildEmailServiceMock() {
  return {
    sendPublicReportAcknowledgementEmail: jest.fn().mockResolvedValue(undefined),
  };
}

// feat/admin-action-log — ModerationService now also takes an
// AdminActionLogService, called after actionReport/decideAppeal/
// escalateReport each successfully commit their own state change. Same
// mocking convention as the two fixtures above.
function buildAdminActionLogServiceMock() {
  return {
    record: jest.fn().mockResolvedValue(undefined),
  };
}

function buildService(
  prisma: PrismaService,
  emailService = buildEmailServiceMock(),
  adminActionLogService = buildAdminActionLogServiceMock(),
): ModerationService {
  return new ModerationService(prisma, emailService as never, adminActionLogService as never);
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

      const service = buildService(prisma);
      const result = await service.createReport('reporter-1', {
        targetType: 'post',
        targetId: 'post-1',
        reason: 'spam',
      });

      expect(prisma.report.create).toHaveBeenCalledWith({
        data: {
          reporterId: 'reporter-1',
          targetType: 'post',
          targetId: 'post-1',
          reason: 'spam',
          severity: 'medium',
        },
      });
      expect(result.id).toBe('report-1');
    });

    it('defaults severity to medium when omitted', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      (prisma.report.create as jest.Mock).mockResolvedValue(report({ severity: 'medium' }));
      const service = buildService(prisma);

      await service.createReport('reporter-1', { targetType: 'post', targetId: 'post-1', reason: 'spam' });

      expect(prisma.report.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ severity: 'medium' }) }),
      );
    });

    it('forwards an explicit severity when given', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      (prisma.report.create as jest.Mock).mockResolvedValue(report({ severity: 'critical' }));
      const service = buildService(prisma);

      await service.createReport('reporter-1', {
        targetType: 'post',
        targetId: 'post-1',
        reason: 'spam',
        severity: 'critical',
      });

      expect(prisma.report.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ severity: 'critical' }) }),
      );
    });

    it('404s when the reported post does not exist', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);
      const service = buildService(prisma);

      await expect(
        service.createReport('reporter-1', { targetType: 'post', targetId: 'missing', reason: 'spam' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.report.create).not.toHaveBeenCalled();
    });

    it('404s when the reported comment does not exist', async () => {
      const prisma = buildPrismaMock();
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(null);
      const service = buildService(prisma);

      await expect(
        service.createReport('reporter-1', { targetType: 'comment', targetId: 'missing', reason: 'abuse' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('404s when the reported user does not exist', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const service = buildService(prisma);

      await expect(
        service.createReport('reporter-1', { targetType: 'user', targetId: 'missing', reason: 'harassment' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a report against an existing user target', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-9' });
      (prisma.report.create as jest.Mock).mockResolvedValue(report({ targetType: 'user', targetId: 'user-9' }));
      const service = buildService(prisma);

      await service.createReport('reporter-1', { targetType: 'user', targetId: 'user-9', reason: 'harassment' });

      expect(prisma.report.create).toHaveBeenCalledWith({
        data: {
          reporterId: 'reporter-1',
          targetType: 'user',
          targetId: 'user-9',
          reason: 'harassment',
          severity: 'medium',
        },
      });
    });
  });

  // ---------- POST /reports/:id/appeal ----------

  describe('appealReport', () => {
    it('404s when the report does not exist', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(null);
      const service = buildService(prisma);

      await expect(service.appealReport('missing', 'user-1', { reason: 'unfair' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("403s when the report is still 'open' (never actioned)", async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ status: 'open' }));
      const service = buildService(prisma);

      await expect(service.appealReport('report-1', 'reporter-1', { reason: 'unfair' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("403s when the report was dismissed ('reviewed', not 'actioned')", async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ status: 'reviewed' }));
      const service = buildService(prisma);

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
      const service = buildService(prisma);

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
      const service = buildService(prisma);

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
      const service = buildService(prisma);

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
      const service = buildService(prisma);

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
      const service = buildService(prisma);

      await service.appealReport('report-1', 'user-9', { reason: 'it was a joke' });

      expect(prisma.report.update).toHaveBeenCalled();
    });
  });

  // ---------- GET /admin/moderation/reports ----------

  describe('listReports', () => {
    it('lists reports newest-first with the default page size and no status filter (vetted admin, no concernsMinor filter added)', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findMany as jest.Mock).mockResolvedValue([report()]);
      const service = buildService(prisma);

      const result = await service.listReports({}, 'admin-1');

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
      const service = buildService(prisma);

      await service.listReports({ status: 'open' }, 'admin-1');

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
      const service = buildService(prisma);

      const result = await service.listReports({ limit: 2 }, 'admin-1');

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe(
        encodeModerationCursor({ createdAt: rows[1].createdAt, id: rows[1].id }),
      );
    });

    // ---------- child-safety-vetting gate (schema/report-severity-escalation-admin-vetting-application) ----------

    it('freshly checks the CALLING admin (not a cached role) via AdminUser.childSafetyVetted', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findMany as jest.Mock).mockResolvedValue([]);
      const service = buildService(prisma);

      await service.listReports({}, 'admin-42');

      expect(prisma.adminUser.findUnique).toHaveBeenCalledWith({
        where: { id: 'admin-42' },
        select: { childSafetyVetted: true },
      });
    });

    it('a NON-vetted admin gets an implicit concernsMinor: false filter ANDed in, regardless of role (role is not even read here)', async () => {
      const prisma = buildPrismaMock();
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ childSafetyVetted: false });
      (prisma.report.findMany as jest.Mock).mockResolvedValue([]);
      const service = buildService(prisma);

      await service.listReports({}, 'unvetted-admin');

      expect(prisma.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { AND: [{ concernsMinor: false }] } }),
      );
    });

    it('an admin with no AdminUser row at all (a since-removed account behind a still-valid token) is treated as non-vetted', async () => {
      const prisma = buildPrismaMock();
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.report.findMany as jest.Mock).mockResolvedValue([]);
      const service = buildService(prisma);

      await service.listReports({}, 'ghost-admin');

      expect(prisma.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { AND: [{ concernsMinor: false }] } }),
      );
    });

    it('a VETTED admin gets no concernsMinor filter added, ANDed alongside a real status filter', async () => {
      const prisma = buildPrismaMock();
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ childSafetyVetted: true });
      (prisma.report.findMany as jest.Mock).mockResolvedValue([]);
      const service = buildService(prisma);

      await service.listReports({ status: 'open' }, 'vetted-admin');

      expect(prisma.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { AND: [{ status: 'open' }] } }),
      );
    });
  });

  // ---------- GET /admin/moderation/reports/:id ----------

  describe('getReportById', () => {
    it('404s when the report does not exist', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(null);
      const service = buildService(prisma);

      await expect(service.getReportById('missing', 'admin-1')).rejects.toThrow(NotFoundException);
    });

    it('returns the report as-is when it does not concern a minor, without checking vetting at all', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ concernsMinor: false }));
      const service = buildService(prisma);

      const result = await service.getReportById('report-1', 'admin-1');

      expect(result.id).toBe('report-1');
      expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
    });

    it('returns the report to a VETTED admin when it concerns a minor', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ concernsMinor: true }));
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ childSafetyVetted: true });
      const service = buildService(prisma);

      const result = await service.getReportById('report-1', 'vetted-admin');

      expect(result.concernsMinor).toBe(true);
      expect(prisma.adminUser.findUnique).toHaveBeenCalledWith({
        where: { id: 'vetted-admin' },
        select: { childSafetyVetted: true },
      });
    });

    it('403s a NON-vetted admin fetching a report where concernsMinor is true — a direct-access backstop, not just a queue-list filter', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ concernsMinor: true }));
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ childSafetyVetted: false });
      const service = buildService(prisma);

      await expect(service.getReportById('report-1', 'unvetted-admin')).rejects.toThrow(ForbiddenException);
    });

    it('settles 404 (existence) BEFORE the 403 vetting check — a non-existent id never touches AdminUser at all', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(null);
      const service = buildService(prisma);

      await expect(service.getReportById('missing', 'unvetted-admin')).rejects.toThrow(NotFoundException);
      expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
    });
  });

  // ---------- PATCH /admin/moderation/reports/:id ----------

  describe('actionReport', () => {
    it('404s when the report does not exist', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(null);
      const service = buildService(prisma);

      await expect(service.actionReport('missing', 'admin-1', { action: 'dismissed' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("409s when the report is not 'open' (already reviewed once)", async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ status: 'actioned' }));
      const service = buildService(prisma);

      await expect(service.actionReport('report-1', 'admin-1', { action: 'warning_issued' })).rejects.toThrow(
        ConflictException,
      );
    });

    it("dismissed maps to status 'reviewed' and notifies only the reporter when the target is unresolvable", async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ status: 'open' }));
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null); // target deleted
      (prisma.report.update as jest.Mock).mockResolvedValue(report({ status: 'reviewed', actionTaken: 'dismissed' }));
      const service = buildService(prisma);

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
      const service = buildService(prisma);

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
      const service = buildService(prisma);

      await service.actionReport('report-1', 'admin-1', { action: 'warning_issued' });

      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    });

    // ---------- child-safety-vetting gate ----------

    it('403s a NON-vetted admin acting on a report where concernsMinor is true, regardless of role, and never mutates the report', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ status: 'open', concernsMinor: true }));
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ childSafetyVetted: false });
      const service = buildService(prisma);

      await expect(
        service.actionReport('report-1', 'unvetted-admin', { action: 'content_removed' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.report.update).not.toHaveBeenCalled();
      expect(prisma.adminUser.findUnique).toHaveBeenCalledWith({
        where: { id: 'unvetted-admin' },
        select: { childSafetyVetted: true },
      });
    });

    it('never checks vetting at all when concernsMinor is false (the common case)', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(
        report({ status: 'open', concernsMinor: false, targetType: 'user', targetId: 'user-1' }),
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' });
      (prisma.report.update as jest.Mock).mockResolvedValue(report({ status: 'actioned' }));
      const service = buildService(prisma);

      await service.actionReport('report-1', 'any-admin', { action: 'dismissed' });

      expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
    });

    it('a VETTED admin may action a report where concernsMinor is true', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(
        report({ status: 'open', concernsMinor: true, targetType: 'user', targetId: 'user-1' }),
      );
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ childSafetyVetted: true });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' });
      (prisma.report.update as jest.Mock).mockResolvedValue(report({ status: 'actioned', concernsMinor: true }));
      const service = buildService(prisma);

      const result = await service.actionReport('report-1', 'vetted-admin', { action: 'content_removed' });

      expect(result.status).toBe('actioned');
      expect(prisma.report.update).toHaveBeenCalled();
    });

    // ---------- AdminActionLog wiring (feat/admin-action-log) ----------

    it('records an AdminActionLog row after a successful action, with the recorded action as notes', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ status: 'open' }));
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ authorId: 'post-author' });
      (prisma.report.update as jest.Mock).mockResolvedValue(
        report({ status: 'actioned', actionTaken: 'content_removed' }),
      );
      const service = buildService(prisma, buildEmailServiceMock(), adminActionLogService);

      await service.actionReport('report-1', 'admin-1', { action: 'content_removed' });

      expect(adminActionLogService.record).toHaveBeenCalledTimes(1);
      expect(adminActionLogService.record).toHaveBeenCalledWith(
        'admin-1',
        'report.actioned',
        'report',
        'report-1',
        'content_removed',
      );
    });

    it('never records an AdminActionLog row when the report does not exist (404)', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(null);
      const service = buildService(prisma, buildEmailServiceMock(), adminActionLogService);

      await expect(service.actionReport('missing', 'admin-1', { action: 'dismissed' })).rejects.toThrow(
        NotFoundException,
      );
      expect(adminActionLogService.record).not.toHaveBeenCalled();
    });

    it('never records an AdminActionLog row when the report is not open (409)', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ status: 'actioned' }));
      const service = buildService(prisma, buildEmailServiceMock(), adminActionLogService);

      await expect(service.actionReport('report-1', 'admin-1', { action: 'warning_issued' })).rejects.toThrow(
        ConflictException,
      );
      expect(adminActionLogService.record).not.toHaveBeenCalled();
    });

    it('never records an AdminActionLog row when a non-vetted admin is blocked (403)', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ status: 'open', concernsMinor: true }));
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ childSafetyVetted: false });
      const service = buildService(prisma, buildEmailServiceMock(), adminActionLogService);

      await expect(
        service.actionReport('report-1', 'unvetted-admin', { action: 'content_removed' }),
      ).rejects.toThrow(ForbiddenException);
      expect(adminActionLogService.record).not.toHaveBeenCalled();
    });
  });

  // ---------- PATCH /admin/moderation/reports/:id/appeal ----------

  describe('decideAppeal', () => {
    it('404s when the report does not exist', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(null);
      const service = buildService(prisma);

      await expect(service.decideAppeal('missing', 'admin-2', { decision: 'upheld' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("409s when there is no pending appeal on the report", async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ status: 'actioned', appealStatus: null }));
      const service = buildService(prisma);

      await expect(service.decideAppeal('report-1', 'admin-2', { decision: 'upheld' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('403s (Decision Log #138) when the reviewing admin is the SAME admin who actioned the original report', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(
        report({ status: 'actioned', appealStatus: 'pending', reviewedByAdminId: 'admin-1' }),
      );
      const service = buildService(prisma);

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
      const service = buildService(prisma);

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
      const service = buildService(prisma);

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
      const service = buildService(prisma);

      await service.decideAppeal('report-1', 'admin-2', { decision: 'upheld' });

      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    // ---------- child-safety-vetting gate ----------

    it('403s a NON-vetted admin reviewing an appeal on a report where concernsMinor is true, before Decision Log #138 same-admin check even runs', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(
        report({
          status: 'actioned',
          appealStatus: 'pending',
          reviewedByAdminId: 'admin-1',
          concernsMinor: true,
        }),
      );
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ childSafetyVetted: false });
      const service = buildService(prisma);

      // admin-1 is ALSO the original reviewer here (would otherwise also
      // 403 under #138) -- the vetting gate is checked first and its
      // own, distinct message/code is what's expected.
      await expect(
        service.decideAppeal('report-1', 'admin-1', { decision: 'upheld' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.report.update).not.toHaveBeenCalled();
    });

    it('a VETTED admin may review an appeal on a report where concernsMinor is true', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(
        report({
          status: 'actioned',
          appealStatus: 'pending',
          reviewedByAdminId: 'admin-1',
          concernsMinor: true,
        }),
      );
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ childSafetyVetted: true });
      (prisma.report.update as jest.Mock).mockResolvedValue(report({ appealStatus: 'upheld', concernsMinor: true }));
      const service = buildService(prisma);

      const result = await service.decideAppeal('report-1', 'admin-2', { decision: 'upheld' });

      expect(result.appealStatus).toBe('upheld');
    });

    // ---------- AdminActionLog wiring (feat/admin-action-log) ----------

    it('records an AdminActionLog row after a successful appeal decision, with the decision as notes', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(
        report({ status: 'actioned', appealStatus: 'pending', reviewedByAdminId: 'admin-1' }),
      );
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ authorId: 'post-author' });
      (prisma.report.update as jest.Mock).mockResolvedValue(report({ appealStatus: 'upheld' }));
      const service = buildService(prisma, buildEmailServiceMock(), adminActionLogService);

      await service.decideAppeal('report-1', 'admin-2', { decision: 'upheld' });

      expect(adminActionLogService.record).toHaveBeenCalledTimes(1);
      expect(adminActionLogService.record).toHaveBeenCalledWith(
        'admin-2',
        'report.appeal_decided',
        'report',
        'report-1',
        'upheld',
      );
    });

    it('never records an AdminActionLog row when the report does not exist (404)', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(null);
      const service = buildService(prisma, buildEmailServiceMock(), adminActionLogService);

      await expect(service.decideAppeal('missing', 'admin-2', { decision: 'upheld' })).rejects.toThrow(
        NotFoundException,
      );
      expect(adminActionLogService.record).not.toHaveBeenCalled();
    });

    it('never records an AdminActionLog row when there is no pending appeal (409)', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ status: 'actioned', appealStatus: null }));
      const service = buildService(prisma, buildEmailServiceMock(), adminActionLogService);

      await expect(service.decideAppeal('report-1', 'admin-2', { decision: 'upheld' })).rejects.toThrow(
        ConflictException,
      );
      expect(adminActionLogService.record).not.toHaveBeenCalled();
    });

    it('never records an AdminActionLog row when the same admin who actioned the report tries to review its appeal (403, Decision Log #138)', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(
        report({ status: 'actioned', appealStatus: 'pending', reviewedByAdminId: 'admin-1' }),
      );
      const service = buildService(prisma, buildEmailServiceMock(), adminActionLogService);

      await expect(service.decideAppeal('report-1', 'admin-1', { decision: 'upheld' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(adminActionLogService.record).not.toHaveBeenCalled();
    });
  });

  // ---------- PATCH /admin/moderation/reports/:id/escalate ----------

  describe('escalateReport', () => {
    it('404s when the report does not exist, and never checks vetting', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(null);
      const service = buildService(prisma);

      await expect(
        service.escalateReport('missing', 'admin-1', { escalationNotes: 'urgent', escalatedToAuthority: false }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
    });

    it('403s a NON-vetted admin, regardless of the report\'s own concernsMinor value', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ concernsMinor: false }));
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ childSafetyVetted: false });
      const service = buildService(prisma);

      await expect(
        service.escalateReport('report-1', 'unvetted-admin', {
          escalationNotes: 'needs a second look',
          escalatedToAuthority: false,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.report.update).not.toHaveBeenCalled();
    });

    it('a vetted admin escalates internally (escalatedToAuthority: false) — sets the full trail', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report());
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ childSafetyVetted: true });
      (prisma.report.update as jest.Mock).mockResolvedValue(
        report({ escalatedAt: new Date(), escalatedByAdminId: 'vetted-admin', escalatedToAuthority: false }),
      );
      const service = buildService(prisma);

      const result = await service.escalateReport('report-1', 'vetted-admin', {
        escalationNotes: 'flagging for the designated child-safety lead',
        escalatedToAuthority: false,
      });

      expect(prisma.report.update).toHaveBeenCalledWith({
        where: { id: 'report-1' },
        data: {
          escalatedAt: expect.any(Date),
          escalatedByAdminId: 'vetted-admin',
          escalationNotes: 'flagging for the designated child-safety lead',
          escalatedToAuthority: false,
        },
      });
      expect(result.escalatedToAuthority).toBe(false);
    });

    it('a vetted admin records that they have already made an external report (escalatedToAuthority: true)', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report());
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ childSafetyVetted: true });
      (prisma.report.update as jest.Mock).mockResolvedValue(
        report({ escalatedToAuthority: true }),
      );
      const service = buildService(prisma);

      await service.escalateReport('report-1', 'vetted-admin', {
        escalationNotes: 'reported to the relevant authority this morning',
        escalatedToAuthority: true,
      });

      expect(prisma.report.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ escalatedToAuthority: true }) }),
      );
    });

    it('escalates a report regardless of its current status (not gated on open/reviewed/actioned)', async () => {
      const prisma = buildPrismaMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ status: 'actioned' }));
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ childSafetyVetted: true });
      (prisma.report.update as jest.Mock).mockResolvedValue(report({ status: 'actioned' }));
      const service = buildService(prisma);

      await expect(
        service.escalateReport('report-1', 'vetted-admin', {
          escalationNotes: 'still escalating after the fact',
          escalatedToAuthority: false,
        }),
      ).resolves.toBeDefined();
    });

    // ---------- AdminActionLog wiring (feat/admin-action-log) ----------

    it('records an AdminActionLog row after a successful escalation, with escalatedToAuthority + escalationNotes as notes', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report());
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ childSafetyVetted: true });
      (prisma.report.update as jest.Mock).mockResolvedValue(
        report({ escalatedAt: new Date(), escalatedByAdminId: 'vetted-admin', escalatedToAuthority: true }),
      );
      const service = buildService(prisma, buildEmailServiceMock(), adminActionLogService);

      await service.escalateReport('report-1', 'vetted-admin', {
        escalationNotes: 'reported to the relevant authority this morning',
        escalatedToAuthority: true,
      });

      expect(adminActionLogService.record).toHaveBeenCalledTimes(1);
      expect(adminActionLogService.record).toHaveBeenCalledWith(
        'vetted-admin',
        'report.escalated',
        'report',
        'report-1',
        'escalatedToAuthority=true: reported to the relevant authority this morning',
      );
    });

    it('never records an AdminActionLog row when the report does not exist (404)', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(null);
      const service = buildService(prisma, buildEmailServiceMock(), adminActionLogService);

      await expect(
        service.escalateReport('missing', 'admin-1', { escalationNotes: 'urgent', escalatedToAuthority: false }),
      ).rejects.toThrow(NotFoundException);
      expect(adminActionLogService.record).not.toHaveBeenCalled();
    });

    it('never records an AdminActionLog row when a non-vetted admin is blocked (403)', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(report({ concernsMinor: false }));
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ childSafetyVetted: false });
      const service = buildService(prisma, buildEmailServiceMock(), adminActionLogService);

      await expect(
        service.escalateReport('report-1', 'unvetted-admin', {
          escalationNotes: 'needs a second look',
          escalatedToAuthority: false,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(adminActionLogService.record).not.toHaveBeenCalled();
    });
  });

  // ---------- POST /reports/public ----------

  describe('createPublicReport', () => {
    const dto = {
      reporterContactEmail: 'concerned-parent@example.com',
      targetType: 'post' as const,
      targetId: 'post-1',
      reason: 'This photo shows my child without consent.',
      concernsMinor: true,
    };

    it('creates a report with reporterId null, the given contact email, and concernsMinor set', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      (prisma.report.create as jest.Mock).mockResolvedValue(
        report({ reporterId: null, reporterContactEmail: dto.reporterContactEmail, concernsMinor: true }),
      );
      const emailService = buildEmailServiceMock();
      const service = buildService(prisma, emailService);

      const result = await service.createPublicReport(dto);

      expect(prisma.report.create).toHaveBeenCalledWith({
        data: {
          reporterId: null,
          reporterContactEmail: dto.reporterContactEmail,
          targetType: 'post',
          targetId: 'post-1',
          reason: dto.reason,
          concernsMinor: true,
          severity: 'medium',
        },
      });
      expect(result.reporterId).toBeNull();
      expect(result.concernsMinor).toBe(true);
    });

    it('defaults severity to medium when omitted', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      (prisma.report.create as jest.Mock).mockResolvedValue(report({ reporterId: null, severity: 'medium' }));
      const emailService = buildEmailServiceMock();
      const service = buildService(prisma, emailService);

      await service.createPublicReport(dto);

      expect(prisma.report.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ severity: 'medium' }) }),
      );
    });

    it('forwards an explicit severity when given', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      (prisma.report.create as jest.Mock).mockResolvedValue(report({ reporterId: null, severity: 'high' }));
      const emailService = buildEmailServiceMock();
      const service = buildService(prisma, emailService);

      await service.createPublicReport({ ...dto, severity: 'high' });

      expect(prisma.report.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ severity: 'high' }) }),
      );
    });

    it('404s when the reported target does not exist, and never creates a Report or sends an email', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);
      const emailService = buildEmailServiceMock();
      const service = buildService(prisma, emailService);

      await expect(service.createPublicReport(dto)).rejects.toThrow(NotFoundException);
      expect(prisma.report.create).not.toHaveBeenCalled();
      expect(emailService.sendPublicReportAcknowledgementEmail).not.toHaveBeenCalled();
    });

    it('sends the acknowledgment email to the given contact address on success', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-9' });
      (prisma.report.create as jest.Mock).mockResolvedValue(report({ reporterId: null, targetType: 'user' }));
      const emailService = buildEmailServiceMock();
      const service = buildService(prisma, emailService);

      await service.createPublicReport({ ...dto, targetType: 'user', targetId: 'user-9' });

      expect(emailService.sendPublicReportAcknowledgementEmail).toHaveBeenCalledWith(dto.reporterContactEmail);
    });

    it('does not let a failed acknowledgment email reject report submission', async () => {
      const prisma = buildPrismaMock();
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue({ id: 'comment-1' });
      (prisma.report.create as jest.Mock).mockResolvedValue(report({ reporterId: null, targetType: 'comment' }));
      const emailService = { sendPublicReportAcknowledgementEmail: jest.fn().mockRejectedValue(new Error('down')) };
      const service = buildService(prisma, emailService);

      await expect(
        service.createPublicReport({ ...dto, targetType: 'comment', targetId: 'comment-1' }),
      ).resolves.toBeDefined();
    });
  });
});
