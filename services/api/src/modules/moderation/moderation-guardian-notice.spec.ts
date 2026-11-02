import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ModerationService } from './moderation.service';

// backend/b279-guardian-safety-notices (B-279; Decision Log #456 A, B and C), the moderation hooks:
//   (A)/(C) an ACTIONED report (not a dismissed one) tells the guardian of the REPORTED user the kind of action;
//           an appeal decision tells the appellant's guardian the outcome only
//   (B)     creating a report (signed in or public) never notifies any guardian: a child may be reporting someone
//           in their own household
// The notice service itself decides whether the user is a minor with a confirmed guardian; these specs only
// check WHEN moderation asks it, and with which event.

function report(over: Record<string, unknown> = {}) {
  return {
    id: 'report-1',
    reporterId: 'reporter-1',
    targetType: 'post',
    targetId: 'post-1',
    reason: 'a reason the guardian must never see',
    status: 'open',
    concernsMinor: false,
    createdAt: new Date('2026-11-01T10:00:00.000Z'),
    reviewedByAdminId: null,
    appealStatus: null,
    ...over,
  };
}

function build() {
  const prisma = {
    report: {
      findUnique: jest.fn(),
      update: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => report(data)),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => report(data)),
    },
    post: { findUnique: jest.fn().mockResolvedValue({ id: 'post-1', authorId: 'minor-1' }) },
    comment: { findUnique: jest.fn().mockResolvedValue({ id: 'c-1', authorId: 'minor-1' }) },
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'minor-1', email: 'x@example.com', accountStatus: 'active' }) },
    banterRoom: { findUnique: jest.fn().mockResolvedValue({ id: 'room-1', createdBy: 'minor-1' }) },
    grassrootsTeam: { findUnique: jest.fn() },
    fixture: { findUnique: jest.fn() },
    adminUser: { findUnique: jest.fn().mockResolvedValue({ childSafetyVetted: true }) },
    notification: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  const email = {
    sendPublicReportAcknowledgementEmail: jest.fn().mockResolvedValue(undefined),
    sendReportActionedEmail: jest.fn().mockResolvedValue(undefined),
    sendAppealDecisionEmail: jest.fn().mockResolvedValue(undefined),
  };
  const adminLog = { record: jest.fn().mockResolvedValue(undefined) };
  const banter = { setRoomStatus: jest.fn().mockResolvedValue(undefined) };
  const guardianNotices = { notifyInBackground: jest.fn(), prepare: jest.fn() };
  const service = new ModerationService(
    prisma as unknown as PrismaService,
    email as never,
    adminLog as never,
    banter as never,
    guardianNotices as never,
  );
  return { service, prisma, guardianNotices, email };
}

