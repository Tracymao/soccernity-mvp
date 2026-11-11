import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ModerationService } from './moderation.service';

// backend/b293-message-context-vetting (B-293, Decision Log #486): on a message report, when the reported sender or any
// participant of the conversation is under 18, an admin who is not child-safety-vetted gets the reported message
// without its edited original, no context messages and contextHidden: true. Mocked Prisma; no e2e needed (plain
// reads, no raw SQL, transaction or new relation).

const MESSAGE_ID = '11111111-1111-4111-8111-111111111111';
const SENT_AT = new Date('2026-02-01T10:00:00.000Z');
const EDITED_AT = new Date('2026-02-01T10:05:00.000Z');
const REPORT = { id: 'report-1', reporterId: 'u-reporter', targetType: 'message', targetId: MESSAGE_ID, status: 'open', concernsMinor: false };

const detailRow = {
  id: MESSAGE_ID,
  sentAt: SENT_AT,
  contentText: 'current text',
  originalContentText: 'the text as first sent',
  editedAt: EDITED_AT,
  deletedForEveryoneAt: null,
  removedByModerationAt: null,
  sender: { username: 'sender_name', displayName: 'Real Sender' },
};
const contextRow = {
  message: {
    id: '22222222-2222-4222-8222-222222222222',
    sentAt: new Date('2026-02-01T09:59:00.000Z'),
    senderId: 'u-reporter',
    contentText: 'context text',
    originalContentText: 'context original',
    editedAt: EDITED_AT,
    deletedForEveryoneAt: null,
    removedByModerationAt: null,
    sender: { username: 'reporter_name', displayName: 'Real Reporter' },
  },
};

type Users = { id: string; isMinor: boolean }[];

