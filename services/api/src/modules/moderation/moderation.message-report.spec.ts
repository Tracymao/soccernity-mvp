import { NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePublicReportDto } from './dto/create-public-report.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { PUBLIC_REPORT_TARGET_TYPES, REPORT_TARGET_TYPES } from './moderation.constants';
import { ModerationService } from './moderation.service';
import { resolveReportedUserId } from './report-target.util';

// backend/b067-message-report (founder decision 2026-11-08): a person can report a message in a chat. Mocked-Prisma
// unit tests for the branching (who may report, which messages are reportable, the repeat rule, the admin read
// shape, resolveReportedUserId). The real SQL (the advisory lock, the relation filters) is proven against Postgres
// in test/message-report.e2e-spec.ts.

const RECIPIENT = 'user-recipient';
const SENDER = 'user-sender';
const STRANGER = 'user-stranger';
const MESSAGE_ID = '11111111-1111-4111-8111-111111111111';
const SENT_AT = new Date('2026-02-01T10:00:00.000Z');

interface MessageRow {
  id: string;
  senderId: string;
  sentAt: Date;
  conversationId: string;
  deletedForEveryoneAt: Date | null;
  conversation: { participantIds: string[] };
  hides: { userId: string }[];
}

function messageRow(over: Partial<MessageRow> = {}): MessageRow {
  return {
    id: MESSAGE_ID,
    senderId: SENDER,
    sentAt: SENT_AT,
    conversationId: 'conv-1',
    deletedForEveryoneAt: null,
    conversation: { participantIds: [RECIPIENT, SENDER] },
    hides: [],
    ...over,
  };
}

