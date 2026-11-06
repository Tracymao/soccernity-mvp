import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Clock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MESSAGE_DELETE_NOT_SENDER_CODE,
  MESSAGE_EDIT_NOT_SENDER_CODE,
  MESSAGE_EDIT_WINDOW_CLOSED_CODE,
  MESSAGE_EDIT_WINDOW_MINUTES,
  MESSAGE_EDIT_WINDOW_MS,
  MESSAGE_NOT_EDITABLE_CODE,
} from './messaging.constants';
import { MessagingService } from './messaging.service';

// backend/b067-message-edit-delete-hide (B-067, Decision Log #472 (b)). Mocked-Prisma unit tests for the new
// edit / delete / hide behaviour: every rule, every refusal and the read-path filters. The real SQL (the
// relation filters, the composite primary keys, the idempotency) is proven against Postgres in
// test/messaging-edit-delete.e2e-spec.ts. messaging.service.spec.ts is deliberately untouched.

const ME = 'me-1';
const OTHER = 'other-2';
const SENT_AT = new Date('2026-11-15T10:00:00.000Z');

function buildPrisma() {
  const prisma = {
    conversation: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    message: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    messageHide: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    conversationHide: { upsert: jest.fn().mockResolvedValue({}) },
    user: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    block: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
  return prisma;
}

function conversation(over: Record<string, unknown> = {}) {
  return {
    id: 'convo-1',
    participantIds: [ME, OTHER].sort(),
    lastMessageAt: new Date('2026-11-15T10:05:00Z'),
    createdAt: new Date('2026-11-15T09:00:00Z'),
    ...over,
  };
}

function storedMessage(over: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    senderId: ME,
    contentText: 'first text',
    mediaUrl: null,
    sentAt: SENT_AT,
    originalContentText: null,
    deletedForEveryoneAt: null,
    ...over,
  };
}