function build(opts: { vetted?: boolean; users?: Users; participants?: string[]; senderId?: string } = {}) {
  const participants = opts.participants ?? ['u-reporter', 'u-sender'];
  const users = opts.users ?? participants.map((id) => ({ id, isMinor: false }));
  const prisma = {
    report: { findUnique: jest.fn().mockResolvedValue(REPORT) },
    adminUser: { findUnique: jest.fn().mockResolvedValue({ childSafetyVetted: opts.vetted ?? false }) },
    message: {
      findUnique: jest.fn().mockImplementation((args: { select: Record<string, unknown> }) =>
        'conversation' in args.select
          ? Promise.resolve({ senderId: opts.senderId ?? 'u-sender', conversation: { participantIds: participants } })
          : Promise.resolve(detailRow),
      ),
    },
    reportContextMessage: { findMany: jest.fn().mockResolvedValue([contextRow, { message: { ...contextRow.message, id: 'c3' } }]) },
    user: { findMany: jest.fn().mockResolvedValue(users) },
  } as unknown as PrismaService & {
    report: { findUnique: jest.Mock };
    adminUser: { findUnique: jest.Mock };
    message: { findUnique: jest.Mock };
    reportContextMessage: { findMany: jest.Mock };
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
  return { prisma, service };
}

describe('getReportById: vetted-only message context (B-293)', () => {
  describe('an unvetted admin, somebody in the thread under 18', () => {
    it('hides context and the original when the reported SENDER is a minor', async () => {
      const { prisma, service } = build({ users: [{ id: 'u-reporter', isMinor: false }, { id: 'u-sender', isMinor: true }] });
      const detail = await service.getReportById('report-1', 'admin-1');
      expect(detail.contextHidden).toBe(true);
      expect(detail.contextMessages).toEqual([]);
      expect(detail.reportedMessage).toMatchObject({ id: MESSAGE_ID, contentText: 'current text', originalContentText: null, editedAt: EDITED_AT });
      expect(prisma.reportContextMessage.findMany).not.toHaveBeenCalled();
    });

    it('hides when only the OTHER participant (the reporter) is a minor', async () => {
      const { service } = build({ users: [{ id: 'u-reporter', isMinor: true }, { id: 'u-sender', isMinor: false }] });
      const detail = await service.getReportById('report-1', 'admin-1');
      expect(detail.contextHidden).toBe(true);
      expect(detail.contextMessages).toEqual([]);
      expect(detail.reportedMessage!.originalContentText).toBeNull();
    });

    it('reads isMinor from the participants of the conversation, sender included', async () => {
      const { prisma, service } = build();
      await service.getReportById('report-1', 'admin-1');
      const args = prisma.user.findMany.mock.calls[0][0];
      expect([...args.where.id.in].sort()).toEqual(['u-reporter', 'u-sender']);
      expect(args.select).toEqual({ id: true, isMinor: true });
    });

    it('fails closed when a participant has no User row', async () => {
      const { service } = build({ users: [{ id: 'u-reporter', isMinor: false }] });
      expect((await service.getReportById('report-1', 'admin-1')).contextHidden).toBe(true);
    });

    it('fails closed when the reported message row cannot be found', async () => {
      const { prisma, service } = build();
      prisma.message.findUnique.mockResolvedValue(null);
      const detail = await service.getReportById('report-1', 'admin-1');
      expect(detail.contextHidden).toBe(true);
      expect(detail.reportedMessage).toBeNull();
      expect(detail.contextMessages).toEqual([]);
    });

    it('leaks no count: a hidden response is identical whether 0 or many were attached', async () => {
      const minors: Users = [{ id: 'u-reporter', isMinor: false }, { id: 'u-sender', isMinor: true }];
      const many = build({ users: minors });
      const none = build({ users: minors });
      none.prisma.reportContextMessage.findMany.mockResolvedValue([]);
      const a = await many.service.getReportById('report-1', 'admin-1');
      const b = await none.service.getReportById('report-1', 'admin-1');
      expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
      expect(none.prisma.reportContextMessage.findMany).not.toHaveBeenCalled();
      expect(JSON.stringify(a)).not.toContain('context text');
      expect(JSON.stringify(a)).not.toContain('the text as first sent');
    });
  });

  describe('everyone is an adult', () => {
    it('an unvetted admin sees everything, unchanged, contextHidden false', async () => {
      const { service } = build();
      const detail = await service.getReportById('report-1', 'admin-1');
      expect(detail.contextHidden).toBe(false);
      expect(detail.contextMessages).toHaveLength(2);
      expect(detail.contextMessages![0]).toMatchObject({ contentText: 'context text', originalContentText: 'context original' });
      expect(detail.reportedMessage).toMatchObject({ originalContentText: 'the text as first sent', editedAt: EDITED_AT });
    });
  });

  describe('a vetted admin', () => {
    it('sees everything when a participant is a minor, contextHidden false, and no isMinor read happens', async () => {
      const { prisma, service } = build({ vetted: true, users: [{ id: 'u-reporter', isMinor: false }, { id: 'u-sender', isMinor: true }] });
      const detail = await service.getReportById('report-1', 'admin-1');
      expect(detail.contextHidden).toBe(false);
      expect(detail.contextMessages).toHaveLength(2);
      expect(detail.reportedMessage!.originalContentText).toBe('the text as first sent');
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('the vetting read is fresh', () => {
    it('a viewer whose vetting changed between two calls gets the matching answer each time', async () => {
      const { prisma, service } = build({ users: [{ id: 'u-reporter', isMinor: false }, { id: 'u-sender', isMinor: true }] });
      prisma.adminUser.findUnique.mockResolvedValueOnce({ childSafetyVetted: true }).mockResolvedValueOnce({ childSafetyVetted: false });
      const first = await service.getReportById('report-1', 'admin-1');
      const second = await service.getReportById('report-1', 'admin-1');
      expect(first.contextHidden).toBe(false);
      expect(first.contextMessages).toHaveLength(2);
      expect(second.contextHidden).toBe(true);
      expect(second.contextMessages).toEqual([]);
      expect(prisma.adminUser.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('the concernsMinor gate still comes first', () => {
    it('an unvetted admin on a concernsMinor report gets the 403 and nothing is read', async () => {
      const { prisma, service } = build();
      prisma.report.findUnique.mockResolvedValue({ ...REPORT, concernsMinor: true });
      await expect(service.getReportById('report-1', 'admin-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.message.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  it('a non-message report has no contextHidden key', async () => {
    const { prisma, service } = build();
    prisma.report.findUnique.mockResolvedValue({ ...REPORT, targetType: 'post' });
    expect('contextHidden' in (await service.getReportById('report-1', 'admin-1'))).toBe(false);
  });
});
