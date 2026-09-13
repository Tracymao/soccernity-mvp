import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { encodeNotificationCursor } from './cursor.util';
import { NotificationsService } from './notifications.service';

// Mocked-Prisma unit tests, following banter.service.spec.ts /
// messaging.service.spec.ts's own convention. This module makes no raw
// SQL and no transaction/isolation-level claims, so no e2e spec was
// added — see notifications/README.md.

function buildPrismaMock() {
  const prisma = {
    notification: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
    },
    post: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    conversation: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    fixture: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    contestCycle: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;

  return prisma;
}

const CALLER = 'caller-1';

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'notif-1',
    userId: CALLER,
    type: 'follow',
    payloadRefId: 'actor-1',
    read: false,
    createdAt: new Date('2026-09-13T10:00:00Z'),
    ...over,
  };
}

describe('NotificationsService', () => {
  describe('listNotifications', () => {
    it('paginates newest-first and returns unreadCount alongside the page', async () => {
      const prisma = buildPrismaMock();
      const rows = [row({ id: 'n-1' })];
      (prisma.notification.findMany as jest.Mock).mockResolvedValue(rows);
      (prisma.notification.count as jest.Mock).mockResolvedValue(3);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'actor-1', displayName: 'Jane' }]);
      const service = new NotificationsService(prisma);

      const page = await service.listNotifications(CALLER, {});

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: CALLER },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 21,
        }),
      );
      expect(page.unreadCount).toBe(3);
      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).toBeNull();
    });

    it('sets nextCursor when a page is full and encodes it from the last real row', async () => {
      const prisma = buildPrismaMock();
      const rows = Array.from({ length: 21 }, (_, i) =>
        row({ id: `n-${i}`, createdAt: new Date(2026, 8, 13, 10, 0, 0 - i) }),
      );
      (prisma.notification.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new NotificationsService(prisma);

      const page = await service.listNotifications(CALLER, {});

      expect(page.items).toHaveLength(20);
      expect(page.nextCursor).not.toBeNull();
    });

    it('applies the cursor filter when one is supplied', async () => {
      const prisma = buildPrismaMock();
      const service = new NotificationsService(prisma);
      const cursor = encodeNotificationCursor({ createdAt: new Date('2026-09-13T09:00:00Z'), id: 'n-0' });

      await service.listNotifications(CALLER, { cursor });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              { userId: CALLER },
              {
                OR: [
                  { createdAt: { lt: new Date('2026-09-13T09:00:00Z') } },
                  { createdAt: new Date('2026-09-13T09:00:00Z'), id: { lt: 'n-0' } },
                ],
              },
            ],
          },
        }),
      );
    });

    it('resolves a follow notification to its actor via payloadRefId', async () => {
      const prisma = buildPrismaMock();
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([
        row({ type: 'follow', payloadRefId: 'actor-1' }),
      ]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'actor-1', displayName: 'Jane' }]);
      const service = new NotificationsService(prisma);

      const page = await service.listNotifications(CALLER, {});

      expect(page.items[0].data).toEqual({ actor: { id: 'actor-1', displayName: 'Jane' } });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['actor-1'] } } }),
      );
    });

    it('resolves like/comment notifications to the post, with no actor (documented gap)', async () => {
      const prisma = buildPrismaMock();
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([
        row({ id: 'n-like', type: 'like', payloadRefId: 'post-1' }),
        row({ id: 'n-comment', type: 'comment', payloadRefId: 'post-1' }),
      ]);
      (prisma.post.findMany as jest.Mock).mockResolvedValue([
        { id: 'post-1', contentText: 'hello world', authorId: CALLER },
      ]);
      const service = new NotificationsService(prisma);

      const page = await service.listNotifications(CALLER, {});

      // One batched query for both rows, not one per row.
      expect(prisma.post.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['post-1'] } } }),
      );
      expect(page.items[0].data).toEqual({
        post: { id: 'post-1', contentText: 'hello world', authorId: CALLER },
      });
      expect(page.items[1].data).toEqual({
        post: { id: 'post-1', contentText: 'hello world', authorId: CALLER },
      });
    });

    it('resolves a message notification to the other participant, not the caller', async () => {
      const prisma = buildPrismaMock();
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([
        row({ type: 'message', payloadRefId: 'convo-1' }),
      ]);
      (prisma.conversation.findMany as jest.Mock).mockResolvedValue([
        { id: 'convo-1', participantIds: [CALLER, 'other-1'] },
      ]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'other-1', displayName: 'Sam' }]);
      const service = new NotificationsService(prisma);

      const page = await service.listNotifications(CALLER, {});

      expect(page.items[0].data).toEqual({
        conversationId: 'convo-1',
        otherParticipant: { id: 'other-1', displayName: 'Sam' },
      });
    });

    it('resolves a message notification to a ghost participant when the other user was hard-deleted', async () => {
      const prisma = buildPrismaMock();
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([
        row({ type: 'message', payloadRefId: 'convo-1' }),
      ]);
      (prisma.conversation.findMany as jest.Mock).mockResolvedValue([
        { id: 'convo-1', participantIds: [CALLER, 'gone-1'] },
      ]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]); // gone-1 no longer exists
      const service = new NotificationsService(prisma);

      const page = await service.listNotifications(CALLER, {});

      expect(page.items[0].data).toEqual({
        conversationId: 'convo-1',
        otherParticipant: { id: 'gone-1', displayName: null },
      });
    });

    it('combines follow-actor and message-other-participant ids into ONE User query', async () => {
      const prisma = buildPrismaMock();
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([
        row({ id: 'n-follow', type: 'follow', payloadRefId: 'actor-1' }),
        row({ id: 'n-message', type: 'message', payloadRefId: 'convo-1' }),
      ]);
      (prisma.conversation.findMany as jest.Mock).mockResolvedValue([
        { id: 'convo-1', participantIds: [CALLER, 'other-1'] },
      ]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'actor-1', displayName: 'Jane' },
        { id: 'other-1', displayName: 'Sam' },
      ]);
      const service = new NotificationsService(prisma);

      await service.listNotifications(CALLER, {});

      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['actor-1', 'other-1'] } } }),
      );
    });

    it('resolves fixture_scheduled/result_logged to the fixture, with a free-text opponent name falling back correctly', async () => {
      const prisma = buildPrismaMock();
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([
        row({ id: 'n-1', type: 'fixture_scheduled', payloadRefId: 'fix-1' }),
        row({ id: 'n-2', type: 'result_logged', payloadRefId: 'fix-2' }),
      ]);
      (prisma.fixture.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'fix-1',
          scheduledAt: new Date('2026-10-01T14:00:00Z'),
          status: 'scheduled',
          teamA: { name: 'Riverside FC' },
          teamB: { name: 'Ikorodu Rangers' },
          opponentName: null,
          result: null,
        },
        {
          id: 'fix-2',
          scheduledAt: new Date('2026-10-08T14:00:00Z'),
          status: 'full_time',
          teamA: { name: 'Marina Boys FC' },
          teamB: null,
          opponentName: 'Some Local Side',
          result: { scoreA: 2, scoreB: 1 },
        },
      ]);
      const service = new NotificationsService(prisma);

      const page = await service.listNotifications(CALLER, {});

      expect(page.items[0].data).toEqual({
        fixture: {
          id: 'fix-1',
          teamAName: 'Riverside FC',
          teamBName: 'Ikorodu Rangers',
          scheduledAt: new Date('2026-10-01T14:00:00Z'),
          status: 'scheduled',
          result: null,
        },
      });
      expect(page.items[1].data).toEqual({
        fixture: {
          id: 'fix-2',
          teamAName: 'Marina Boys FC',
          teamBName: 'Some Local Side',
          scheduledAt: new Date('2026-10-08T14:00:00Z'),
          status: 'full_time',
          result: { scoreA: 2, scoreB: 1 },
        },
      });
    });

    it('resolves contest_win to the cycle title only (no round/position)', async () => {
      const prisma = buildPrismaMock();
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([
        row({ type: 'contest_win', payloadRefId: 'cyc-1' }),
      ]);
      (prisma.contestCycle.findMany as jest.Mock).mockResolvedValue([{ id: 'cyc-1', title: 'September Contest' }]);
      const service = new NotificationsService(prisma);

      const page = await service.listNotifications(CALLER, {});

      expect(page.items[0].data).toEqual({ cycle: { id: 'cyc-1', title: 'September Contest' } });
    });

    it('resolves to null data when the referenced entity is gone (orphaned payloadRefId)', async () => {
      const prisma = buildPrismaMock();
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([
        row({ type: 'like', payloadRefId: 'deleted-post' }),
      ]);
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]); // hard-deleted, cascaded away
      const service = new NotificationsService(prisma);

      const page = await service.listNotifications(CALLER, {});

      expect(page.items[0].data).toBeNull();
    });

    it('resolves to null data when payloadRefId itself is null', async () => {
      const prisma = buildPrismaMock();
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([row({ payloadRefId: null })]);
      const service = new NotificationsService(prisma);

      const page = await service.listNotifications(CALLER, {});

      expect(page.items[0].data).toBeNull();
    });

    it('issues zero resolution queries for an empty page', async () => {
      const prisma = buildPrismaMock();
      const service = new NotificationsService(prisma);

      await service.listNotifications(CALLER, {});

      expect(prisma.post.findMany).not.toHaveBeenCalled();
      expect(prisma.conversation.findMany).not.toHaveBeenCalled();
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.fixture.findMany).not.toHaveBeenCalled();
      expect(prisma.contestCycle.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getUnreadCount', () => {
    it('counts only unread rows for the caller', async () => {
      const prisma = buildPrismaMock();
      (prisma.notification.count as jest.Mock).mockResolvedValue(5);
      const service = new NotificationsService(prisma);

      const count = await service.getUnreadCount(CALLER);

      expect(count).toBe(5);
      expect(prisma.notification.count).toHaveBeenCalledWith({ where: { userId: CALLER, read: false } });
    });
  });

  describe('markRead', () => {
    it('404s for a non-existent notification id', async () => {
      const prisma = buildPrismaMock();
      (prisma.notification.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new NotificationsService(prisma);

      await expect(service.markRead(CALLER, 'missing')).rejects.toThrow(NotFoundException);
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it('404s (never 403) for a notification owned by someone else', async () => {
      const prisma = buildPrismaMock();
      (prisma.notification.findUnique as jest.Mock).mockResolvedValue(row({ userId: 'someone-else' }));
      const service = new NotificationsService(prisma);

      await expect(service.markRead(CALLER, 'notif-1')).rejects.toThrow(NotFoundException);
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it('marks an unread notification read and returns the resolved item', async () => {
      const prisma = buildPrismaMock();
      (prisma.notification.findUnique as jest.Mock).mockResolvedValue(row({ read: false }));
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'actor-1', displayName: 'Jane' }]);
      const service = new NotificationsService(prisma);

      const result = await service.markRead(CALLER, 'notif-1');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { read: true },
      });
      expect(result.read).toBe(true);
      expect(result.data).toEqual({ actor: { id: 'actor-1', displayName: 'Jane' } });
    });

    it('is idempotent — an already-read notification is a no-op 200, not a duplicate update', async () => {
      const prisma = buildPrismaMock();
      (prisma.notification.findUnique as jest.Mock).mockResolvedValue(row({ read: true }));
      const service = new NotificationsService(prisma);

      const result = await service.markRead(CALLER, 'notif-1');

      expect(prisma.notification.update).not.toHaveBeenCalled();
      expect(result.read).toBe(true);
    });
  });

  describe('markAllRead', () => {
    it('marks every unread row read for the caller and returns the count', async () => {
      const prisma = buildPrismaMock();
      (prisma.notification.updateMany as jest.Mock).mockResolvedValue({ count: 4 });
      const service = new NotificationsService(prisma);

      const result = await service.markAllRead(CALLER);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: CALLER, read: false },
        data: { read: true },
      });
      expect(result).toEqual({ markedRead: 4 });
    });
  });
});
