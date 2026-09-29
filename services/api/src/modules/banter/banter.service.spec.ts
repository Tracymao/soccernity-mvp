import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FeedService } from '../feed/feed.service';
import { BanterService } from './banter.service';
import { encodeBanterRoomCursor, encodeMyBantsCursor } from './cursor.util';

// Mocked-Prisma + mocked-FeedService unit tests, following
// clubs.service.spec.ts / grassroots.service.spec.ts. The real
// _BanterRoomMember_ table, its @@unique constraint, the onDelete:
// Cascade FKs and the real transactional memberCount behavior are proven
// in test/banter.e2e-spec.ts against Postgres — this file covers the
// branching logic a mock can prove.

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'x',
  });
}
function p2025(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('not found', {
    code: 'P2025',
    clientVersion: 'x',
  });
}

function buildPrismaMock() {
  const prisma = {
    banterRoom: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    banterRoomMember: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
    },
    // sprint-3/banter-room-topics (Decision Log #276).
    topic: {
      upsert: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    banterRoomTopic: {
      upsert: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;

  // Same interactive-transaction mock shape as clubs.service.spec.ts /
  // feed.service.spec.ts: invoke the callback with the same mock object
  // standing in for `tx`, so normal await/throw control flow behaves
  // like a real transaction.
  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn(
    (fn: (tx: unknown) => unknown) => fn(prisma),
  );

  return prisma;
}

function buildFeedMock() {
  return {
    createPost: jest.fn(),
    getBanterRoomFeed: jest.fn(),
  } as unknown as FeedService;
}

// `topics: []` by default — sprint-3/banter-room-topics (Decision Log
// #276) added a `topics` field to ROOM_SELECT's raw shape (a junction
// array `{ topic: {...} }[]`) that toRoomSummary() flattens to
// `TopicSummary[]`. Every existing test below attaches no topics, so the
// raw and flattened shapes are identical (`[].map(...) === []`) — no
// other test literal needs to change because of this field.
function room(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'room-1',
    name: 'Gooners Only',
    scopeType: 'club',
    createdBy: 'user-1',
    memberCount: 3,
    topics: [],
    ...overrides,
  };
}

function topic(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: 'topic-1', name: 'Transfers', ...overrides };
}

