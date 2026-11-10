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
    },
    message: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    messageHide: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
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

  it('the thread returns { id, sentAt, removedByModeration: true } and NOTHING else for a removed message', async () => {
    p().message.findMany.mockResolvedValue([
      {
        id: 'm-1',
        conversationId: 'convo-1',
        senderId: OTHER,
        contentText: 'a hurtful thing',
        sentAt: SENT_AT,
        readAt: null,
        editedAt: new Date('2026-11-15T10:05:00Z'),
        originalContentText: 'the original',
        deletedForEveryoneAt: null,
        removedByModerationAt: REMOVED_AT,
      },
    ]);
    const page = await service.getMessages('convo-1', ME, {});
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toEqual({ id: 'm-1', sentAt: SENT_AT, removedByModeration: true });
    const json = JSON.stringify(page);
    expect(json).not.toContain('a hurtful thing');
    expect(json).not.toContain('the original');
    expect(json).not.toContain('editedAt');
    expect(json).not.toContain('senderId');
  });
});
