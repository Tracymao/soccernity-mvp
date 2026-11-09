import { BadRequestException, ForbiddenException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePublicReportDto } from './dto/create-public-report.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { MESSAGE_REPORT_CONTEXT_MAX, MESSAGE_REPORT_CONTEXT_WINDOW } from './moderation.constants';
import { ModerationService } from './moderation.service';

// backend/b286-message-report-context (B-286, Decision Log #477): a 'message' report may attach other messages of the
// same conversation as context. Mocked-Prisma unit tests for every rule; the real SQL (the window ordering, the
// relation filters, the FK behaviour) is proven against Postgres in test/message-report-context.e2e-spec.ts.

const RECIPIENT = 'user-recipient';
const SENDER = 'user-sender';
const MESSAGE_ID = '11111111-1111-4111-8111-111111111111';
const SENT_AT = new Date('2026-02-01T10:00:00.000Z');
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function reportedRow(over: Record<string, unknown> = {}) {
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

interface CandidateRow {
  id: string;
  sentAt: Date;
  deletedForEveryoneAt: Date | null;
  hides: { userId: string }[];
}
const candidate = (id: string, over: Partial<CandidateRow> = {}): CandidateRow => ({
  id,
  sentAt: new Date(SENT_AT.getTime() + 1000),
  deletedForEveryoneAt: null,
  hides: [],
  ...over,
});

// message.findMany is called three times for a context check: before-window, after-window, then the candidate rows.
function buildPrisma(opts: { window?: string[]; candidates?: CandidateRow[]; existingContext?: string[] } = {}) {
  const window = opts.window ?? [];
  const prisma = {
    message: {
      findUnique: jest.fn().mockResolvedValue(reportedRow()),
      findMany: jest.fn().mockImplementation((args: { where: { id?: unknown }; orderBy?: unknown }) => {
        if (args.where.id) return Promise.resolve(opts.candidates ?? []);
        // window query: first half "before" (desc), second half "after" (asc) - the service unions them
        const isBefore = JSON.stringify(args.orderBy).includes('"desc"');
        return Promise.resolve((isBefore ? window.slice(0, 10) : window.slice(10)).map((id) => ({ id })));
      }),
    },
    conversationHide: { findUnique: jest.fn().mockResolvedValue(null) },
    report: {
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'new-report', ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
    },
    reportContextMessage: {
      findMany: jest.fn().mockResolvedValue((opts.existingContext ?? []).map((messageId) => ({ messageId }))),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    adminUser: { findUnique: jest.fn().mockResolvedValue({ childSafetyVetted: true }) },
    $executeRaw: jest.fn().mockResolvedValue(1),
  } as unknown as PrismaService & {
    message: { findUnique: jest.Mock; findMany: jest.Mock };
    conversationHide: { findUnique: jest.Mock };
    report: { create: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock };
    reportContextMessage: { findMany: jest.Mock; createMany: jest.Mock };
    adminUser: { findUnique: jest.Mock };
    $executeRaw: jest.Mock;
  };
  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

function build(prisma: PrismaService) {
  const email = { sendPublicReportAcknowledgementEmail: jest.fn(), sendReportActionedEmail: jest.fn(), sendAppealDecisionEmail: jest.fn() };
  const guardian = { notifyInBackground: jest.fn() };
  const service = new ModerationService(prisma, email as never, { record: jest.fn() } as never, { setRoomStatus: jest.fn() } as never, guardian as never);
  return { service, email, guardian };
}

const dto = (over: Record<string, unknown> = {}) =>
  ({ targetType: 'message', targetId: MESSAGE_ID, reasonCategory: 'harassment_or_bullying', ...over }) as never;

const NOT_FOUND = new NotFoundException('Message not found');

describe('message report context (b286-message-report-context)', () => {
  describe('the DTO', () => {
    const base = { targetType: 'message', targetId: MESSAGE_ID, reasonCategory: 'spam_or_scam' };

    it('accepts no field, an empty array, and up to 20 uuids', async () => {
      for (const contextMessageIds of [undefined, [], [uuid(1)], Array.from({ length: MESSAGE_REPORT_CONTEXT_MAX }, (_, i) => uuid(i + 1))]) {
        expect(await validate(plainToInstance(CreateReportDto, { ...base, contextMessageIds }))).toEqual([]);
      }
    });

    it('rejects 21 ids, a non-array, and a non-uuid entry', async () => {
      const tooMany = Array.from({ length: MESSAGE_REPORT_CONTEXT_MAX + 1 }, (_, i) => uuid(i + 1));
      for (const contextMessageIds of [tooMany, 'abc', [uuid(1), 'not-a-uuid'], [1]]) {
        const errors = await validate(plainToInstance(CreateReportDto, { ...base, contextMessageIds }));
        expect(errors.map((e) => e.property)).toContain('contextMessageIds');
      }
    });

    it('the public route never accepts the field (global pipe: forbidNonWhitelisted)', async () => {
      const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
      await expect(
        pipe.transform(
          {
            reporterContactEmail: 'a@example.com',
            targetType: 'post',
            targetId: MESSAGE_ID,
            reasonCategory: 'spam_or_scam',
            concernsMinor: false,
            contextMessageIds: [uuid(1)],
          },
          { type: 'body', metatype: CreatePublicReportDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('contextMessageIds with any other targetType', () => {
    it.each(['post', 'comment', 'user', 'banter_room', 'grassroots_team', 'fixture'])('%s: a coded 400 before any database read', async (targetType) => {
      const prisma = buildPrisma();
      const { service } = build(prisma);
      await expect(service.createReport(RECIPIENT, dto({ targetType, contextMessageIds: [uuid(1)] }))).rejects.toMatchObject({
        response: { statusCode: 400, code: 'report_context_not_allowed' },
      });
      expect(prisma.message.findUnique).not.toHaveBeenCalled();
      expect(prisma.message.findMany).not.toHaveBeenCalled();
      expect(prisma.report.create).not.toHaveBeenCalled();
    });

    it('even an EMPTY array is refused with another target type', async () => {
      const { service } = build(buildPrisma());
      await expect(service.createReport(RECIPIENT, dto({ targetType: 'post', contextMessageIds: [] }))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('omitting the field with another target type is unchanged (the post path still runs)', async () => {
      const prisma = buildPrisma();
      (prisma as unknown as { post: { findUnique: jest.Mock } }).post = { findUnique: jest.fn().mockResolvedValue({ id: MESSAGE_ID }) };
      const { service } = build(prisma);
      await expect(service.createReport(RECIPIENT, dto({ targetType: 'post' }))).resolves.toBeDefined();
      expect(prisma.reportContextMessage.createMany).not.toHaveBeenCalled();
    });
  });

  describe('a valid context set', () => {
    const win = Array.from({ length: 20 }, (_, i) => uuid(i + 1)); // first 10 = before, last 10 = after

    it('creates the report and attaches the ids; the window queries are 10 before and 10 after in (sentAt, id) order', async () => {
      const ids = [uuid(3), uuid(15)];
      const prisma = buildPrisma({ window: win, candidates: ids.map((id) => candidate(id)) });
      await build(prisma).service.createReport(RECIPIENT, dto({ contextMessageIds: ids }));

      const windowCalls = prisma.message.findMany.mock.calls.map((c) => c[0]).filter((a) => !a.where.id);
      expect(windowCalls).toHaveLength(2);
      const before = windowCalls.find((a) => JSON.stringify(a.orderBy).includes('"desc"'))!;
      const after = windowCalls.find((a) => JSON.stringify(a.orderBy).includes('"asc"'))!;
      expect(before).toMatchObject({
        where: { conversationId: 'conv-1', OR: [{ sentAt: { lt: SENT_AT } }, { sentAt: SENT_AT, id: { lt: MESSAGE_ID } }] },
        orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
        take: MESSAGE_REPORT_CONTEXT_WINDOW,
      });
      expect(after).toMatchObject({
        where: { conversationId: 'conv-1', OR: [{ sentAt: { gt: SENT_AT } }, { sentAt: SENT_AT, id: { gt: MESSAGE_ID } }] },
        orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
        take: MESSAGE_REPORT_CONTEXT_WINDOW,
      });
      expect(MESSAGE_REPORT_CONTEXT_WINDOW).toBe(10);
      expect(prisma.report.create).toHaveBeenCalledTimes(1);
      expect(prisma.reportContextMessage.createMany).toHaveBeenCalledWith({
        data: ids.map((messageId) => ({ reportId: 'new-report', messageId })),
        skipDuplicates: true,
      });
    });

    it('the candidate lookup is scoped to this conversation and the reporter hides; it selects no sender, so the reporter\'s own messages pass', async () => {
      const prisma = buildPrisma({ window: win, candidates: [candidate(uuid(2))] });
      await build(prisma).service.createReport(RECIPIENT, dto({ contextMessageIds: [uuid(2)] }));
      const call = prisma.message.findMany.mock.calls.map((c) => c[0]).find((a) => a.where.id)!;
      expect(call.where).toEqual({ id: { in: [uuid(2)] }, conversationId: 'conv-1' });
      expect(call.select).toEqual({
        id: true,
        sentAt: true,
        deletedForEveryoneAt: true,
        hides: { where: { userId: RECIPIENT }, select: { userId: true }, take: 1 },
      });
    });

    it('duplicates are dropped, in the order sent', async () => {
      const prisma = buildPrisma({ window: win, candidates: [candidate(uuid(5)), candidate(uuid(4))] });
      await build(prisma).service.createReport(RECIPIENT, dto({ contextMessageIds: [uuid(5), uuid(4), uuid(5)] }));
      expect(prisma.reportContextMessage.createMany.mock.calls[0][0].data.map((d: { messageId: string }) => d.messageId)).toEqual([uuid(5), uuid(4)]);
    });

    it('no field, null and an empty array attach nothing and run no window query', async () => {
      for (const contextMessageIds of [undefined, null, []]) {
        const prisma = buildPrisma({ window: win });
        await build(prisma).service.createReport(RECIPIENT, dto({ contextMessageIds }));
        expect(prisma.message.findMany).not.toHaveBeenCalled();
        expect(prisma.reportContextMessage.createMany).not.toHaveBeenCalled();
        expect(prisma.report.create).toHaveBeenCalledTimes(1);
      }
    });

    it('a filed report notifies nobody (no email, no guardian notice)', async () => {
      const prisma = buildPrisma({ window: win, candidates: [candidate(uuid(2))] });
      const { service, email, guardian } = build(prisma);
      await service.createReport(RECIPIENT, dto({ contextMessageIds: [uuid(2)] }));
      expect(email.sendPublicReportAcknowledgementEmail).not.toHaveBeenCalled();
      expect(email.sendReportActionedEmail).not.toHaveBeenCalled();
      expect(guardian.notifyInBackground).not.toHaveBeenCalled();
    });
  });

  describe('every failure is the same 404 "Message not found", and nothing is written', () => {
    const win = Array.from({ length: 20 }, (_, i) => uuid(i + 1));

    async function expectRefused(prisma: ReturnType<typeof buildPrisma>, ids: string[]) {
      const { service } = build(prisma);
      const err = await service.createReport(RECIPIENT, dto({ contextMessageIds: ids })).catch((e) => e);
      expect(err).toBeInstanceOf(NotFoundException);
      // the same body as every other refusal of this endpoint (a missing / own / stranger's message)
      expect(err.getResponse()).toEqual(NOT_FOUND.getResponse());
      expect(err.message).toBe('Message not found');
      expect(prisma.report.create).not.toHaveBeenCalled();
      expect(prisma.reportContextMessage.createMany).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled(); // never reached the transaction
    }

    it('an id outside the 10-before / 10-after window', async () => {
      await expectRefused(buildPrisma({ window: win, candidates: [candidate(uuid(99))] }), [uuid(99)]);
    });

    it('one bad id among good ones refuses the WHOLE set', async () => {
      await expectRefused(buildPrisma({ window: win, candidates: [candidate(uuid(2))] }), [uuid(2), uuid(99)]);
    });

    it('the reported message itself', async () => {
      await expectRefused(buildPrisma({ window: win }), [MESSAGE_ID]);
    });

    it('an id that is in the window but not in this conversation (the candidate lookup is scoped by conversation)', async () => {
      await expectRefused(buildPrisma({ window: win, candidates: [] }), [uuid(2)]);
    });

    it('an id that does not exist at all', async () => {
      await expectRefused(buildPrisma({ window: [], candidates: [] }), [uuid(2)]);
    });

    it('a message the reporter hid for themselves ("delete for me")', async () => {
      await expectRefused(buildPrisma({ window: win, candidates: [candidate(uuid(2), { hides: [{ userId: RECIPIENT }] })] }), [uuid(2)]);
    });

    it('a message deleted for everyone', async () => {
      await expectRefused(buildPrisma({ window: win, candidates: [candidate(uuid(2), { deletedForEveryoneAt: new Date() })] }), [uuid(2)]);
    });

    it('a message at or before the moment the reporter deleted the chat; one after it is accepted', async () => {
      const cutoff = new Date(SENT_AT.getTime() + 500);
      const atCutoff = buildPrisma({ window: win, candidates: [candidate(uuid(2), { sentAt: cutoff })] });
      atCutoff.conversationHide.findUnique.mockResolvedValue({ hiddenAt: cutoff });
      // the reported message itself (sentAt SENT_AT) is before the cutoff too, so move the cutoff under it for the "after" half
      atCutoff.message.findUnique.mockResolvedValue(reportedRow({ sentAt: new Date(cutoff.getTime() + 10) }));
      await expectRefused(atCutoff, [uuid(2)]);

      const after = buildPrisma({ window: win, candidates: [candidate(uuid(2), { sentAt: new Date(cutoff.getTime() + 1) })] });
      after.conversationHide.findUnique.mockResolvedValue({ hiddenAt: cutoff });
      after.message.findUnique.mockResolvedValue(reportedRow({ sentAt: new Date(cutoff.getTime() + 10) }));
      await expect(build(after).service.createReport(RECIPIENT, dto({ contextMessageIds: [uuid(2)] }))).resolves.toBeDefined();
    });

    it('a refusal of the REPORTED message itself still comes first (sender, stranger, hidden): the context is never looked at', async () => {
      const prisma = buildPrisma({ window: win });
      const { service } = build(prisma);
      await expect(service.createReport(SENDER, dto({ contextMessageIds: [uuid(2)] }))).rejects.toThrow(NOT_FOUND);
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });
  });

  describe('a repeat report: the existing one is returned and new valid context is added to it', () => {
    const win = Array.from({ length: 20 }, (_, i) => uuid(i + 1));
    const existing = { id: 'existing-report', reporterId: RECIPIENT, targetType: 'message', targetId: MESSAGE_ID, status: 'open' };

    it('adds only ids not already attached', async () => {
      const prisma = buildPrisma({ window: win, candidates: [candidate(uuid(1)), candidate(uuid(2))], existingContext: [uuid(1)] });
      prisma.report.findFirst.mockResolvedValue(existing);
      const result = await build(prisma).service.createReport(RECIPIENT, dto({ contextMessageIds: [uuid(1), uuid(2)] }));
      expect(result).toBe(existing);
      expect(prisma.report.create).not.toHaveBeenCalled();
      expect(prisma.reportContextMessage.createMany).toHaveBeenCalledWith({
        data: [{ reportId: 'existing-report', messageId: uuid(2) }],
        skipDuplicates: true,
      });
    });

    it('stops at 20 in total: only the first ids that fit are added, no error', async () => {
      const have = Array.from({ length: 19 }, (_, i) => uuid(100 + i));
      const prisma = buildPrisma({ window: win, candidates: [candidate(uuid(1)), candidate(uuid(2)), candidate(uuid(3))], existingContext: have });
      prisma.report.findFirst.mockResolvedValue(existing);
      await expect(build(prisma).service.createReport(RECIPIENT, dto({ contextMessageIds: [uuid(1), uuid(2), uuid(3)] }))).resolves.toBe(existing);
      expect(prisma.reportContextMessage.createMany).toHaveBeenCalledWith({
        data: [{ reportId: 'existing-report', messageId: uuid(1) }],
        skipDuplicates: true,
      });
    });

    it('a full report (20 attached) adds nothing', async () => {
      const have = Array.from({ length: 20 }, (_, i) => uuid(100 + i));
      const prisma = buildPrisma({ window: win, candidates: [candidate(uuid(1))], existingContext: have });
      prisma.report.findFirst.mockResolvedValue(existing);
      await expect(build(prisma).service.createReport(RECIPIENT, dto({ contextMessageIds: [uuid(1)] }))).resolves.toBe(existing);
      expect(prisma.reportContextMessage.createMany).not.toHaveBeenCalled();
    });

    it('an invalid id on a repeat is still the 404 and the existing report is left as it was', async () => {
      const prisma = buildPrisma({ window: win, candidates: [] });
      prisma.report.findFirst.mockResolvedValue(existing);
      await expect(build(prisma).service.createReport(RECIPIENT, dto({ contextMessageIds: [uuid(99)] }))).rejects.toThrow(NOT_FOUND);
      expect(prisma.reportContextMessage.createMany).not.toHaveBeenCalled();
    });
  });

  describe('getReportById: the admin read', () => {
    const REPORT = { id: 'report-1', reporterId: RECIPIENT, targetType: 'message', targetId: MESSAGE_ID, status: 'open', concernsMinor: false };

    function ctxRow(over: Record<string, unknown> = {}) {
      return {
        message: {
          id: uuid(2),
          sentAt: new Date('2026-02-01T09:59:00.000Z'),
          senderId: RECIPIENT,
          contentText: 'context text',
          originalContentText: null,
          editedAt: null,
          deletedForEveryoneAt: null,
          sender: { username: 'recipient_name', displayName: 'Real Recipient' },
          ...over,
        },
      };
    }

    function withMessage(prisma: ReturnType<typeof buildPrisma>) {
      prisma.report.findUnique.mockResolvedValue(REPORT);
      prisma.message.findUnique.mockResolvedValue({
        id: MESSAGE_ID,
        sentAt: SENT_AT,
        contentText: 'reported',
        originalContentText: null,
        editedAt: null,
        deletedForEveryoneAt: null,
        sender: { username: 'sender_name', displayName: 'Real Sender' },
      });
    }

    it('adds contextMessages, oldest first, with exactly the allowed fields', async () => {
      const prisma = buildPrisma();
      withMessage(prisma);
      prisma.reportContextMessage.findMany.mockResolvedValue([
        ctxRow(),
        ctxRow({ id: uuid(3), senderId: SENDER, sender: { username: 'sender_name', displayName: 'Real Sender' }, contentText: 'second' }),
      ]);
      const detail = await build(prisma).service.getReportById('report-1', 'admin-1');

      expect(prisma.reportContextMessage.findMany.mock.calls[0][0]).toMatchObject({
        where: { reportId: 'report-1' },
        orderBy: [{ message: { sentAt: 'asc' } }, { message: { id: 'asc' } }],
      });
      expect(detail.contextMessages).toHaveLength(2);
      expect(detail.contextMessages![0]).toEqual({
        id: uuid(2),
        sentAt: new Date('2026-02-01T09:59:00.000Z'),
        sender: { publicName: 'recipient_name' },
        sentByReporter: true,
        contentText: 'context text',
        originalContentText: null,
        editedAt: null,
        deletedForEveryone: false,
      });
      expect(detail.contextMessages![1]).toMatchObject({ sentByReporter: false, contentText: 'second' });
      for (const m of detail.contextMessages!) {
        expect(Object.keys(m).sort()).toEqual(
          ['contentText', 'deletedForEveryone', 'editedAt', 'id', 'originalContentText', 'sender', 'sentAt', 'sentByReporter'].sort(),
        );
      }
      const json = JSON.stringify(detail.contextMessages);
      expect(json).not.toContain('Real Recipient');
      expect(json).not.toContain('Real Sender');
      expect(json).not.toContain('conv-1');
      expect(json).not.toContain('senderId');
      expect(detail.reportedMessage).toMatchObject({ id: MESSAGE_ID, contentText: 'reported' }); // unchanged
    });

    it('selects no conversation id, no participant list and no recipient', async () => {
      const prisma = buildPrisma();
      withMessage(prisma);
      await build(prisma).service.getReportById('report-1', 'admin-1');
      const select = prisma.reportContextMessage.findMany.mock.calls[0][0].select;
      expect(Object.keys(select)).toEqual(['message']);
      expect(Object.keys(select.message.select).sort()).toEqual(
        ['contentText', 'deletedForEveryoneAt', 'editedAt', 'id', 'originalContentText', 'sender', 'senderId', 'sentAt'].sort(),
      );
    });

    it('is an empty array when none were attached', async () => {
      const prisma = buildPrisma();
      withMessage(prisma);
      const detail = await build(prisma).service.getReportById('report-1', 'admin-1');
      expect(detail.contextMessages).toEqual([]);
    });

    it('an edited and a deleted-for-everyone context message keep their text, original and flags', async () => {
      const editedAt = new Date('2026-02-01T09:59:30.000Z');
      const prisma = buildPrisma();
      withMessage(prisma);
      prisma.reportContextMessage.findMany.mockResolvedValue([
        ctxRow({ contentText: 'new', originalContentText: 'the original', editedAt }),
        ctxRow({ id: uuid(3), contentText: 'gone for the user', deletedForEveryoneAt: new Date() }),
      ]);
      const detail = await build(prisma).service.getReportById('report-1', 'admin-1');
      expect(detail.contextMessages![0]).toMatchObject({ contentText: 'new', originalContentText: 'the original', editedAt, deletedForEveryone: false });
      expect(detail.contextMessages![1]).toMatchObject({ contentText: 'gone for the user', deletedForEveryone: true });
    });

    it('an anonymised sender shows as [deleted user]', async () => {
      const prisma = buildPrisma();
      withMessage(prisma);
      prisma.reportContextMessage.findMany.mockResolvedValue([ctxRow({ sender: { username: null, displayName: '[deleted user]' } })]);
      const detail = await build(prisma).service.getReportById('report-1', 'admin-1');
      expect(detail.contextMessages![0].sender.publicName).toBe('[deleted user]');
    });

    it('the child-safety-vetting gate applies first: an unvetted admin gets the 403 and no context is read', async () => {
      const prisma = buildPrisma();
      prisma.report.findUnique.mockResolvedValue({ ...REPORT, concernsMinor: true });
      prisma.adminUser.findUnique.mockResolvedValue({ childSafetyVetted: false });
      await expect(build(prisma).service.getReportById('report-1', 'admin-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.reportContextMessage.findMany).not.toHaveBeenCalled();
      expect(prisma.message.findUnique).not.toHaveBeenCalled();
    });

    it('a report that is not about a message has no contextMessages key and reads no context', async () => {
      const prisma = buildPrisma();
      prisma.report.findUnique.mockResolvedValue({ ...REPORT, targetType: 'post' });
      const detail = await build(prisma).service.getReportById('report-1', 'admin-1');
      expect('contextMessages' in detail).toBe(false);
      expect(prisma.reportContextMessage.findMany).not.toHaveBeenCalled();
    });
  });
});
