import { ConflictException } from '@nestjs/common';
import { Clock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { MESSAGE_REMOVED_CODE } from './messaging.constants';
import { MessagingService } from './messaging.service';

// B-289 (Decision Log #483): a message a moderator removed. The sender can no longer edit or delete it
// (409 message_removed); the thread and the conversation-list preview show a text-less stub. The real SQL is
// proved in test/content-removal.e2e-spec.ts.

const ME = 'me-1';
const OTHER = 'other-2';
const SENT_AT = new Date('2026-11-15T10:00:00.000Z');
const REMOVED_AT = new Date('2026-11-15T11:00:00.000Z');

function buildPrisma() {
  return {
    conversation: {
      findUnique: jest.fn().mockResolvedValue({ id: 'convo-1', participantIds: [ME, OTHER].sort() }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    conversationHide: { findMany: jest.fn().mockResolvedValue([]) },
    message: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    messageHide: { createMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    block: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
}

describe('MessagingService: a message removed by moderation (B-289)', () => {
  let prisma: PrismaService;
  let service: MessagingService;
  const clock: Clock = { now: () => new Date(SENT_AT.getTime() + 60_000) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = () => prisma as any;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new MessagingService(prisma, clock);
  });

  const removed = (senderId: string) => ({
    id: 'm-1',
    senderId,
    contentText: 'secret',
    mediaUrl: null,
    sentAt: SENT_AT,
    originalContentText: null,
    deletedForEveryoneAt: null,
    removedByModerationAt: REMOVED_AT,
  });

  it('the sender cannot edit it: 409 message_removed, nothing written', async () => {
    p().message.findFirst.mockResolvedValue(removed(ME));
    const err = await service.editMessage('convo-1', 'm-1', ME, { contentText: 'x' }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: MESSAGE_REMOVED_CODE });
    expect(MESSAGE_REMOVED_CODE).toBe('message_removed');
    expect(p().message.updateMany).not.toHaveBeenCalled();
  });

  it.each(['everyone', 'me'] as const)('the sender cannot delete it for %s: 409 message_removed, nothing written', async (scope) => {
    p().message.findFirst.mockResolvedValue(removed(ME));
    const err = await service.deleteMessage('convo-1', 'm-1', ME, scope).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'message_removed' });
    expect(p().message.updateMany).not.toHaveBeenCalled();
    expect(p().messageHide.createMany).not.toHaveBeenCalled();
  });

  it('the other person can still hide it from their own view (delete for me)', async () => {
    p().message.findFirst.mockResolvedValue(removed(OTHER));
    await expect(service.deleteMessage('convo-1', 'm-1', ME, 'me')).resolves.toBeUndefined();
    expect(p().messageHide.createMany).toHaveBeenCalled();
  });

  const threadRow = (senderId: string) => ({
    id: 'm-1',
    conversationId: 'convo-1',
    senderId,
    contentText: 'a hurtful thing',
    sentAt: SENT_AT,
    readAt: null,
    editedAt: new Date('2026-11-15T10:05:00Z'),
    originalContentText: 'the original',
    deletedForEveryoneAt: null,
    removedByModerationAt: REMOVED_AT,
  });

  it('the thread returns { id, sentAt, removedByModeration: true, isMine } and NOTHING else for a removed message', async () => {
    p().message.findMany.mockResolvedValue([threadRow(OTHER)]);
    const page = await service.getMessages('convo-1', ME, {});
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toEqual({ id: 'm-1', sentAt: SENT_AT, removedByModeration: true, isMine: false });
    const json = JSON.stringify(page);
    expect(json).not.toContain('a hurtful thing');
    expect(json).not.toContain('the original');
    expect(json).not.toContain('editedAt');
    expect(json).not.toContain('senderId');
    expect(json).not.toContain(OTHER);
  });

  // B-296 (Decision Log #489): the stub says whether the VIEWER sent it, never who did.
  it('B-296: the SENDER sees isMine: true on the thread stub, and still no sender id', async () => {
    p().message.findMany.mockResolvedValue([threadRow(ME)]);
    const page = await service.getMessages('convo-1', ME, {});
    expect(page.items[0]).toEqual({ id: 'm-1', sentAt: SENT_AT, removedByModeration: true, isMine: true });
    expect(Object.keys(page.items[0]).sort()).toEqual(['id', 'isMine', 'removedByModeration', 'sentAt']);
    expect(JSON.stringify(page)).not.toContain('senderId');
  });

  it('B-296: the RECIPIENT sees isMine: false on the same stub (the flag follows the viewer, not the row)', async () => {
    p().message.findMany.mockResolvedValue([threadRow(ME)]);
    const page = await service.getMessages('convo-1', OTHER, {});
    expect(page.items[0]).toMatchObject({ removedByModeration: true, isMine: false });
  });

  it('B-296: a removal wins over an edit and a delete-for-everyone, and still carries isMine', async () => {
    p().message.findMany.mockResolvedValue([{ ...threadRow(ME), deletedForEveryoneAt: new Date('2026-11-15T10:30:00Z') }]);
    const page = await service.getMessages('convo-1', ME, {});
    expect(page.items[0]).toEqual({ id: 'm-1', sentAt: SENT_AT, removedByModeration: true, isMine: true });
  });

  describe('B-296: the conversation-list preview is the same stub and carries isMine too', () => {
    const lastMessageRow = (senderId: string) => ({
      id: 'm-1',
      conversationId: 'convo-1',
      contentText: 'a hurtful thing',
      senderId,
      sentAt: SENT_AT,
      removedByModerationAt: REMOVED_AT,
    });
    const conversationRow = {
      id: 'convo-1',
      participantIds: [ME, OTHER].sort(),
      lastMessageAt: SENT_AT,
      createdAt: SENT_AT,
    };

    it.each([
      [ME, ME, true],
      [OTHER, ME, false],
      [ME, OTHER, false],
      [OTHER, OTHER, true],
    ])('message sent by %s, viewed by %s -> isMine %s', async (senderId, viewerId, isMine) => {
      p().conversation.findMany.mockResolvedValue([conversationRow]);
      // toConversationViews reads: other participants, unread groups, then the latest message per conversation.
      p().message.findMany.mockResolvedValue([lastMessageRow(senderId)]);
      const page = await service.listConversations(viewerId, {});
      const preview = page.items[0].lastMessage;
      expect(preview).toEqual({ id: 'm-1', sentAt: SENT_AT, removedByModeration: true, isMine });
      expect(JSON.stringify(preview)).not.toContain('a hurtful thing');
      expect(JSON.stringify(preview)).not.toContain('senderId');
    });
  });
});
