import { PrismaService } from '../../prisma/prisma.service';
import { MESSAGE_SELECT as DATA_EXPORT_MESSAGE_SELECT } from '../data-export/data-export-file.builder';
import { MessagingService } from './messaging.service';

// Read receipts (Decision Log #472; founder decision 2026-11-08): what MessagingService discloses about
// Message.readAt on every path that returns it (list, send, edit). Mocked Prisma; the real SQL and the full
// flow are in test/read-receipts.e2e-spec.ts.
const ME = 'me-1';
const OTHER = 'other-2';
const SENT_AT = new Date('2026-11-20T10:00:00.000Z');
const READ_AT = new Date('2026-11-20T10:05:00.000Z');

type Party = { id: string; isMinor: boolean; readReceipts: boolean | null };
const adult = (id: string, readReceipts: boolean | null = null): Party => ({ id, isMinor: false, readReceipts });
const minor = (id: string, readReceipts: boolean | null = null): Party => ({ id, isMinor: true, readReceipts });

function row(senderId: string, over: Record<string, unknown> = {}) {
  return {
    id: `m-${senderId}`,
    conversationId: 'convo-1',
    senderId,
    contentText: 'hello',
    sentAt: SENT_AT,
    readAt: READ_AT,
    editedAt: null,
    deletedForEveryoneAt: null,
    ...over,
  };
}

