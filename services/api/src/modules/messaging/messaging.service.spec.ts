import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  encodeConversationCursor,
  encodeMessageCursor,
  participantKey,
} from './cursor.util';
import { MessagingService } from './messaging.service';

// Mocked-Prisma unit tests, following banter.service.spec.ts /
// clubs.service.spec.ts. The real Conversation.participantKey @unique
// constraint, the `participantIds: { has }` array filter, the
// transactional lastMessageAt bump, and the find-or-create race are
// proven against Postgres in test/messaging.e2e-spec.ts — this file
// covers the branching a mock can prove.

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' });
}

function buildPrismaMock() {
  const prisma = {
    conversation: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    message: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    guardian: {
      findUnique: jest.fn(),
    },
    notification: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  } as unknown as PrismaService;

  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn(
    (fn: (tx: unknown) => unknown) => fn(prisma),
  );

  return prisma;
}

const CALLER = 'caller-1';
const RECIPIENT = 'recipient-2';

function activeUser(over: Partial<Record<string, unknown>> = {}) {
  return { id: RECIPIENT, isMinor: false, accountStatus: 'active', ...over };
}

function conversationRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'convo-1',
    participantIds: [CALLER, RECIPIENT].sort(),
    lastMessageAt: new Date('2026-09-09T10:00:00Z'),
    createdAt: new Date('2026-09-09T09:00:00Z'),
    ...over,
  };
}