describe('BanterService', () => {
  describe('createRoom', () => {
    it('creates the room with createdBy = caller, auto-joins the creator, and starts memberCount at 1', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.create as jest.Mock).mockResolvedValue(
        room({ id: 'room-9', memberCount: 1 }),
      );
      (prisma.banterRoomMember.create as jest.Mock).mockResolvedValue({});

      const service = new BanterService(prisma, buildFeedMock());
      const result = await service.createRoom('user-1', { name: 'Gooners Only', scopeType: 'club' });

      expect(prisma.banterRoom.create).toHaveBeenCalledWith({
        data: { name: 'Gooners Only', scopeType: 'club', createdBy: 'user-1', memberCount: 1 },
        select: expect.objectContaining({ id: true, name: true, scopeType: true, memberCount: true }),
      });
      expect(prisma.banterRoomMember.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', banterRoomId: 'room-9' },
      });
      expect(result).toEqual({ ...room({ id: 'room-9', memberCount: 1 }), joined: true });
      // Both writes went through the interactive transaction.
      expect((prisma as unknown as { $transaction: jest.Mock }).$transaction).toHaveBeenCalled();
    });
  });

  describe('listRooms', () => {
    it('orders alphabetically by name asc, id asc, never selects `members`, and attaches per-caller joined', async () => {
      const prisma = buildPrismaMock();
      const rows = [room({ id: 'room-1', name: 'Alpha' }), room({ id: 'room-2', name: 'Beta' })];
      (prisma.banterRoom.findMany as jest.Mock).mockResolvedValueOnce(rows);
      (prisma.banterRoomMember.findMany as jest.Mock).mockResolvedValueOnce([
        { banterRoomId: 'room-2' },
      ]);

      const service = new BanterService(prisma, buildFeedMock());
      const result = await service.listRooms({}, 'viewer-1');

      const callArgs = (prisma.banterRoom.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.orderBy).toEqual([{ name: 'asc' }, { id: 'asc' }]);
      expect(callArgs.select).not.toHaveProperty('members');
      expect(result.items).toEqual([
        { ...rows[0], joined: false },
        { ...rows[1], joined: true },
      ]);
      expect(result.nextCursor).toBeNull();
    });

    it('ANDs a scopeType filter, a case-insensitive name filter, and the (name,id) cursor', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.findMany as jest.Mock).mockResolvedValueOnce([]);
      const cursor = encodeBanterRoomCursor({ name: 'Alpha', id: 'room-1' });

      const service = new BanterService(prisma, buildFeedMock());
      await service.listRooms({ scopeType: 'league', q: 'derby', cursor }, 'viewer-1');

      const where = (prisma.banterRoom.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where).toEqual({
        AND: [
          { scopeType: 'league' },
          { name: { contains: 'derby', mode: 'insensitive' } },
          { OR: [{ name: { gt: 'Alpha' } }, { name: 'Alpha', id: { gt: 'room-1' } }] },
        ],
      });
    });

    // sprint-3/banter-room-topics (Decision Log #276) — "filter rooms by
    // topic" (ListBanterRoomsQueryDto.topicId).
    it('ANDs a topicId filter against the BanterRoomTopic join', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.findMany as jest.Mock).mockResolvedValueOnce([]);

      const service = new BanterService(prisma, buildFeedMock());
      await service.listRooms({ topicId: 'topic-1' }, 'viewer-1');

      const where = (prisma.banterRoom.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where).toEqual({ AND: [{ topics: { some: { topicId: 'topic-1' } } }] });
    });

    it('flattens the raw topics junction shape to a plain TopicSummary[]', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.findMany as jest.Mock).mockResolvedValueOnce([
        room({ id: 'room-1', topics: [{ topic: topic() }, { topic: topic({ id: 'topic-2', name: 'Deadline Day' }) }] }),
      ]);
      (prisma.banterRoomMember.findMany as jest.Mock).mockResolvedValueOnce([]);

      const service = new BanterService(prisma, buildFeedMock());
      const result = await service.listRooms({}, 'viewer-1');

      expect(result.items[0].topics).toEqual([topic(), topic({ id: 'topic-2', name: 'Deadline Day' })]);
    });

    it('builds a nextCursor from the last kept row when a lookahead row exists', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.findMany as jest.Mock).mockResolvedValueOnce([
        room({ id: 'room-1', name: 'Alpha' }),
        room({ id: 'room-2', name: 'Beta' }), // lookahead
      ]);
      (prisma.banterRoomMember.findMany as jest.Mock).mockResolvedValueOnce([]);

      const service = new BanterService(prisma, buildFeedMock());
      const result = await service.listRooms({ limit: 1 }, 'viewer-1');

      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBe(encodeBanterRoomCursor({ name: 'Alpha', id: 'room-1' }));
    });

    it('rejects a malformed cursor with a 400', async () => {
      const prisma = buildPrismaMock();
      const service = new BanterService(prisma, buildFeedMock());
      await expect(service.listRooms({ cursor: 'not-base64-json' }, 'viewer-1')).rejects.toThrow();
    });
  });

  describe('getMyRooms', () => {
    it('returns the caller\'s joined rooms newest-joined-first, all joined:true, with a joinedAt cursor', async () => {
      const prisma = buildPrismaMock();
      const joinedAt = new Date('2026-09-01T10:00:00.000Z');
      (prisma.banterRoomMember.findMany as jest.Mock).mockResolvedValueOnce([
        { joinedAt, banterRoomId: 'room-1', banterRoom: room({ id: 'room-1' }) },
        { joinedAt, banterRoomId: 'room-0', banterRoom: room({ id: 'room-0' }) }, // lookahead
      ]);

      const service = new BanterService(prisma, buildFeedMock());
      const result = await service.getMyRooms('user-1', { limit: 1 });

      const args = (prisma.banterRoomMember.findMany as jest.Mock).mock.calls[0][0];
      expect(args.where).toEqual({ userId: 'user-1' });
      expect(args.orderBy).toEqual([{ joinedAt: 'desc' }, { banterRoomId: 'desc' }]);
      expect(result.items).toEqual([{ ...room({ id: 'room-1' }), joined: true }]);
      expect(result.nextCursor).toBe(encodeMyBantsCursor({ joinedAt, id: 'room-1' }));
    });

    it('applies a My Bants cursor as a strict "before this (joinedAt, banterRoomId)" filter', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoomMember.findMany as jest.Mock).mockResolvedValueOnce([]);
      const at = new Date('2026-09-01T10:00:00.000Z');
      const cursor = encodeMyBantsCursor({ joinedAt: at, id: 'room-5' });

      const service = new BanterService(prisma, buildFeedMock());
      await service.getMyRooms('user-1', { cursor });

      const where = (prisma.banterRoomMember.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where).toEqual({
        userId: 'user-1',
        OR: [
          { joinedAt: { lt: at } },
          { joinedAt: at, banterRoomId: { lt: 'room-5' } },
        ],
      });
    });
  });

  describe('getRoomById', () => {
    it('404s for an unknown id', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new BanterService(prisma, buildFeedMock());
      await expect(service.getRoomById('nope', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns joined:true when a membership row exists for the caller, false otherwise', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.findUnique as jest.Mock).mockResolvedValue(room());
      (prisma.banterRoomMember.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'm-1' });
      const service = new BanterService(prisma, buildFeedMock());
      expect((await service.getRoomById('room-1', 'user-1')).joined).toBe(true);

      (prisma.banterRoomMember.findUnique as jest.Mock).mockResolvedValueOnce(null);
      expect((await service.getRoomById('room-1', 'user-2')).joined).toBe(false);
    });
  });

  describe('joinRoom', () => {
    it('404s for an unknown room, writing nothing', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new BanterService(prisma, buildFeedMock());
      await expect(service.joinRoom('user-1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.banterRoomMember.create).not.toHaveBeenCalled();
    });

    it('creates the member row and increments memberCount in one transaction', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'room-1' }) // assertRoomExists
        .mockResolvedValueOnce({ memberCount: 4 }); // currentMemberCount
      (prisma.banterRoomMember.create as jest.Mock).mockResolvedValue({});
      (prisma.banterRoom.update as jest.Mock).mockResolvedValue({});

      const service = new BanterService(prisma, buildFeedMock());
      const result = await service.joinRoom('user-1', 'room-1');

      expect(prisma.banterRoomMember.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', banterRoomId: 'room-1' },
      });
      expect(prisma.banterRoom.update).toHaveBeenCalledWith({
        where: { id: 'room-1' },
        data: { memberCount: { increment: 1 } },
      });
      expect(result).toEqual({ roomId: 'room-1', joined: true, memberCount: 4 });
    });

    it('is idempotent — a P2002 on the member create is swallowed and memberCount is NOT touched again', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'room-1' })
        .mockResolvedValueOnce({ memberCount: 1 });
      (prisma.banterRoomMember.create as jest.Mock).mockRejectedValue(p2002());

      const service = new BanterService(prisma, buildFeedMock());
      const result = await service.joinRoom('user-1', 'room-1');

      expect(prisma.banterRoom.update).not.toHaveBeenCalled();
      expect(result).toEqual({ roomId: 'room-1', joined: true, memberCount: 1 });
    });

    it('rethrows a non-P2002 error', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'room-1' });
      (prisma.banterRoomMember.create as jest.Mock).mockRejectedValue(new Error('boom'));
      const service = new BanterService(prisma, buildFeedMock());
      await expect(service.joinRoom('user-1', 'room-1')).rejects.toThrow('boom');
    });
  });

  describe('leaveRoom', () => {
    it('is a no-op success when the caller was never a member (never opens a transaction, never a 404)', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'room-1' })
        .mockResolvedValueOnce({ memberCount: 2 });
      (prisma.banterRoomMember.findUnique as jest.Mock).mockResolvedValue(null);

      const service = new BanterService(prisma, buildFeedMock());
      const result = await service.leaveRoom('user-1', 'room-1');

      expect((prisma as unknown as { $transaction: jest.Mock }).$transaction).not.toHaveBeenCalled();
      expect(result).toEqual({ roomId: 'room-1', joined: false, memberCount: 2 });
    });

    it('deletes the member row and decrements memberCount with a gt:0 floor guard', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'room-1' })
        .mockResolvedValueOnce({ memberCount: 1 });
      (prisma.banterRoomMember.findUnique as jest.Mock).mockResolvedValue({ id: 'm-1' });
      (prisma.banterRoomMember.delete as jest.Mock).mockResolvedValue({});
      (prisma.banterRoom.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const service = new BanterService(prisma, buildFeedMock());
      const result = await service.leaveRoom('user-1', 'room-1');

      expect(prisma.banterRoom.updateMany).toHaveBeenCalledWith({
        where: { id: 'room-1', memberCount: { gt: 0 } },
        data: { memberCount: { decrement: 1 } },
      });
      expect(result).toEqual({ roomId: 'room-1', joined: false, memberCount: 1 });
    });

    it('swallows a P2025 concurrent-delete race', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'room-1' })
        .mockResolvedValueOnce({ memberCount: 0 });
      (prisma.banterRoomMember.findUnique as jest.Mock).mockResolvedValue({ id: 'm-1' });
      (prisma.banterRoomMember.delete as jest.Mock).mockRejectedValue(p2025());

      const service = new BanterService(prisma, buildFeedMock());
      const result = await service.leaveRoom('user-1', 'room-1');
      expect(result).toEqual({ roomId: 'room-1', joined: false, memberCount: 0 });
    });

    it('404s for an unknown room', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new BanterService(prisma, buildFeedMock());
      await expect(service.leaveRoom('user-1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('postToRoom', () => {
    it('404s for an unknown room before any membership check', async () => {
      const prisma = buildPrismaMock();
      const feed = buildFeedMock();
      (prisma.banterRoom.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new BanterService(prisma, feed);

      await expect(
        service.postToRoom('user-1', 'nope', { contentText: 'hi' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.banterRoomMember.findUnique).not.toHaveBeenCalled();
      expect(feed.createPost).not.toHaveBeenCalled();
    });

    it('403s when the caller is not a member (existence settled first)', async () => {
      const prisma = buildPrismaMock();
      const feed = buildFeedMock();
      (prisma.banterRoom.findUnique as jest.Mock).mockResolvedValue({ id: 'room-1' });
      (prisma.banterRoomMember.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new BanterService(prisma, feed);

      await expect(
        service.postToRoom('user-1', 'room-1', { contentText: 'hi' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(feed.createPost).not.toHaveBeenCalled();
    });

    it('delegates to FeedService.createPost with banterRoomId set once the caller is a member', async () => {
      const prisma = buildPrismaMock();
      const feed = buildFeedMock();
      (prisma.banterRoom.findUnique as jest.Mock).mockResolvedValue({ id: 'room-1' });
      (prisma.banterRoomMember.findUnique as jest.Mock).mockResolvedValue({ id: 'm-1' });
      (feed.createPost as jest.Mock).mockResolvedValue({ id: 'post-1' });
      const service = new BanterService(prisma, feed);

      const result = await service.postToRoom('user-1', 'room-1', {
        contentText: 'up the arse',
        mediaUrls: ['https://cdn.example.com/x.jpg'],
      });

      expect(feed.createPost).toHaveBeenCalledWith('user-1', {
        contentText: 'up the arse',
        mediaUrls: ['https://cdn.example.com/x.jpg'],
        banterRoomId: 'room-1',
      });
      expect(result).toEqual({ id: 'post-1' });
    });
  });

  describe('getRoomFeed', () => {
    it('forwards to FeedService.getBanterRoomFeed', async () => {
      const prisma = buildPrismaMock();
      const feed = buildFeedMock();
      (feed.getBanterRoomFeed as jest.Mock).mockResolvedValue({ items: [], nextCursor: null });
      const service = new BanterService(prisma, feed);

      await service.getRoomFeed('room-1', 'user-1', { limit: 10 });
      expect(feed.getBanterRoomFeed).toHaveBeenCalledWith('room-1', 'user-1', { limit: 10 });
    });
  });

  // ---------- Topics (sprint-3/banter-room-topics, Decision Log #276) ----------

  describe('attachTopics', () => {
    it('404s for an unknown room, writing nothing', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new BanterService(prisma, buildFeedMock());

      await expect(
        service.attachTopics('user-1', 'nope', { names: ['Transfers'] }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.banterRoom.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(prisma.topic.upsert).not.toHaveBeenCalled();
    });

    it('403s when the caller is not the room creator (existence settled first)', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.findUnique as jest.Mock).mockResolvedValue({ id: 'room-1' });
      (prisma.banterRoom.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        createdBy: 'someone-else',
      });
      const service = new BanterService(prisma, buildFeedMock());

      await expect(
        service.attachTopics('user-1', 'room-1', { names: ['Transfers'] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.topic.upsert).not.toHaveBeenCalled();
    });

    it('upserts the Topic by its normalized name and upserts the join row, returning the room\'s full current topics', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.findUnique as jest.Mock).mockResolvedValue({ id: 'room-1' });
      (prisma.banterRoom.findUniqueOrThrow as jest.Mock).mockResolvedValue({ createdBy: 'user-1' });
      (prisma.topic.upsert as jest.Mock).mockResolvedValue(topic({ id: 'topic-9', name: 'Transfers' }));
      (prisma.banterRoomTopic.upsert as jest.Mock).mockResolvedValue({});
      (prisma.banterRoomTopic.findMany as jest.Mock).mockResolvedValue([
        { topic: topic({ id: 'topic-9', name: 'Transfers' }) },
      ]);

      const service = new BanterService(prisma, buildFeedMock());
      const result = await service.attachTopics('user-1', 'room-1', { names: ['Transfers'] });

      // upsert, never create/findUnique — see banter.service.ts's own
      // comment on why a create-then-catch-and-recover design on a
      // shared transaction is unsafe (a real bug this file's e2e suite
      // caught, fixed here).
      expect(prisma.topic.upsert).toHaveBeenCalledWith({
        where: { nameNormalized: 'transfers' },
        create: { name: 'Transfers', nameNormalized: 'transfers' },
        update: { name: 'Transfers' },
        select: expect.objectContaining({ id: true, name: true }),
      });
      expect(prisma.banterRoomTopic.upsert).toHaveBeenCalledWith({
        where: { banterRoomId_topicId: { banterRoomId: 'room-1', topicId: 'topic-9' } },
        create: { banterRoomId: 'room-1', topicId: 'topic-9' },
        update: {},
      });
      expect(result).toEqual({
        roomId: 'room-1',
        topics: [topic({ id: 'topic-9', name: 'Transfers' })],
      });
    });

    it('normalizes case/whitespace before upserting — different input, same normalized key', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.findUnique as jest.Mock).mockResolvedValue({ id: 'room-1' });
      (prisma.banterRoom.findUniqueOrThrow as jest.Mock).mockResolvedValue({ createdBy: 'user-1' });
      (prisma.topic.upsert as jest.Mock).mockResolvedValue(topic({ id: 'topic-1', name: 'Transfers' }));
      (prisma.banterRoomTopic.upsert as jest.Mock).mockResolvedValue({});
      (prisma.banterRoomTopic.findMany as jest.Mock).mockResolvedValue([]);

      const service = new BanterService(prisma, buildFeedMock());
      await service.attachTopics('user-1', 'room-1', { names: ['  TRANSFERS  '] });

      expect(prisma.topic.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { nameNormalized: 'transfers' } }),
      );
    });

    // A real bug, found by test/banter.e2e-spec.ts against real Postgres
    // (not by this mocked suite, which can't reproduce genuine Postgres
    // transaction-abort semantics) and fixed by retrying the WHOLE
    // per-name transaction, not by catching-and-recovering inside it.
    it('retries the whole per-name transaction on a genuine concurrent-write race (P2002), and succeeds', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.findUnique as jest.Mock).mockResolvedValue({ id: 'room-1' });
      (prisma.banterRoom.findUniqueOrThrow as jest.Mock).mockResolvedValue({ createdBy: 'user-1' });
      (prisma.topic.upsert as jest.Mock)
        .mockRejectedValueOnce(p2002())
        .mockResolvedValueOnce(topic({ id: 'topic-1', name: 'Transfers' }));
      (prisma.banterRoomTopic.upsert as jest.Mock).mockResolvedValue({});
      (prisma.banterRoomTopic.findMany as jest.Mock).mockResolvedValue([]);

      const service = new BanterService(prisma, buildFeedMock());
      await service.attachTopics('user-1', 'room-1', { names: ['Transfers'] });

      expect(prisma.topic.upsert).toHaveBeenCalledTimes(2);
    });

    it('gives up after 3 retries and rethrows a persistent P2002 (4 attempts total)', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.findUnique as jest.Mock).mockResolvedValue({ id: 'room-1' });
      (prisma.banterRoom.findUniqueOrThrow as jest.Mock).mockResolvedValue({ createdBy: 'user-1' });
      (prisma.topic.upsert as jest.Mock).mockRejectedValue(p2002());

      const service = new BanterService(prisma, buildFeedMock());
      await expect(
        service.attachTopics('user-1', 'room-1', { names: ['Transfers'] }),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect(prisma.topic.upsert).toHaveBeenCalledTimes(4); // initial + 3 retries
    });

    it('rethrows a non-P2002 error immediately, without retrying', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.findUnique as jest.Mock).mockResolvedValue({ id: 'room-1' });
      (prisma.banterRoom.findUniqueOrThrow as jest.Mock).mockResolvedValue({ createdBy: 'user-1' });
      (prisma.topic.upsert as jest.Mock).mockRejectedValue(new Error('boom'));

      const service = new BanterService(prisma, buildFeedMock());
      await expect(
        service.attachTopics('user-1', 'room-1', { names: ['Transfers'] }),
      ).rejects.toThrow('boom');
      expect(prisma.topic.upsert).toHaveBeenCalledTimes(1);
    });

    it('processes multiple names in one call, upserting each independently', async () => {
      const prisma = buildPrismaMock();
      (prisma.banterRoom.findUnique as jest.Mock).mockResolvedValue({ id: 'room-1' });
      (prisma.banterRoom.findUniqueOrThrow as jest.Mock).mockResolvedValue({ createdBy: 'user-1' });
      (prisma.topic.upsert as jest.Mock)
        .mockResolvedValueOnce(topic({ id: 'topic-1', name: 'Transfers' }))
        .mockResolvedValueOnce(topic({ id: 'topic-2', name: 'Deadline Day' }));
      (prisma.banterRoomTopic.upsert as jest.Mock).mockResolvedValue({});
      (prisma.banterRoomTopic.findMany as jest.Mock).mockResolvedValue([]);

      const service = new BanterService(prisma, buildFeedMock());
      await service.attachTopics('user-1', 'room-1', { names: ['Transfers', 'Deadline Day'] });

      expect(prisma.banterRoomTopic.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.banterRoomTopic.upsert).toHaveBeenNthCalledWith(1, {
        where: { banterRoomId_topicId: { banterRoomId: 'room-1', topicId: 'topic-1' } },
        create: { banterRoomId: 'room-1', topicId: 'topic-1' },
        update: {},
      });
      expect(prisma.banterRoomTopic.upsert).toHaveBeenNthCalledWith(2, {
        where: { banterRoomId_topicId: { banterRoomId: 'room-1', topicId: 'topic-2' } },
        create: { banterRoomId: 'room-1', topicId: 'topic-2' },
        update: {},
      });
    });
  });

  describe('listTopics', () => {
    it('orders alphabetically by name asc, id asc', async () => {
      const prisma = buildPrismaMock();
      (prisma.topic.findMany as jest.Mock).mockResolvedValueOnce([
        topic({ id: 'topic-1', name: 'Alpha' }),
        topic({ id: 'topic-2', name: 'Beta' }),
      ]);

      const service = new BanterService(prisma, buildFeedMock());
      const result = await service.listTopics({});

      const callArgs = (prisma.topic.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.orderBy).toEqual([{ name: 'asc' }, { id: 'asc' }]);
      expect(result.items).toEqual([
        topic({ id: 'topic-1', name: 'Alpha' }),
        topic({ id: 'topic-2', name: 'Beta' }),
      ]);
      expect(result.nextCursor).toBeNull();
    });

    it('applies a (name,id) cursor filter and builds a nextCursor from the last kept row', async () => {
      const prisma = buildPrismaMock();
      const cursor = encodeBanterRoomCursor({ name: 'Alpha', id: 'topic-1' });
      (prisma.topic.findMany as jest.Mock).mockResolvedValueOnce([
        topic({ id: 'topic-2', name: 'Beta' }),
        topic({ id: 'topic-3', name: 'Gamma' }), // lookahead
      ]);

      const service = new BanterService(prisma, buildFeedMock());
      const result = await service.listTopics({ cursor, limit: 1 });

      const where = (prisma.topic.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where).toEqual({
        AND: [{ OR: [{ name: { gt: 'Alpha' } }, { name: 'Alpha', id: { gt: 'topic-1' } }] }],
      });
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBe(encodeBanterRoomCursor({ name: 'Beta', id: 'topic-2' }));
    });

    it('rejects a malformed cursor with a 400', async () => {
      const prisma = buildPrismaMock();
      const service = new BanterService(prisma, buildFeedMock());
      await expect(service.listTopics({ cursor: 'not-base64-json' })).rejects.toThrow();
    });
  });
});