function buildPrisma() {
  const prisma = {
    message: { findUnique: jest.fn().mockResolvedValue(messageRow()), findMany: jest.fn().mockResolvedValue([]) },
    reportContextMessage: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    conversationHide: { findUnique: jest.fn().mockResolvedValue(null) },
    report: {
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'new-report', ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
    },
    adminUser: { findUnique: jest.fn().mockResolvedValue({ childSafetyVetted: true }) },
    $executeRaw: jest.fn().mockResolvedValue(1),
  } as unknown as PrismaService & {
    message: { findUnique: jest.Mock; findMany: jest.Mock };
    reportContextMessage: { findMany: jest.Mock; createMany: jest.Mock };
    conversationHide: { findUnique: jest.Mock };
    report: { create: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock };
    adminUser: { findUnique: jest.Mock };
    $executeRaw: jest.Mock;
  };
  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

function buildService(prisma: PrismaService): ModerationService {
  return new ModerationService(
    prisma,
    { sendPublicReportAcknowledgementEmail: jest.fn(), sendReportActionedEmail: jest.fn(), sendAppealDecisionEmail: jest.fn() } as never,
    { record: jest.fn() } as never,
    { setRoomStatus: jest.fn() } as never,
    { notifyInBackground: jest.fn() } as never,
    { applySuspensionInTx: jest.fn(), completeSuspension: jest.fn(), applyReinstatementInTx: jest.fn(), completeReinstatement: jest.fn() } as never,
  );
}

const dto = (over: Record<string, unknown> = {}) =>
  ({ targetType: 'message', targetId: MESSAGE_ID, reasonCategory: 'harassment_or_bullying', ...over }) as never;

describe('message reports (b067-message-report)', () => {
  describe('target types', () => {
    it('message is a user-reportable type', () => {
      expect(REPORT_TARGET_TYPES).toContain('message');
    });

    it('POST /reports validates message as a target type', async () => {
      const errors = await validate(
        plainToInstance(CreateReportDto, { targetType: 'message', targetId: MESSAGE_ID, reasonCategory: 'spam_or_scam' }),
      );
      expect(errors).toEqual([]);
    });

    it('the public route never offers message: it is not in the list and the DTO rejects it', async () => {
      expect(PUBLIC_REPORT_TARGET_TYPES).not.toContain('message');
      expect(PUBLIC_REPORT_TARGET_TYPES).toEqual(expect.arrayContaining(['post', 'user', 'comment']));
      const errors = await validate(
        plainToInstance(CreatePublicReportDto, {
          reporterContactEmail: 'a@example.com',
          targetType: 'message',
          targetId: MESSAGE_ID,
          reasonCategory: 'spam_or_scam',
          concernsMinor: false,
        }),
      );
      expect(errors.map((e) => e.property)).toContain('targetType');
    });
  });

  describe('createReport: who may report, and which messages', () => {
    it('the recipient can report: a Report row is created with the message as the target', async () => {
      const prisma = buildPrisma();
      const created = await buildService(prisma).createReport(RECIPIENT, dto());
      expect(prisma.report.create).toHaveBeenCalledTimes(1);
      expect(prisma.report.create.mock.calls[0][0].data).toMatchObject({
        reporterId: RECIPIENT,
        targetType: 'message',
        targetId: MESSAGE_ID,
        reasonCategory: 'harassment_or_bullying',
        reason: '',
        concernsMinor: false,
        severity: 'medium',
      });
      expect(created).toMatchObject({ id: 'new-report' });
    });

    it('the SENDER cannot report their own message: the same 404 a missing message gives, nothing created', async () => {
      const prisma = buildPrisma();
      await expect(buildService(prisma).createReport(SENDER, dto())).rejects.toThrow(new NotFoundException('Message not found'));
      expect(prisma.report.create).not.toHaveBeenCalled();
    });

    it('a stranger (not in the conversation) gets the same 404', async () => {
      const prisma = buildPrisma();
      await expect(buildService(prisma).createReport(STRANGER, dto())).rejects.toThrow(new NotFoundException('Message not found'));
      expect(prisma.report.create).not.toHaveBeenCalled();
    });

    it('a missing message is a 404', async () => {
      const prisma = buildPrisma();
      prisma.message.findUnique.mockResolvedValue(null);
      await expect(buildService(prisma).createReport(RECIPIENT, dto())).rejects.toThrow(NotFoundException);
      expect(prisma.report.create).not.toHaveBeenCalled();
    });

    it('a message the reporter hid for themselves (delete for me) is a 404', async () => {
      const prisma = buildPrisma();
      prisma.message.findUnique.mockResolvedValue(messageRow({ hides: [{ userId: RECIPIENT }] }));
      await expect(buildService(prisma).createReport(RECIPIENT, dto())).rejects.toThrow(NotFoundException);
      expect(prisma.report.create).not.toHaveBeenCalled();
    });

    it('the hide lookup is scoped to the REPORTER: another person hiding it does not matter', async () => {
      const prisma = buildPrisma();
      await buildService(prisma).createReport(RECIPIENT, dto());
      expect(prisma.message.findUnique.mock.calls[0][0].select.hides).toEqual({
        where: { userId: RECIPIENT },
        select: { userId: true },
        take: 1,
      });
    });

    it('a message deleted for everyone is a 404', async () => {
      const prisma = buildPrisma();
      prisma.message.findUnique.mockResolvedValue(messageRow({ deletedForEveryoneAt: new Date() }));
      await expect(buildService(prisma).createReport(RECIPIENT, dto())).rejects.toThrow(NotFoundException);
      expect(prisma.report.create).not.toHaveBeenCalled();
    });

    it('a message sent at or before the moment the reporter deleted the chat is a 404; one sent after is reportable', async () => {
      const prisma = buildPrisma();
      prisma.conversationHide.findUnique.mockResolvedValue({ hiddenAt: SENT_AT });
      await expect(buildService(prisma).createReport(RECIPIENT, dto())).rejects.toThrow(NotFoundException);

      prisma.conversationHide.findUnique.mockResolvedValue({ hiddenAt: new Date(SENT_AT.getTime() - 1) });
      await expect(buildService(prisma).createReport(RECIPIENT, dto())).resolves.toBeDefined();
    });

    it('the chat-hide lookup is keyed on the reporter and this conversation', async () => {
      const prisma = buildPrisma();
      await buildService(prisma).createReport(RECIPIENT, dto());
      expect(prisma.conversationHide.findUnique.mock.calls[0][0].where).toEqual({
        userId_conversationId: { userId: RECIPIENT, conversationId: 'conv-1' },
      });
    });

    it('a block between the two people does NOT stop the recipient reporting', async () => {
      // There is no block lookup in the path at all (the thread still shows the message to the blocker).
      const prisma = buildPrisma();
      await expect(buildService(prisma).createReport(RECIPIENT, dto())).resolves.toBeDefined();
      expect(Object.keys(prisma)).not.toContain('block');
    });

    it('the same reason rules apply: category other needs a description (coded 400) before any lookup', async () => {
      const prisma = buildPrisma();
      await expect(buildService(prisma).createReport(RECIPIENT, dto({ reasonCategory: 'other' }))).rejects.toMatchObject({
        response: { code: 'report_reason_required' },
      });
      expect(prisma.message.findUnique).not.toHaveBeenCalled();
    });

    it('child_safety_concern sets concernsMinor exactly as for any report; severity and description pass through', async () => {
      const prisma = buildPrisma();
      await buildService(prisma).createReport(RECIPIENT, dto({ reasonCategory: 'child_safety_concern', reason: 'asked my age', severity: 'high' }));
      expect(prisma.report.create.mock.calls[0][0].data).toMatchObject({
        concernsMinor: true,
        reason: 'asked my age',
        severity: 'high',
      });
    });

    it('does not touch the post/comment/user lookups (the message path is its own)', async () => {
      const prisma = buildPrisma();
      await buildService(prisma).createReport(RECIPIENT, dto());
      expect(Object.keys(prisma).filter((k) => ['post', 'comment', 'user'].includes(k))).toEqual([]);
    });
  });

  describe('createReport: one open report per reporter per message', () => {
    it('a repeat while the earlier report is still open returns that report and creates no second row', async () => {
      const prisma = buildPrisma();
      const existing = { id: 'existing-report', reporterId: RECIPIENT, targetType: 'message', targetId: MESSAGE_ID, status: 'open' };
      prisma.report.findFirst.mockResolvedValue(existing);
      const result = await buildService(prisma).createReport(RECIPIENT, dto());
      expect(result).toBe(existing);
      expect(prisma.report.create).not.toHaveBeenCalled();
    });

    it('the duplicate check is open reports only, keyed on reporter + message, under a per-(reporter, message) advisory lock', async () => {
      const prisma = buildPrisma();
      await buildService(prisma).createReport(RECIPIENT, dto());
      expect(prisma.report.findFirst.mock.calls[0][0].where).toEqual({
        reporterId: RECIPIENT,
        targetType: 'message',
        targetId: MESSAGE_ID,
        status: 'open',
      });
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      const lockKey = prisma.$executeRaw.mock.calls[0].slice(1)[0];
      expect(lockKey).toBe(`message-report:${RECIPIENT}:${MESSAGE_ID}`);
    });

    it('a refused report (sender, stranger) never reaches the duplicate check', async () => {
      const prisma = buildPrisma();
      await expect(buildService(prisma).createReport(SENDER, dto())).rejects.toThrow(NotFoundException);
      expect(prisma.report.findFirst).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('getReportById: the admin read of a message report', () => {
    const REPORT = {
      id: 'report-1',
      reporterId: RECIPIENT,
      targetType: 'message',
      targetId: MESSAGE_ID,
      status: 'open',
      concernsMinor: false,
    };

    function messageDetailRow(over: Record<string, unknown> = {}) {
      return {
        id: MESSAGE_ID,
        sentAt: SENT_AT,
        contentText: 'current text',
        originalContentText: null,
        editedAt: null,
        deletedForEveryoneAt: null,
        removedByModerationAt: null,
        sender: { username: 'sender_name', displayName: 'Real Sender Name' },
        ...over,
      };
    }

    it('returns the report with ONLY the reported message attached (an unedited message)', async () => {
      const prisma = buildPrisma();
      prisma.report.findUnique.mockResolvedValue(REPORT);
      prisma.message.findUnique.mockResolvedValue(messageDetailRow());
      const detail = await buildService(prisma).getReportById('report-1', 'admin-1');
      expect(detail.reportedMessage).toEqual({
        id: MESSAGE_ID,
        sentAt: SENT_AT,
        sender: { publicName: 'sender_name' },
        contentText: 'current text',
        originalContentText: null,
        editedAt: null,
        deletedForEveryone: false,
        removedByModerationAt: null,
      });
    });

    it('selects exactly this message: no conversation id, no media, no other message, no recipient, no real name in the response', async () => {
      const prisma = buildPrisma();
      prisma.report.findUnique.mockResolvedValue(REPORT);
      prisma.message.findUnique.mockResolvedValue(messageDetailRow());
      const detail = await buildService(prisma).getReportById('report-1', 'admin-1');
      expect(prisma.message.findUnique.mock.calls[0][0].where).toEqual({ id: MESSAGE_ID });
      expect(Object.keys(prisma.message.findUnique.mock.calls[0][0].select).sort()).toEqual(
        ['contentText', 'deletedForEveryoneAt', 'editedAt', 'id', 'originalContentText', 'removedByModerationAt', 'sender', 'sentAt'].sort(),
      );
      expect(Object.keys(detail.reportedMessage!).sort()).toEqual(
        ['contentText', 'deletedForEveryone', 'editedAt', 'id', 'originalContentText', 'removedByModerationAt', 'sender', 'sentAt'].sort(),
      );
      expect(JSON.stringify(detail)).not.toContain('Real Sender Name');
      expect(JSON.stringify(detail.reportedMessage)).not.toContain('conv-1');
    });

    it('an edited message returns BOTH the current and the original text, and editedAt', async () => {
      const prisma = buildPrisma();
      const editedAt = new Date('2026-02-01T10:05:00.000Z');
      prisma.report.findUnique.mockResolvedValue(REPORT);
      prisma.message.findUnique.mockResolvedValue(
        messageDetailRow({ contentText: 'new, harmless text', originalContentText: 'the abusive original', editedAt }),
      );
      const detail = await buildService(prisma).getReportById('report-1', 'admin-1');
      expect(detail.reportedMessage).toMatchObject({
        contentText: 'new, harmless text',
        originalContentText: 'the abusive original',
        editedAt,
        deletedForEveryone: false,
      });
    });

    it('a message deleted for everyone still returns its text to the moderator, flagged', async () => {
      const prisma = buildPrisma();
      prisma.report.findUnique.mockResolvedValue(REPORT);
      prisma.message.findUnique.mockResolvedValue(messageDetailRow({ deletedForEveryoneAt: new Date(), contentText: 'what was said' }));
      const detail = await buildService(prisma).getReportById('report-1', 'admin-1');
      expect(detail.reportedMessage).toMatchObject({ contentText: 'what was said', deletedForEveryone: true });
    });

    it('an anonymised sender shows as [deleted user]; a sender with no username shows the placeholder, never the real name', async () => {
      const prisma = buildPrisma();
      prisma.report.findUnique.mockResolvedValue(REPORT);
      prisma.message.findUnique.mockResolvedValue(messageDetailRow({ sender: { username: null, displayName: '[deleted user]' } }));
      expect((await buildService(prisma).getReportById('report-1', 'admin-1')).reportedMessage!.sender.publicName).toBe('[deleted user]');
      prisma.message.findUnique.mockResolvedValue(messageDetailRow({ sender: { username: null, displayName: 'Jane Doe' } }));
      expect((await buildService(prisma).getReportById('report-1', 'admin-1')).reportedMessage!.sender.publicName).toBe('Soccernity member');
    });

    it('a missing message row gives reportedMessage null, never a crash', async () => {
      const prisma = buildPrisma();
      prisma.report.findUnique.mockResolvedValue(REPORT);
      prisma.message.findUnique.mockResolvedValue(null);
      expect((await buildService(prisma).getReportById('report-1', 'admin-1')).reportedMessage).toBeNull();
    });

    it('the child-safety vetting gate applies first: a non-vetted admin never reaches the message', async () => {
      const prisma = buildPrisma();
      prisma.report.findUnique.mockResolvedValue({ ...REPORT, concernsMinor: true });
      prisma.adminUser.findUnique.mockResolvedValue({ childSafetyVetted: false });
      await expect(buildService(prisma).getReportById('report-1', 'admin-1')).rejects.toMatchObject({
        response: { code: 'child_safety_vetting_required' },
      });
      expect(prisma.message.findUnique).not.toHaveBeenCalled();
    });

    it('other target types are unchanged: no reportedMessage key, no message read', async () => {
      const prisma = buildPrisma();
      prisma.report.findUnique.mockResolvedValue({ ...REPORT, targetType: 'comment' });
      const detail = await buildService(prisma).getReportById('report-1', 'admin-1');
      expect('reportedMessage' in detail).toBe(false);
      expect(prisma.message.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('resolveReportedUserId', () => {
    it('a message resolves to its SENDER (like a comment resolves to its author)', async () => {
      const prisma = buildPrisma();
      prisma.message.findUnique.mockResolvedValue({ senderId: SENDER });
      await expect(resolveReportedUserId(prisma, 'message', MESSAGE_ID)).resolves.toBe(SENDER);
      expect(prisma.message.findUnique).toHaveBeenCalledWith({ where: { id: MESSAGE_ID }, select: { senderId: true } });
    });

    it('a missing message resolves to null', async () => {
      const prisma = buildPrisma();
      prisma.message.findUnique.mockResolvedValue(null);
      await expect(resolveReportedUserId(prisma, 'message', MESSAGE_ID)).resolves.toBeNull();
    });
  });
});