describe('MessagingService', () => {
  let prisma: PrismaService;
  let service: MessagingService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = () => prisma as any;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new MessagingService(prisma);
  });

  describe('startConversation (find-or-create)', () => {
    it('creates a new conversation with a sorted participant set + deterministic key, returning created: true', async () => {
      p().user.findUnique.mockResolvedValue(activeUser());
      p().conversation.create.mockResolvedValue(conversationRow());

      const { view, created } = await service.startConversation(CALLER, RECIPIENT);

      expect(created).toBe(true);
      expect(view.id).toBe('convo-1');
      expect(p().conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            participantIds: [CALLER, RECIPIENT].sort(),
            participantKey: participantKey([CALLER, RECIPIENT]),
          },
        }),
      );
    });

    it('on a P2002 (a conversation with this exact pair already exists) re-reads it and returns created: false', async () => {
      p().user.findUnique.mockResolvedValue(activeUser());
      p().conversation.create.mockRejectedValue(p2002());
      p().conversation.findUniqueOrThrow.mockResolvedValue(conversationRow());

      const { view, created } = await service.startConversation(CALLER, RECIPIENT);

      expect(created).toBe(false);
      expect(view.id).toBe('convo-1');
      expect(p().conversation.findUniqueOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({ where: { participantKey: participantKey([CALLER, RECIPIENT]) } }),
      );
    });

    it('rejects messaging yourself with 400 before any lookup', async () => {
      await expect(service.startConversation(CALLER, CALLER)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(p().user.findUnique).not.toHaveBeenCalled();
    });

    it('404s for a non-existent recipient', async () => {
      p().user.findUnique.mockResolvedValue(null);
      await expect(service.startConversation(CALLER, RECIPIENT)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('404s for a deactivated recipient (Decision Log #221)', async () => {
      p().user.findUnique.mockResolvedValue(activeUser({ accountStatus: 'deactivated' }));
      await expect(service.startConversation(CALLER, RECIPIENT)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('404s for a restricted-pending minor recipient — the "receiving" half of Decision Log #12', async () => {
      p().user.findUnique.mockResolvedValue(activeUser({ isMinor: true }));
      p().guardian.findUnique.mockResolvedValue({ consentStatus: 'pending' });
      await expect(service.startConversation(CALLER, RECIPIENT)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('allows a minor recipient whose guardian consent is confirmed', async () => {
      p().user.findUnique.mockResolvedValue(activeUser({ isMinor: true }));
      p().guardian.findUnique.mockResolvedValue({ consentStatus: 'confirmed' });
      p().conversation.create.mockResolvedValue(conversationRow());

      const { created } = await service.startConversation(CALLER, RECIPIENT);
      expect(created).toBe(true);
    });
  });

  describe('listConversations', () => {
    it('filters to conversations the caller is in, ordered lastMessageAt desc, and builds nextCursor when a full page + 1 comes back', async () => {
      const rows = [
        conversationRow({ id: 'c-1', lastMessageAt: new Date('2026-09-09T12:00:00Z') }),
        conversationRow({ id: 'c-2', lastMessageAt: new Date('2026-09-09T11:00:00Z') }),
      ];
      p().conversation.findMany.mockResolvedValue(rows); // limit 1 -> 2 rows means hasMore
      p().user.findMany.mockResolvedValue([{ id: RECIPIENT, displayName: 'Jordan' }]);
      p().message.groupBy.mockResolvedValue([{ conversationId: 'c-1', _count: { _all: 4 } }]);
      p().message.findMany.mockResolvedValue([
        { conversationId: 'c-1', contentText: 'yo', senderId: RECIPIENT, sentAt: new Date('2026-09-09T12:00:00Z') },
      ]);

      const page = await service.listConversations(CALLER, { limit: 1 });

      expect(p().conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { participantIds: { has: CALLER } },
          orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
          take: 2,
        }),
      );
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({
        id: 'c-1',
        otherParticipant: { id: RECIPIENT, displayName: 'Jordan' },
        unreadCount: 4,
        lastMessage: { contentText: 'yo', senderId: RECIPIENT },
      });
      expect(page.nextCursor).toEqual(expect.any(String));
    });

    it('a conversation with no messages and an unknown other party degrades gracefully (unreadCount 0, displayName null, lastMessage null)', async () => {
      p().conversation.findMany.mockResolvedValue([conversationRow({ id: 'c-9' })]);
      p().user.findMany.mockResolvedValue([]); // other party hard-deleted
      const page = await service.listConversations(CALLER, {});
      expect(page.items[0]).toMatchObject({
        otherParticipant: { id: RECIPIENT, displayName: null },
        unreadCount: 0,
        lastMessage: null,
      });
      expect(page.nextCursor).toBeNull();
    });

    it('applies the keyset cursor filter (before this lastMessageAt/id)', async () => {
      const cursor = encodeConversationCursor({
        lastMessageAt: new Date('2026-09-09T10:00:00Z'),
        id: 'c-5',
      });
      await service.listConversations(CALLER, { cursor });
      const call = p().conversation.findMany.mock.calls[0][0];
      expect(call.where.AND[0]).toEqual({ participantIds: { has: CALLER } });
      expect(call.where.AND[1].OR).toEqual([
        { lastMessageAt: { lt: new Date('2026-09-09T10:00:00Z') } },
        { lastMessageAt: new Date('2026-09-09T10:00:00Z'), id: { lt: 'c-5' } },
      ]);
    });
  });

  describe('getMessages', () => {
    it('404s when the conversation does not exist', async () => {
      p().conversation.findUnique.mockResolvedValue(null);
      await expect(service.getMessages('c-x', CALLER, {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s (not 403) when the caller is not a participant', async () => {
      p().conversation.findUnique.mockResolvedValue(
        conversationRow({ participantIds: ['someone', 'else'] }),
      );
      await expect(service.getMessages('c-1', CALLER, {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns messages newest-first with a nextCursor when there is another page', async () => {
      p().conversation.findUnique.mockResolvedValue(conversationRow());
      p().message.findMany.mockResolvedValue([
        { id: 'm-3', conversationId: 'convo-1', senderId: CALLER, contentText: 'c', mediaUrl: null, sentAt: new Date('2026-09-09T12:02:00Z'), readAt: null },
        { id: 'm-2', conversationId: 'convo-1', senderId: RECIPIENT, contentText: 'b', mediaUrl: null, sentAt: new Date('2026-09-09T12:01:00Z'), readAt: null },
      ]);

      const page = await service.getMessages('convo-1', CALLER, { limit: 1 });

      expect(p().message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversationId: 'convo-1' },
          orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
          take: 2,
        }),
      );
      expect(page.items.map((m) => m.id)).toEqual(['m-3']);
      expect(page.nextCursor).toEqual(expect.any(String));
    });

    it('honours the message keyset cursor', async () => {
      p().conversation.findUnique.mockResolvedValue(conversationRow());
      const cursor = encodeMessageCursor({ sentAt: new Date('2026-09-09T12:00:00Z'), id: 'm-9' });
      await service.getMessages('convo-1', CALLER, { cursor });
      const call = p().message.findMany.mock.calls[0][0];
      expect(call.where.AND[1].OR).toEqual([
        { sentAt: { lt: new Date('2026-09-09T12:00:00Z') } },
        { sentAt: new Date('2026-09-09T12:00:00Z'), id: { lt: 'm-9' } },
      ]);
    });
  });

  describe('sendMessage', () => {
    it('creates the Message and bumps Conversation.lastMessageAt in one transaction', async () => {
      p().conversation.findUnique.mockResolvedValue(conversationRow());
      const sentAt = new Date('2026-09-09T13:00:00Z');
      p().message.create.mockResolvedValue({
        id: 'm-1',
        conversationId: 'convo-1',
        senderId: CALLER,
        contentText: 'hi',
        mediaUrl: null,
        sentAt,
        readAt: null,
      });

      const message = await service.sendMessage('convo-1', CALLER, { contentText: 'hi' });

      expect(message.id).toBe('m-1');
      expect(p().$transaction).toHaveBeenCalled();
      expect(p().message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { conversationId: 'convo-1', senderId: CALLER, contentText: 'hi', mediaUrl: undefined },
        }),
      );
      expect(p().conversation.update).toHaveBeenCalledWith({
        where: { id: 'convo-1' },
        data: { lastMessageAt: sentAt },
      });
    });

    it('404s a non-participant before creating anything', async () => {
      p().conversation.findUnique.mockResolvedValue(
        conversationRow({ participantIds: ['x', 'y'] }),
      );
      await expect(
        service.sendMessage('convo-1', CALLER, { contentText: 'hi' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(p().message.create).not.toHaveBeenCalled();
    });

    // Decision Log #87 — message Notification wiring.

    it('creates a message Notification for the OTHER participant when none exists yet', async () => {
      p().conversation.findUnique.mockResolvedValue(conversationRow());
      p().message.create.mockResolvedValue({ id: 'm-1', sentAt: new Date() });
      p().notification.findFirst.mockResolvedValue(null);

      await service.sendMessage('convo-1', CALLER, { contentText: 'hi' });

      expect(p().notification.findFirst).toHaveBeenCalledWith({
        where: { userId: RECIPIENT, type: 'message', payloadRefId: 'convo-1', read: false },
        select: { id: true },
      });
      expect(p().notification.create).toHaveBeenCalledWith({
        data: { userId: RECIPIENT, type: 'message', payloadRefId: 'convo-1' },
      });
    });

    it('does NOT create a second message Notification while an unread one already exists for this conversation (collapsed, not one row per message)', async () => {
      p().conversation.findUnique.mockResolvedValue(conversationRow());
      p().message.create.mockResolvedValue({ id: 'm-2', sentAt: new Date() });
      p().notification.findFirst.mockResolvedValue({ id: 'existing-notif-1' });

      await service.sendMessage('convo-1', CALLER, { contentText: 'again' });

      expect(p().notification.create).not.toHaveBeenCalled();
    });

    it('never targets the sender as the Notification recipient', async () => {
      p().conversation.findUnique.mockResolvedValue(conversationRow());
      p().message.create.mockResolvedValue({ id: 'm-3', sentAt: new Date() });
      p().notification.findFirst.mockResolvedValue(null);

      await service.sendMessage('convo-1', CALLER, { contentText: 'hi' });

      const callArgs = p().notification.create.mock.calls[0][0];
      expect(callArgs.data.userId).not.toBe(CALLER);
    });
  });

  describe('markConversationRead', () => {
    it('marks only the OTHER party\'s unread messages read, and reports the count', async () => {
      p().conversation.findUnique.mockResolvedValue(conversationRow());
      p().message.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.markConversationRead('convo-1', CALLER);

      expect(result).toEqual({ conversationId: 'convo-1', markedRead: 2 });
      expect(p().message.updateMany).toHaveBeenCalledWith({
        where: { conversationId: 'convo-1', senderId: { not: CALLER }, readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });

    it('is idempotent — a second call marks 0', async () => {
      p().conversation.findUnique.mockResolvedValue(conversationRow());
      p().message.updateMany.mockResolvedValue({ count: 0 });
      const result = await service.markConversationRead('convo-1', CALLER);
      expect(result.markedRead).toBe(0);
    });
  });
});