describe('MessagingService: edit, delete and hide (B-067)', () => {
  let prisma: PrismaService;
  let service: MessagingService;
  let now: Date;
  const clock: Clock = { now: () => now };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = () => prisma as any;

  beforeEach(() => {
    prisma = buildPrisma();
    now = new Date(SENT_AT.getTime() + 60_000);
    service = new MessagingService(prisma, clock);
    p().conversation.findUnique.mockResolvedValue(conversation());
    p().message.findFirst.mockResolvedValue(storedMessage());
    p().message.findUniqueOrThrow.mockResolvedValue({
      id: 'm-1',
      conversationId: 'convo-1',
      senderId: ME,
      contentText: 'new text',
      sentAt: SENT_AT,
      readAt: null,
      editedAt: now,
      deletedForEveryoneAt: null,
    });
  });

  it('the edit window is 15 minutes (DEFAULT, founder-veto-able)', () => {
    expect(MESSAGE_EDIT_WINDOW_MINUTES).toBe(15);
    expect(MESSAGE_EDIT_WINDOW_MS).toBe(900_000);
  });

  describe('editMessage', () => {
    it('edits within the window: sets editedAt on the server clock, keeps the first original, returns the message', async () => {
      const view = await service.editMessage('convo-1', 'm-1', ME, { contentText: 'new text' });

      expect(p().message.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'm-1',
          conversationId: 'convo-1',
          senderId: ME,
          deletedForEveryoneAt: null,
          sentAt: { gte: new Date(now.getTime() - MESSAGE_EDIT_WINDOW_MS) },
        },
        data: { contentText: 'new text', editedAt: now, originalContentText: 'first text' },
      });
      expect(view).toEqual({
        id: 'm-1',
        conversationId: 'convo-1',
        senderId: ME,
        contentText: 'new text',
        sentAt: SENT_AT,
        readAt: null,
        editedAt: now,
        deletedForEveryone: false,
      });
    });

    it('never overwrites the original on a later edit (the stored original is written back unchanged)', async () => {
      p().message.findFirst.mockResolvedValue(
        storedMessage({ contentText: 'second text', originalContentText: 'first text' }),
      );
      await service.editMessage('convo-1', 'm-1', ME, { contentText: 'third text' });
      expect(p().message.updateMany.mock.calls[0][0].data.originalContentText).toBe('first text');
    });

    it('does not select or return the original, and does not bump lastMessageAt', async () => {
      const view = await service.editMessage('convo-1', 'm-1', ME, { contentText: 'new text' });
      expect(JSON.stringify(view)).not.toContain('first text');
      expect('originalContentText' in view).toBe(false);
      const selectArg = p().message.findUniqueOrThrow.mock.calls[0][0].select;
      expect(selectArg.originalContentText).toBeUndefined();
      expect(p().message.updateMany.mock.calls[0][0].data.lastMessageAt).toBeUndefined();
    });

    it('allows an edit at exactly 15:00 and refuses one millisecond later (message_edit_window_closed)', async () => {
      now = new Date(SENT_AT.getTime() + MESSAGE_EDIT_WINDOW_MS);
      await expect(service.editMessage('convo-1', 'm-1', ME, { contentText: 'at the edge' })).resolves.toBeDefined();
      expect(p().message.updateMany).toHaveBeenCalledTimes(1);

      p().message.updateMany.mockClear();
      now = new Date(SENT_AT.getTime() + MESSAGE_EDIT_WINDOW_MS + 1);
      const err = await service.editMessage('convo-1', 'm-1', ME, { contentText: 'too late' }).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({ code: MESSAGE_EDIT_WINDOW_CLOSED_CODE });
      expect(p().message.updateMany).not.toHaveBeenCalled();
    });

    it('refuses one second after the boundary and a message sent a day ago', async () => {
      now = new Date(SENT_AT.getTime() + MESSAGE_EDIT_WINDOW_MS + 1000);
      await expect(service.editMessage('convo-1', 'm-1', ME, { contentText: 'x' })).rejects.toBeInstanceOf(ConflictException);
      now = new Date(SENT_AT.getTime() + 24 * 3600 * 1000);
      await expect(service.editMessage('convo-1', 'm-1', ME, { contentText: 'x' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses a message deleted for everyone (message_not_editable)', async () => {
      p().message.findFirst.mockResolvedValue(storedMessage({ deletedForEveryoneAt: new Date() }));
      const err = await service.editMessage('convo-1', 'm-1', ME, { contentText: 'x' }).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({ code: MESSAGE_NOT_EDITABLE_CODE });
      expect(p().message.updateMany).not.toHaveBeenCalled();
    });

    it('refuses a message that carries media (text only)', async () => {
      p().message.findFirst.mockResolvedValue(storedMessage({ mediaUrl: 'https://example.com/a.jpg' }));
      const err = await service.editMessage('convo-1', 'm-1', ME, { contentText: 'x' }).catch((e) => e);
      expect(err.getResponse()).toMatchObject({ code: MESSAGE_NOT_EDITABLE_CODE });
    });

    it('turns a delete that lands between the read and the write into message_not_editable', async () => {
      p().message.updateMany.mockResolvedValue({ count: 0 });
      const err = await service.editMessage('convo-1', 'm-1', ME, { contentText: 'x' }).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({ code: MESSAGE_NOT_EDITABLE_CODE });
      expect(p().message.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('403s a non-sender (the other participant), writing nothing', async () => {
      p().message.findFirst.mockResolvedValue(storedMessage({ senderId: OTHER }));
      const err = await service.editMessage('convo-1', 'm-1', ME, { contentText: 'x' }).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.getResponse()).toMatchObject({ code: MESSAGE_EDIT_NOT_SENDER_CODE });
      expect(p().message.updateMany).not.toHaveBeenCalled();
    });

    it('404s a missing message, a message of another conversation, and a non-participant', async () => {
      p().message.findFirst.mockResolvedValue(null);
      await expect(service.editMessage('convo-1', 'm-x', ME, { contentText: 'x' })).rejects.toBeInstanceOf(NotFoundException);
      expect(p().message.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'm-x', conversationId: 'convo-1' } }),
      );

      p().conversation.findUnique.mockResolvedValue(conversation({ participantIds: ['a', 'b'] }));
      await expect(service.editMessage('convo-1', 'm-1', ME, { contentText: 'x' })).rejects.toBeInstanceOf(NotFoundException);
      expect(p().message.updateMany).not.toHaveBeenCalled();
    });

    // The same Block split sendMessage has.
    it('stops a BLOCKED sender with the same 404 a send gets, before the message is even looked up', async () => {
      p().block.findMany.mockResolvedValue([{ blockerId: OTHER, blockedId: ME }]);
      const err = await service.editMessage('convo-1', 'm-1', ME, { contentText: 'x' }).catch((e) => e);
      expect(err).toBeInstanceOf(NotFoundException);
      expect(err.message).toBe('Conversation not found');
      expect(p().message.findFirst).not.toHaveBeenCalled();
      expect(p().message.updateMany).not.toHaveBeenCalled();
    });

    it('stops the BLOCKER with the explicit 403 (you_blocked_this_user), writing nothing', async () => {
      p().block.findMany.mockResolvedValue([{ blockerId: ME, blockedId: OTHER }]);
      const err = await service.editMessage('convo-1', 'm-1', ME, { contentText: 'x' }).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.getResponse()).toMatchObject({ code: 'you_blocked_this_user' });
      expect(p().message.updateMany).not.toHaveBeenCalled();
    });

    it('creates no Notification (the service has no notification path for an edit)', async () => {
      // A mock with no `notification` model at all: any attempt to touch it would throw.
      await expect(service.editMessage('convo-1', 'm-1', ME, { contentText: 'x' })).resolves.toBeDefined();
    });
  });

  describe('deleteMessage', () => {
    it('scope=me inserts a MessageHide (skipDuplicates) for any message in the thread, including the other person\'s', async () => {
      p().message.findFirst.mockResolvedValue({ id: 'm-1', senderId: OTHER });
      await service.deleteMessage('convo-1', 'm-1', ME, 'me');
      expect(p().messageHide.createMany).toHaveBeenCalledWith({
        data: [{ userId: ME, messageId: 'm-1', hiddenAt: now }],
        skipDuplicates: true,
      });
      expect(p().message.updateMany).not.toHaveBeenCalled();
    });

    it('scope=me is idempotent (a second call is the same single skipDuplicates insert, no error)', async () => {
      p().message.findFirst.mockResolvedValue({ id: 'm-1', senderId: OTHER });
      p().messageHide.createMany.mockResolvedValue({ count: 0 });
      await expect(service.deleteMessage('convo-1', 'm-1', ME, 'me')).resolves.toBeUndefined();
    });

    it('scope=everyone by the sender sets deletedForEveryoneAt on a not-yet-deleted row, at any age', async () => {
      p().message.findFirst.mockResolvedValue({ id: 'm-1', senderId: ME });
      now = new Date(SENT_AT.getTime() + 400 * 24 * 3600 * 1000);
      await service.deleteMessage('convo-1', 'm-1', ME, 'everyone');
      expect(p().message.updateMany).toHaveBeenCalledWith({
        where: { id: 'm-1', deletedForEveryoneAt: null },
        data: { deletedForEveryoneAt: now },
      });
    });

    it('scope=everyone never purges anything: no delete call exists on the mock, and only deletedForEveryoneAt is written', async () => {
      p().message.findFirst.mockResolvedValue({ id: 'm-1', senderId: ME });
      await service.deleteMessage('convo-1', 'm-1', ME, 'everyone');
      const data = p().message.updateMany.mock.calls[0][0].data;
      expect(Object.keys(data)).toEqual(['deletedForEveryoneAt']);
    });

    it('scope=everyone by a non-sender is a 403 and writes nothing', async () => {
      p().message.findFirst.mockResolvedValue({ id: 'm-1', senderId: OTHER });
      const err = await service.deleteMessage('convo-1', 'm-1', ME, 'everyone').catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.getResponse()).toMatchObject({ code: MESSAGE_DELETE_NOT_SENDER_CODE });
      expect(p().message.updateMany).not.toHaveBeenCalled();
    });

    it('is allowed when a Block exists (the Block table is never read)', async () => {
      p().block.findMany.mockResolvedValue([{ blockerId: OTHER, blockedId: ME }]);
      p().message.findFirst.mockResolvedValue({ id: 'm-1', senderId: ME });
      await service.deleteMessage('convo-1', 'm-1', ME, 'everyone');
      await service.deleteMessage('convo-1', 'm-1', ME, 'me');
      expect(p().block.findMany).not.toHaveBeenCalled();
      expect(p().message.updateMany).toHaveBeenCalledTimes(1);
      expect(p().messageHide.createMany).toHaveBeenCalledTimes(1);
    });

    it('404s a missing message and a non-participant, for both scopes', async () => {
      p().message.findFirst.mockResolvedValue(null);
      await expect(service.deleteMessage('convo-1', 'm-x', ME, 'me')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.deleteMessage('convo-1', 'm-x', ME, 'everyone')).rejects.toBeInstanceOf(NotFoundException);
      p().conversation.findUnique.mockResolvedValue(conversation({ participantIds: ['a', 'b'] }));
      await expect(service.deleteMessage('convo-1', 'm-1', ME, 'me')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteConversation ("delete chat", for me only)', () => {
    it('upserts a ConversationHide at the server time for the caller', async () => {
      await service.deleteConversation('convo-1', ME);
      expect(p().conversationHide.upsert).toHaveBeenCalledWith({
        where: { userId_conversationId: { userId: ME, conversationId: 'convo-1' } },
        create: { userId: ME, conversationId: 'convo-1', hiddenAt: now },
        update: { hiddenAt: now },
      });
    });

    it('moves the cutoff forward on a second delete (update branch carries the new time)', async () => {
      await service.deleteConversation('convo-1', ME);
      now = new Date(now.getTime() + 3600_000);
      await service.deleteConversation('convo-1', ME);
      expect(p().conversationHide.upsert.mock.calls[1][0].update).toEqual({ hiddenAt: now });
    });

    it('touches no message and no other participant\'s row, and 404s a non-participant', async () => {
      await service.deleteConversation('convo-1', ME);
      expect(p().message.updateMany).not.toHaveBeenCalled();
      p().conversation.findUnique.mockResolvedValue(conversation({ participantIds: ['a', 'b'] }));
      await expect(service.deleteConversation('convo-1', ME)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getMessages read path', () => {
    function row(over: Record<string, unknown> = {}) {
      return {
        id: 'm-1',
        conversationId: 'convo-1',
        senderId: OTHER,
        contentText: 'hello',
        sentAt: SENT_AT,
        readAt: null,
        editedAt: null,
        deletedForEveryoneAt: null,
        ...over,
      };
    }

    it('adds no extra filter when the caller hid nothing (the where is unchanged)', async () => {
      p().message.findMany.mockResolvedValue([row()]);
      await service.getMessages('convo-1', ME, {});
      expect(p().message.findMany.mock.calls[0][0].where).toEqual({ conversationId: 'convo-1' });
    });

    it('leaves out everything sent at or before the caller\'s "delete chat" moment', async () => {
      const hiddenAt = new Date('2026-11-15T10:30:00Z');
      p().user.findUnique.mockResolvedValue({ conversationHides: [{ hiddenAt }], messageHides: [] });
      await service.getMessages('convo-1', ME, {});
      expect(p().message.findMany.mock.calls[0][0].where).toEqual({
        conversationId: 'convo-1',
        sentAt: { gt: hiddenAt },
      });
    });

    it('leaves out messages the caller hid individually', async () => {
      p().user.findUnique.mockResolvedValue({ conversationHides: [], messageHides: [{ messageId: 'm-3' }] });
      await service.getMessages('convo-1', ME, {});
      expect(p().message.findMany.mock.calls[0][0].where).toEqual({
        conversationId: 'convo-1',
        hides: { none: { userId: ME } },
      });
    });

    it('keeps the keyset cursor as a separate AND element next to the hide filters', async () => {
      const hiddenAt = new Date('2026-11-15T10:30:00Z');
      p().user.findUnique.mockResolvedValue({ conversationHides: [{ hiddenAt }], messageHides: [{ messageId: 'm-3' }] });
      const { encodeMessageCursor } = await import('./cursor.util');
      const cursor = encodeMessageCursor({ sentAt: new Date('2026-11-15T11:00:00Z'), id: 'm-9' });
      await service.getMessages('convo-1', ME, { cursor });
      const where = p().message.findMany.mock.calls[0][0].where;
      expect(where.AND[0]).toEqual({
        conversationId: 'convo-1',
        sentAt: { gt: hiddenAt },
        hides: { none: { userId: ME } },
      });
      expect(where.AND[1].OR).toHaveLength(2);
    });

    it('returns a message deleted for everyone as the placeholder (no text, no readAt, editedAt null), for either viewer', async () => {
      p().message.findMany.mockResolvedValue([
        row({ id: 'm-2', deletedForEveryoneAt: new Date(), contentText: 'secret text', editedAt: new Date() }),
      ]);
      const asMe = await service.getMessages('convo-1', ME, {});
      const asOther = await service.getMessages('convo-1', OTHER, {});
      const expected = {
        id: 'm-2',
        conversationId: 'convo-1',
        senderId: OTHER,
        sentAt: SENT_AT,
        deletedForEveryone: true,
        contentText: null,
        editedAt: null,
      };
      expect(asMe.items[0]).toEqual(expected);
      expect(asOther.items[0]).toEqual(expected);
      expect(JSON.stringify(asMe)).not.toContain('secret text');
    });

    it('carries editedAt on every live message and flags deletedForEveryone false', async () => {
      const editedAt = new Date('2026-11-15T10:03:00Z');
      p().message.findMany.mockResolvedValue([row({ id: 'm-1', editedAt }), row({ id: 'm-0', editedAt: null })]);
      const page = await service.getMessages('convo-1', ME, {});
      expect(page.items).toEqual([
        expect.objectContaining({ id: 'm-1', editedAt, deletedForEveryone: false, contentText: 'hello' }),
        expect.objectContaining({ id: 'm-0', editedAt: null, deletedForEveryone: false }),
      ]);
    });

    it('never selects originalContentText', async () => {
      await service.getMessages('convo-1', ME, {});
      expect(p().message.findMany.mock.calls[0][0].select.originalContentText).toBeUndefined();
    });
  });

  describe('listConversations read path', () => {
    it('adds no exclusion when the caller hid no conversation (the where is unchanged)', async () => {
      p().conversation.findMany.mockResolvedValue([]);
      await service.listConversations(ME, {});
      expect(p().conversation.findMany.mock.calls[0][0].where).toEqual({ participantIds: { has: ME } });
    });

    it('leaves out a hidden conversation unless a message newer than hiddenAt exists (lastMessageAt > hiddenAt)', async () => {
      const hiddenAt = new Date('2026-11-15T10:30:00Z');
      p().user.findUnique.mockResolvedValue({ conversationHides: [{ conversationId: 'convo-1', hiddenAt }] });
      await service.listConversations(ME, {});
      expect(p().conversation.findMany.mock.calls[0][0].where).toEqual({
        participantIds: { has: ME },
        NOT: { OR: [{ id: 'convo-1', lastMessageAt: { lte: hiddenAt } }] },
      });
    });

    it('last-message preview and unread count ignore hidden messages, deleted-for-everyone messages and anything before the chat was deleted', async () => {
      const hiddenAt = new Date('2026-11-15T10:30:00Z');
      p().user.findUnique.mockResolvedValue({ conversationHides: [{ conversationId: 'convo-1', hiddenAt }] });
      p().conversation.findMany.mockResolvedValue([conversation({ lastMessageAt: new Date('2026-11-15T11:00:00Z') })]);
      await service.listConversations(ME, {});

      const previewWhere = p().message.findMany.mock.calls[0][0].where;
      expect(previewWhere).toEqual({
        OR: [{ conversationId: 'convo-1', sentAt: { gt: hiddenAt } }],
        deletedForEveryoneAt: null,
        hides: { none: { userId: ME } },
      });
      expect(p().message.groupBy.mock.calls[0][0].where).toEqual({
        AND: [previewWhere, { senderId: { not: ME }, readAt: null }],
      });
    });

    it('without any hide the preview and unread queries only add the two per-message conditions', async () => {
      p().conversation.findMany.mockResolvedValue([conversation()]);
      await service.listConversations(ME, {});
      expect(p().message.findMany.mock.calls[0][0].where).toEqual({
        conversationId: { in: ['convo-1'] },
        deletedForEveryoneAt: null,
        hides: { none: { userId: ME } },
      });
    });
  });
});