describe('ModerationService: guardian notices (B-279)', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  describe('actionReport -> the REPORTED user\'s guardian (A and C)', () => {
    it.each([
      ['content_removed', 'content_removed'],
      ['warning_issued', 'warning_issued'],
      ['user_suspended', 'account_suspended'],
    ] as const)('action %s notifies the reported user\'s guardian with the %s event, once', async (action, event) => {
      const { service, prisma, guardianNotices } = build();
      prisma.report.findUnique.mockResolvedValue(report());

      await service.actionReport('report-1', 'admin-1', { action });

      expect(guardianNotices.notifyInBackground).toHaveBeenCalledTimes(1);
      expect(guardianNotices.notifyInBackground).toHaveBeenCalledWith('minor-1', event);
    });

    it('room_deactivated notifies the room creator\'s guardian with the room_deactivated event', async () => {
      const { service, prisma, guardianNotices } = build();
      prisma.report.findUnique.mockResolvedValue(report({ targetType: 'banter_room', targetId: 'room-1' }));

      await service.actionReport('report-1', 'admin-1', { action: 'room_deactivated' });

      expect(guardianNotices.notifyInBackground).toHaveBeenCalledTimes(1);
      expect(guardianNotices.notifyInBackground).toHaveBeenCalledWith('minor-1', 'room_deactivated');
    });

    it('a DISMISSED report sends nothing: no action was taken, and a guardian is never told a report exists', async () => {
      const { service, prisma, guardianNotices } = build();
      prisma.report.findUnique.mockResolvedValue(report());

      await service.actionReport('report-1', 'admin-1', { action: 'dismissed' });

      expect(guardianNotices.notifyInBackground).not.toHaveBeenCalled();
    });

    it('the notice goes to the REPORTED user, never to the reporter (B): a minor who reported someone is not told anything', async () => {
      const { service, prisma, guardianNotices } = build();
      // The reporter is some user; the post author is the reported user.
      prisma.report.findUnique.mockResolvedValue(report({ reporterId: 'minor-reporter' }));

      await service.actionReport('report-1', 'admin-1', { action: 'content_removed' });

      const targets = guardianNotices.notifyInBackground.mock.calls.map((c: unknown[]) => c[0]);
      expect(targets).toEqual(['minor-1']);
      expect(targets).not.toContain('minor-reporter');
    });

    it('a report whose reported user cannot be resolved (the post was deleted) sends nothing', async () => {
      const { service, prisma, guardianNotices } = build();
      prisma.report.findUnique.mockResolvedValue(report());
      prisma.post.findUnique.mockResolvedValue(null);

      await service.actionReport('report-1', 'admin-1', { action: 'content_removed' });

      expect(guardianNotices.notifyInBackground).not.toHaveBeenCalled();
    });

    it('a report made from a Contact Us enquiry has no reported user and sends nothing', async () => {
      const { service, prisma, guardianNotices } = build();
      prisma.report.findUnique.mockResolvedValue(report({ targetType: 'enquiry', targetId: 'enq-1', reporterId: null }));

      await service.actionReport('report-1', 'admin-1', { action: 'warning_issued' });

      expect(guardianNotices.notifyInBackground).not.toHaveBeenCalled();
    });

    it('nothing is sent when the action itself is refused (not open, 404, non-vetted admin)', async () => {
      const { service, prisma, guardianNotices } = build();
      prisma.report.findUnique.mockResolvedValue(report({ status: 'actioned' }));
      await expect(service.actionReport('report-1', 'admin-1', { action: 'content_removed' })).rejects.toThrow();

      prisma.report.findUnique.mockResolvedValue(null);
      await expect(service.actionReport('report-1', 'admin-1', { action: 'content_removed' })).rejects.toThrow();

      prisma.report.findUnique.mockResolvedValue(report({ concernsMinor: true }));
      prisma.adminUser.findUnique.mockResolvedValue({ childSafetyVetted: false });
      await expect(service.actionReport('report-1', 'admin-1', { action: 'content_removed' })).rejects.toThrow();

      expect(guardianNotices.notifyInBackground).not.toHaveBeenCalled();
    });
  });

  describe('decideAppeal -> the appellant\'s guardian: the outcome only', () => {
    const appealed = () => report({ status: 'actioned', appealStatus: 'pending', reviewedByAdminId: 'admin-1' });

    it.each([
      ['upheld', 'appeal_upheld'],
      ['overturned', 'appeal_overturned'],
    ] as const)('%s notifies the reported user\'s guardian with %s, once', async (decision, event) => {
      const { service, prisma, guardianNotices } = build();
      prisma.report.findUnique.mockResolvedValue(appealed());

      await service.decideAppeal('report-1', 'admin-2', { decision });

      expect(guardianNotices.notifyInBackground).toHaveBeenCalledTimes(1);
      expect(guardianNotices.notifyInBackground).toHaveBeenCalledWith('minor-1', event);
    });

    it('nothing is sent when the appeal decision is refused (same admin, no pending appeal)', async () => {
      const { service, prisma, guardianNotices } = build();
      prisma.report.findUnique.mockResolvedValue(appealed());
      await expect(service.decideAppeal('report-1', 'admin-1', { decision: 'upheld' })).rejects.toThrow();

      prisma.report.findUnique.mockResolvedValue(report());
      await expect(service.decideAppeal('report-1', 'admin-2', { decision: 'upheld' })).rejects.toThrow();

      expect(guardianNotices.notifyInBackground).not.toHaveBeenCalled();
    });
  });

  describe('creating a report never notifies any guardian (B)', () => {
    it('createReport (a signed-in user, who may be a minor) does not touch the notice service', async () => {
      const { service, prisma, guardianNotices } = build();
      prisma.post.findUnique.mockResolvedValue({ id: 'post-1', authorId: 'someone' });

      await service.createReport('minor-reporter', { targetType: 'post', targetId: 'post-1', reason: 'spam' } as never);

      expect(prisma.report.create).toHaveBeenCalledTimes(1);
      expect(guardianNotices.notifyInBackground).not.toHaveBeenCalled();
      expect(guardianNotices.prepare).not.toHaveBeenCalled();
    });

    it('createPublicReport does not touch the notice service either', async () => {
      const { service, prisma, guardianNotices } = build();
      prisma.post.findUnique.mockResolvedValue({ id: 'post-1', authorId: 'someone' });

      await service.createPublicReport({
        reporterContactEmail: 'a@example.com',
        targetType: 'post',
        targetId: 'post-1',
        reason: 'x',
        concernsMinor: true,
      } as never);

      expect(guardianNotices.notifyInBackground).not.toHaveBeenCalled();
      expect(guardianNotices.prepare).not.toHaveBeenCalled();
    });
  });
});