describe('MessagingService: read receipts', () => {
  let prisma: PrismaService;
  let service: MessagingService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = () => prisma as any;

  beforeEach(() => {
    prisma = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'convo-1',
          participantIds: [ME, OTHER].sort(),
          lastMessageAt: SENT_AT,
          createdAt: SENT_AT,
        }),
        update: jest.fn(),
      },
      message: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
      user: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn() },
      block: { findMany: jest.fn().mockResolvedValue([]) },
      notification: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    service = new MessagingService(prisma);
  });

  const setParties = (...parties: Party[]) => p().user.findMany.mockResolvedValue(parties);

  describe('getMessages', () => {
    it('shows the sender the read time of their own read message when both adults have it on by default', async () => {
      setParties(adult(ME), adult(OTHER));
      p().message.findMany.mockResolvedValue([row(ME)]);
      const page = await service.getMessages('convo-1', ME, {});
      expect(page.items[0]).toMatchObject({ readAt: READ_AT });
      expect(p().user.findMany).toHaveBeenCalledWith({
        where: { id: { in: [ME, OTHER] } },
        select: { id: true, isMinor: true, readReceipts: true },
      });
    });

    it('the READER never sees a read time on a message they received (both adults, both on)', async () => {
      setParties(adult(ME, true), adult(OTHER, true));
      p().message.findMany.mockResolvedValue([row(OTHER)]);
      const page = await service.getMessages('convo-1', ME, {});
      expect(page.items[0]).toMatchObject({ readAt: null });
    });

    it('does not read the two settings when the page has no read message the caller sent (no extra query)', async () => {
      p().message.findMany.mockResolvedValue([row(OTHER), row(ME, { id: 'm-unread', readAt: null })]);
      await service.getMessages('convo-1', ME, {});
      expect(p().user.findMany).not.toHaveBeenCalled();
    });

    it.each([
      ['the sender has it off', adult(ME, false), adult(OTHER, true)],
      ['the reader has it off', adult(ME, true), adult(OTHER, false)],
      ['both under 18 on the age default (off)', minor(ME), minor(OTHER)],
      ['an adult sender and an under-18 reader, both explicitly on', adult(ME, true), minor(OTHER, true)],
      ['an under-18 sender and an adult reader, both explicitly on', minor(ME, true), adult(OTHER, true)],
    ])('hides the read time when %s', async (_label, sender, reader) => {
      setParties(sender, reader);
      p().message.findMany.mockResolvedValue([row(ME)]);
      const page = await service.getMessages('convo-1', ME, {});
      expect(page.items[0]).toMatchObject({ readAt: null });
    });

    it('shows it for two under-18s who BOTH turned it on', async () => {
      setParties(minor(ME, true), minor(OTHER, true));
      p().message.findMany.mockResolvedValue([row(ME)]);
      const page = await service.getMessages('convo-1', ME, {});
      expect(page.items[0]).toMatchObject({ readAt: READ_AT });
    });

    it('discloses nothing when the other participant has no row any more (hard-deleted)', async () => {
      setParties(adult(ME));
      p().message.findMany.mockResolvedValue([row(ME)]);
      const page = await service.getMessages('convo-1', ME, {});
      expect(page.items[0]).toMatchObject({ readAt: null });
    });

    it('applies the rule per message: only the callers own read messages can carry a time', async () => {
      setParties(adult(ME), adult(OTHER));
      p().message.findMany.mockResolvedValue([
        row(OTHER, { id: 'm-in' }),
        row(ME, { id: 'm-out-read' }),
        row(ME, { id: 'm-out-unread', readAt: null }),
      ]);
      const page = await service.getMessages('convo-1', ME, {});
      expect(page.items.map((m) => ({ id: m.id, readAt: 'readAt' in m ? m.readAt : 'none' }))).toEqual([
        { id: 'm-in', readAt: null },
        { id: 'm-out-read', readAt: READ_AT },
        { id: 'm-out-unread', readAt: null },
      ]);
    });

    it('a message deleted for everyone carries no read time at all (placeholder)', async () => {
      p().message.findMany.mockResolvedValue([row(ME, { deletedForEveryoneAt: new Date() })]);
      const page = await service.getMessages('convo-1', ME, {});
      expect(page.items[0]).not.toHaveProperty('readAt');
      expect(p().user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('the response of a fresh message has readAt null and needs no settings read', async () => {
      p().$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
        cb({
          message: { create: jest.fn().mockResolvedValue(row(ME, { readAt: null })) },
          conversation: { update: jest.fn() },
          block: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
          notification: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
        }),
      );
      const view = await service.sendMessage('convo-1', ME, { contentText: 'hello' });
      expect(view).toMatchObject({ readAt: null });
      expect(p().user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('editMessage', () => {
    function arrange(edited: Record<string, unknown>) {
      p().message.findFirst.mockResolvedValue({
        id: 'm-1',
        senderId: ME,
        contentText: 'first',
        mediaUrl: null,
        sentAt: new Date(),
        originalContentText: null,
        deletedForEveryoneAt: null,
      });
      p().message.findUniqueOrThrow.mockResolvedValue(row(ME, { id: 'm-1', ...edited }));
    }

    it('an edited message that was already read shows the time under the same rule', async () => {
      arrange({ editedAt: new Date() });
      setParties(adult(ME), adult(OTHER));
      const view = await service.editMessage('convo-1', 'm-1', ME, { contentText: 'second' });
      expect(view).toMatchObject({ readAt: READ_AT });
    });

    it('and hides it when the pair does not qualify', async () => {
      arrange({ editedAt: new Date() });
      setParties(adult(ME, false), adult(OTHER));
      const view = await service.editMessage('convo-1', 'm-1', ME, { contentText: 'second' });
      expect(view).toMatchObject({ readAt: null });
    });
  });

  describe('recording is unchanged', () => {
    it('PATCH read still stamps readAt for every unread message from the other person, whatever the settings', async () => {
      setParties(minor(ME, false), adult(OTHER, false));
      await service.markConversationRead('convo-1', ME);
      expect(p().message.updateMany).toHaveBeenCalledWith({
        where: { conversationId: 'convo-1', senderId: { not: ME }, readAt: null },
        data: { readAt: expect.any(Date) },
      });
      expect(p().user.findMany).not.toHaveBeenCalled();
    });
  });

  it('the data export selects no read time (it never has)', () => {
    expect(DATA_EXPORT_MESSAGE_SELECT).not.toHaveProperty('readAt');
  });
});
