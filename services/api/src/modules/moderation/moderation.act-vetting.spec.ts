import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CHILD_SAFETY_VETTING_REQUIRED_CODE } from './moderation.constants';
import { ModerationService } from './moderation.service';

// backend/b297-vetting-to-act-on-child-message-reports (B-297, Decision Log #491): only a child-safety-vetted admin
// may ACT on a message report whose reported sender or any conversation participant is under 18. Mocked Prisma.

const MESSAGE_ID = '11111111-1111-4111-8111-111111111111';

type Users = { id: string; isMinor: boolean }[];

function build(opts: {
  vetted?: boolean;
  users?: Users;
  messageMissing?: boolean;
  report?: Record<string, unknown>;
} = {}) {
  const participants = ['u-reporter', 'u-sender'];
  const users = opts.users ?? participants.map((id) => ({ id, isMinor: false }));
  const report = {
    id: 'report-1',
    reporterId: 'u-reporter',
    targetType: 'message',
    targetId: MESSAGE_ID,
    status: 'open',
    concernsMinor: false,
    appealStatus: 'pending',
    reviewedByAdminId: 'admin-original',
    ...opts.report,
  };
  const prisma = {
    report: { findUnique: jest.fn().mockResolvedValue(report) },
    adminUser: { findUnique: jest.fn().mockResolvedValue({ childSafetyVetted: opts.vetted ?? false }) },
    message: {
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.messageMissing ? null : { senderId: 'u-sender', conversation: { participantIds: participants } }),
    },
    user: { findMany: jest.fn().mockResolvedValue(users) },
  } as unknown as PrismaService & {
    adminUser: { findUnique: jest.Mock };
    message: { findUnique: jest.Mock };
    user: { findMany: jest.Mock };
  };
  const service = new ModerationService(
    prisma,
    { sendPublicReportAcknowledgementEmail: jest.fn(), sendReportActionedEmail: jest.fn(), sendAppealDecisionEmail: jest.fn() } as never,
    { record: jest.fn() } as never,
    { setRoomStatus: jest.fn() } as never,
    { notifyInBackground: jest.fn() } as never,
    { applySuspensionInTx: jest.fn(), completeSuspension: jest.fn(), applyReinstatementInTx: jest.fn(), completeReinstatement: jest.fn() } as never,
  );
  return { prisma, service, report };
}

async function expectVettingRefusal(p: Promise<unknown>) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ForbiddenException);
  expect((err as ForbiddenException).getResponse()).toMatchObject({ code: CHILD_SAFETY_VETTING_REQUIRED_CODE });
}

const minorSender: Users = [
  { id: 'u-reporter', isMinor: false },
  { id: 'u-sender', isMinor: true },
];
const minorParticipant: Users = [
  { id: 'u-reporter', isMinor: true },
  { id: 'u-sender', isMinor: false },
];

describe('assertVettedToActOn (B-297)', () => {
  describe('unvetted admin', () => {
    it.each([
      ['a minor sender', { users: minorSender }],
      ['a minor participant', { users: minorParticipant }],
      ['a missing message row (fails closed)', { messageMissing: true }],
      ['a participant with no User row (fails closed)', { users: [{ id: 'u-reporter', isMinor: false }] }],
    ])('is refused on a message report with %s', async (_label, o) => {
      const { service, report } = build(o);
      await expectVettingRefusal(service.assertVettedToActOn(report as never, 'admin-1'));
    });

    it('is allowed on an adult-only thread', async () => {
      const { service, report } = build();
      await expect(service.assertVettedToActOn(report as never, 'admin-1')).resolves.toBeUndefined();
    });

    it('is refused on a concernsMinor message report (unchanged rule), without reading the thread', async () => {
      const { service, report, prisma } = build({ report: { concernsMinor: true } });
      await expectVettingRefusal(service.assertVettedToActOn(report as never, 'admin-1'));
      expect(prisma.message.findUnique).not.toHaveBeenCalled();
    });

    it('is allowed on a non-message report and the thread is never read', async () => {
      const { service, report, prisma } = build({ report: { targetType: 'post' }, users: minorSender });
      await expect(service.assertVettedToActOn(report as never, 'admin-1')).resolves.toBeUndefined();
      expect(prisma.message.findUnique).not.toHaveBeenCalled();
      expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
    });

    it('is refused on a concernsMinor non-message report', async () => {
      const { service, report } = build({ report: { targetType: 'post', concernsMinor: true } });
      await expectVettingRefusal(service.assertVettedToActOn(report as never, 'admin-1'));
    });
  });

  describe('vetted admin', () => {
    it.each([
      ['a minor sender', { users: minorSender }],
      ['a minor participant', { users: minorParticipant }],
      ['a missing message row', { messageMissing: true }],
      ['an adult-only thread', {}],
      ['a concernsMinor message report', { report: { concernsMinor: true } }],
      ['a non-message report', { report: { targetType: 'comment' } }],
    ])('is never blocked (%s) and the thread is not looked up', async (_label, o) => {
      const { service, report, prisma } = build({ vetted: true, ...o });
      await expect(service.assertVettedToActOn(report as never, 'admin-1')).resolves.toBeUndefined();
      expect(prisma.message.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('wired into actionReport and decideAppeal', () => {
    it('actionReport refuses an unvetted admin on a child-involved message report before any status check', async () => {
      const { service } = build({ users: minorSender, report: { status: 'actioned' } });
      // status 'actioned' would be a 409; the 403 must come first.
      await expectVettingRefusal(service.actionReport('report-1', 'admin-1', { action: 'dismissed' } as never));
    });

    it('decideAppeal refuses an unvetted admin on a child-involved message report before the appeal checks', async () => {
      const { service } = build({ users: minorParticipant, report: { status: 'actioned', appealStatus: null } });
      await expectVettingRefusal(service.decideAppeal('report-1', 'admin-1', { decision: 'upheld' } as never));
    });

    it('getReportById is NOT gated for an unvetted admin on a child-involved message report (viewing stays open)', async () => {
      const { service, prisma } = build({ users: minorSender });
      // getReportById reads more than this fake provides; it must not throw the vetting 403 before those reads.
      (prisma as unknown as { reportContextMessage: unknown }).reportContextMessage = { findMany: jest.fn().mockResolvedValue([]) };
      prisma.message.findUnique.mockImplementation((args: { select: Record<string, unknown> }) =>
        'conversation' in args.select
          ? Promise.resolve({ senderId: 'u-sender', conversation: { participantIds: ['u-reporter', 'u-sender'] } })
          : Promise.resolve({
              id: MESSAGE_ID,
              sentAt: new Date(),
              contentText: 't',
              originalContentText: null,
              editedAt: null,
              deletedForEveryoneAt: null,
              removedByModerationAt: null,
              sender: { username: 's', displayName: 'S' },
            }),
      );
      const detail = await service.getReportById('report-1', 'admin-1');
      expect(detail.contextHidden).toBe(true);
    });
  });
});
