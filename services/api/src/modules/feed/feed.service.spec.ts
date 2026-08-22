import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { encodeFeedCursor } from './cursor.util';
import { FEED_DEFAULT_PAGE_SIZE, FEED_MAX_PAGE_SIZE } from './dto/feed-query.dto';
import { FeedService } from './feed.service';

function buildPrismaMock() {
  const prisma = {
    post: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    like: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    comment: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    savedPost: {
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    // Added for notification wiring (sprint-2/follow-and-notifications):
    // likePost/addComment now call tx.notification.create(...) inside
    // their existing transactional callbacks. Every test in this file
    // that exercises either method runs through this same mock, whether
    // or not it cares about notifications — so this must exist
    // unconditionally, not just in the tests added for this PR.
    notification: {
      create: jest.fn(),
    },
  } as unknown as PrismaService;

  // FeedService uses interactive transactions ($transaction(async (tx)
  // => ...)), not the array form — see likePost()'s own comment for why.
  // The mock simply invokes the callback with the same top-level mock
  // object standing in for `tx` (this module's tests don't need a
  // distinct transaction-scoped client), so normal await/throw control
  // flow inside the callback behaves exactly as it would against a real
  // interactive transaction: a rejection from an earlier statement
  // prevents any later statement in the same callback from ever running.
  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );

  return prisma;
}

const AUTHOR = { id: 'author-1', displayName: 'Author One' };

function buildPostRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'post-1',
    authorId: 'author-1',
    author: AUTHOR,
    contentText: 'Great match today',
    mediaUrls: [],
    clubPageId: null,
    banterRoomId: null,
    likeCount: 0,
    commentCount: 0,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('FeedService', () => {
  describe('createPost', () => {
    it('creates a post scoped to the given authorId, never trusting a body-supplied one', async () => {
      const prisma = buildPrismaMock();
      const row = buildPostRow();
      (prisma.post.create as jest.Mock).mockResolvedValue(row);

      const service = new FeedService(prisma);
      const result = await service.createPost('author-1', { contentText: 'Great match today' });

      expect(prisma.post.create).toHaveBeenCalledWith({
        data: {
          authorId: 'author-1',
          contentText: 'Great match today',
          mediaUrls: [],
          clubPageId: undefined,
          banterRoomId: undefined,
        },
        select: expect.objectContaining({ contentText: true, author: expect.anything() }),
      });
      expect(result).toEqual(row);
    });

    it('leaves likeCount and commentCount untouched (schema default 0) — this slice never creates a Like or Comment', async () => {
      const prisma = buildPrismaMock();
      const row = buildPostRow({ likeCount: 0, commentCount: 0 });
      (prisma.post.create as jest.Mock).mockResolvedValue(row);

      const service = new FeedService(prisma);
      const result = await service.createPost('author-1', { contentText: 'Hello' });

      const callArgs = (prisma.post.create as jest.Mock).mock.calls[0][0];
      expect(callArgs.data).not.toHaveProperty('likeCount');
      expect(callArgs.data).not.toHaveProperty('commentCount');
      expect(result.likeCount).toBe(0);
      expect(result.commentCount).toBe(0);
    });

    it('rejects a post with both clubPageId and banterRoomId set, without calling Prisma', async () => {
      const prisma = buildPrismaMock();
      const service = new FeedService(prisma);

      await expect(
        service.createPost('author-1', {
          contentText: 'Cross-posted',
          clubPageId: 'club-1',
          banterRoomId: 'room-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.post.create).not.toHaveBeenCalled();
    });

    it('allows a post with only clubPageId set', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.create as jest.Mock).mockResolvedValue(buildPostRow({ clubPageId: 'club-1' }));
      const service = new FeedService(prisma);

      await expect(
        service.createPost('author-1', { contentText: 'Club post', clubPageId: 'club-1' }),
      ).resolves.toMatchObject({ clubPageId: 'club-1' });
    });

    it('maps a foreign-key violation (invalid clubPageId/banterRoomId) to a 400, not a 500', async () => {
      const prisma = buildPrismaMock();
      const fkError = new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
        code: 'P2003',
        clientVersion: '5.0.0',
      });
      (prisma.post.create as jest.Mock).mockRejectedValue(fkError);
      const service = new FeedService(prisma);

      await expect(
        service.createPost('author-1', { contentText: 'Bad club', clubPageId: 'does-not-exist' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rethrows an unrelated Prisma error rather than swallowing it as a 400', async () => {
      const prisma = buildPrismaMock();
      const otherError = new Prisma.PrismaClientKnownRequestError('Something else', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      (prisma.post.create as jest.Mock).mockRejectedValue(otherError);
      const service = new FeedService(prisma);

      await expect(service.createPost('author-1', { contentText: 'x' })).rejects.toBe(otherError);
    });

    it("never selects the author's passwordHash", async () => {
      const prisma = buildPrismaMock();
      (prisma.post.create as jest.Mock).mockResolvedValue(buildPostRow());
      const service = new FeedService(prisma);

      await service.createPost('author-1', { contentText: 'x' });

      const callArgs = (prisma.post.create as jest.Mock).mock.calls[0][0];
      expect(callArgs.select.author.select).not.toHaveProperty('passwordHash');
      expect(callArgs.select.author.select).not.toHaveProperty('isMinor');
    });
  });

  describe('getFeed', () => {
    it('scopes to the caller\'s own posts plus posts by users they follow', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma);

      await service.getFeed('user-1', {});

      const callArgs = (prisma.post.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where).toEqual({
        OR: [
          { authorId: 'user-1' },
          { author: { followedBy: { some: { followerId: 'user-1' } } } },
        ],
      });
    });

    it('orders most-recent-first, keyed on (createdAt, id)', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma);

      await service.getFeed('user-1', {});

      const callArgs = (prisma.post.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    });

    it('defaults to a page size of FEED_DEFAULT_PAGE_SIZE, requesting one extra row', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma);

      await service.getFeed('user-1', {});

      const callArgs = (prisma.post.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.take).toBe(FEED_DEFAULT_PAGE_SIZE + 1);
    });

    it('clamps a limit above FEED_MAX_PAGE_SIZE even if the DTO boundary is bypassed', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma);

      await service.getFeed('user-1', { limit: 9999 });

      const callArgs = (prisma.post.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.take).toBe(FEED_MAX_PAGE_SIZE + 1);
    });

    it('returns nextCursor: null and all rows when fewer rows than the limit exist', async () => {
      const prisma = buildPrismaMock();
      const rows = [buildPostRow({ id: 'post-1' }), buildPostRow({ id: 'post-2' })];
      (prisma.post.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new FeedService(prisma);

      const page = await service.getFeed('user-1', { limit: 10 });

      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).toBeNull();
    });

    it('returns a nextCursor and trims the extra lookahead row when more rows exist than the limit', async () => {
      const prisma = buildPrismaMock();
      const rows = [
        buildPostRow({ id: 'post-3', createdAt: new Date('2026-08-03T00:00:00.000Z') }),
        buildPostRow({ id: 'post-2', createdAt: new Date('2026-08-02T00:00:00.000Z') }),
        buildPostRow({ id: 'post-1', createdAt: new Date('2026-08-01T00:00:00.000Z') }), // lookahead row
      ];
      (prisma.post.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new FeedService(prisma);

      const page = await service.getFeed('user-1', { limit: 2 });

      expect(page.items).toHaveLength(2);
      expect(page.items.map((p) => p.id)).toEqual(['post-3', 'post-2']);
      expect(page.nextCursor).toBe(
        encodeFeedCursor({ createdAt: new Date('2026-08-02T00:00:00.000Z'), id: 'post-2' }),
      );
    });

    it('applies a cursor filter (createdAt < cursor OR createdAt = cursor AND id < cursor.id) when a cursor is given', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma);
      const cursor = encodeFeedCursor({ createdAt: new Date('2026-08-02T00:00:00.000Z'), id: 'post-2' });

      await service.getFeed('user-1', { cursor });

      const callArgs = (prisma.post.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where.AND).toHaveLength(2);
      expect(callArgs.where.AND[1]).toEqual({
        OR: [
          { createdAt: { lt: new Date('2026-08-02T00:00:00.000Z') } },
          { createdAt: new Date('2026-08-02T00:00:00.000Z'), id: { lt: 'post-2' } },
        ],
      });
    });

    it('rejects a malformed cursor with a 400 rather than passing garbage to Prisma', async () => {
      const prisma = buildPrismaMock();
      const service = new FeedService(prisma);

      await expect(service.getFeed('user-1', { cursor: 'not-valid-base64-json' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.post.findMany).not.toHaveBeenCalled();
    });

    it('never selects the author\'s passwordHash or isMinor in the list query', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma);

      await service.getFeed('user-1', {});

      const callArgs = (prisma.post.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.select.author.select).not.toHaveProperty('passwordHash');
      expect(callArgs.select.author.select).not.toHaveProperty('isMinor');
    });

    it('does not select comments or likes relations on the list payload (Section 5.5 leanness)', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma);

      await service.getFeed('user-1', {});

      const callArgs = (prisma.post.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.select).not.toHaveProperty('comments');
      expect(callArgs.select).not.toHaveProperty('likes');
      expect(callArgs.select).not.toHaveProperty('savedBy');
    });
  });

  describe('getPostById', () => {
    it('returns the post when it exists', async () => {
      const prisma = buildPrismaMock();
      const row = buildPostRow();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(row);
      const service = new FeedService(prisma);

      await expect(service.getPostById('post-1')).resolves.toEqual(row);
    });

    it('throws NotFoundException, not a silent null, for a non-existent id', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new FeedService(prisma);

      await expect(service.getPostById('does-not-exist')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('likePost / unlikePost', () => {
    function mockPostExists(prisma: PrismaService, exists = true) {
      (prisma.post.findUnique as jest.Mock).mockImplementation((args: { select?: unknown }) => {
        if (!exists) return Promise.resolve(null);
        if (args?.select && (args.select as Record<string, unknown>).likeCount) {
          return Promise.resolve({ likeCount: 1 });
        }
        return Promise.resolve({ id: 'post-1' });
      });
    }

    it('throws NotFoundException when postId does not reference a real post (like)', async () => {
      const prisma = buildPrismaMock();
      mockPostExists(prisma, false);
      const service = new FeedService(prisma);

      await expect(service.likePost('user-1', 'missing-post')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.like.create).not.toHaveBeenCalled();
    });

    it('creates a Like row and increments likeCount transactionally', async () => {
      const prisma = buildPrismaMock();
      mockPostExists(prisma);
      (prisma.like.create as jest.Mock).mockResolvedValue({ id: 'like-1' });
      (prisma.post.update as jest.Mock).mockResolvedValue({});
      (prisma.post.findUnique as jest.Mock).mockImplementation((args: { select?: unknown }) => {
        if ((args.select as Record<string, unknown>)?.likeCount) return Promise.resolve({ likeCount: 1 });
        return Promise.resolve({ id: 'post-1' });
      });
      const service = new FeedService(prisma);

      const result = await service.likePost('user-1', 'post-1');

      expect(prisma.like.create).toHaveBeenCalledWith({ data: { userId: 'user-1', postId: 'post-1' } });
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { likeCount: { increment: 1 } },
      });
      expect(result).toEqual({ postId: 'post-1', liked: true, likeCount: 1 });
    });

    it('treats a duplicate like (P2002) as idempotent success without double-incrementing', async () => {
      const prisma = buildPrismaMock();
      const dupError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      (prisma.post.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'post-1' }) // assertPostExists
        .mockResolvedValueOnce({ likeCount: 1 }); // currentLikeCount, unchanged by this call
      (prisma.like.create as jest.Mock).mockRejectedValue(dupError);
      const service = new FeedService(prisma);

      const result = await service.likePost('user-1', 'post-1');

      expect(prisma.post.update).not.toHaveBeenCalled();
      expect(result).toEqual({ postId: 'post-1', liked: true, likeCount: 1 });
    });

    it('rethrows an unrelated Prisma error from likePost rather than swallowing it', async () => {
      const prisma = buildPrismaMock();
      const otherError = new Prisma.PrismaClientKnownRequestError('Something else', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      (prisma.like.create as jest.Mock).mockRejectedValue(otherError);
      const service = new FeedService(prisma);

      await expect(service.likePost('user-1', 'post-1')).rejects.toBe(otherError);
    });

    it('throws NotFoundException when postId does not reference a real post (unlike)', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new FeedService(prisma);

      await expect(service.unlikePost('user-1', 'missing-post')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.like.delete).not.toHaveBeenCalled();
    });

    it('deletes the Like row and decrements likeCount when one exists', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'post-1' }) // assertPostExists
        .mockResolvedValueOnce({ likeCount: 0 }); // currentLikeCount after decrement
      (prisma.like.findUnique as jest.Mock).mockResolvedValue({ id: 'like-1' });
      (prisma.like.delete as jest.Mock).mockResolvedValue({ id: 'like-1' });
      (prisma.post.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      const service = new FeedService(prisma);

      const result = await service.unlikePost('user-1', 'post-1');

      expect(prisma.like.delete).toHaveBeenCalledWith({
        where: { userId_postId: { userId: 'user-1', postId: 'post-1' } },
      });
      expect(prisma.post.updateMany).toHaveBeenCalledWith({
        where: { id: 'post-1', likeCount: { gt: 0 } },
        data: { likeCount: { decrement: 1 } },
      });
      expect(result).toEqual({ postId: 'post-1', liked: false, likeCount: 0 });
    });

    it('is idempotent (no-op, no error) when unliking a post that was never liked', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'post-1' }) // assertPostExists
        .mockResolvedValueOnce({ likeCount: 0 }); // currentLikeCount
      (prisma.like.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new FeedService(prisma);

      const result = await service.unlikePost('user-1', 'post-1');

      expect(prisma.like.delete).not.toHaveBeenCalled();
      expect(prisma.post.updateMany).not.toHaveBeenCalled();
      expect(result).toEqual({ postId: 'post-1', liked: false, likeCount: 0 });
    });

    it('treats a concurrent-delete race (P2025) as idempotent success rather than a 500', async () => {
      const prisma = buildPrismaMock();
      const raceError = new Prisma.PrismaClientKnownRequestError('Record to delete does not exist', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      (prisma.post.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'post-1' }) // assertPostExists
        .mockResolvedValueOnce({ likeCount: 0 }); // currentLikeCount
      (prisma.like.findUnique as jest.Mock).mockResolvedValue({ id: 'like-1' });
      (prisma.like.delete as jest.Mock).mockRejectedValue(raceError);
      const service = new FeedService(prisma);

      const result = await service.unlikePost('user-1', 'post-1');

      expect(result).toEqual({ postId: 'post-1', liked: false, likeCount: 0 });
    });

    it('nets to 0 across like, like again, unlike, unlike again (full integer-correctness sequence, not just 200s)', async () => {
      const prisma = buildPrismaMock();
      let likeCount = 0;
      let likeRow: { id: string } | null = null;

      (prisma.post.findUnique as jest.Mock).mockImplementation((args: { select?: unknown }) => {
        const select = args.select as Record<string, unknown> | undefined;
        if (select?.likeCount) return Promise.resolve({ likeCount });
        return Promise.resolve({ id: 'post-1' });
      });
      (prisma.like.create as jest.Mock).mockImplementation(() => {
        if (likeRow) {
          return Promise.reject(
            new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
              code: 'P2002',
              clientVersion: '5.0.0',
            }),
          );
        }
        likeRow = { id: 'like-1' };
        return Promise.resolve(likeRow);
      });
      (prisma.post.update as jest.Mock).mockImplementation(() => {
        likeCount += 1;
        return Promise.resolve({});
      });
      (prisma.like.findUnique as jest.Mock).mockImplementation(() => Promise.resolve(likeRow));
      (prisma.like.delete as jest.Mock).mockImplementation(() => {
        likeRow = null;
        return Promise.resolve({});
      });
      (prisma.post.updateMany as jest.Mock).mockImplementation(() => {
        if (likeCount > 0) likeCount -= 1;
        return Promise.resolve({ count: 1 });
      });

      const service = new FeedService(prisma);

      await service.likePost('user-1', 'post-1'); // 0 -> 1
      const second = await service.likePost('user-1', 'post-1'); // already liked -> stays 1
      const third = await service.unlikePost('user-1', 'post-1'); // 1 -> 0
      const fourth = await service.unlikePost('user-1', 'post-1'); // already unliked -> stays 0

      expect(second.likeCount).toBe(1);
      expect(third.likeCount).toBe(0);
      expect(fourth.likeCount).toBe(0);
      expect(likeCount).toBe(0);
    });

    // Notification wiring, added by sprint-2/follow-and-notifications.
    // likePost/unlikePost pre-date this describe block; only likePost
    // gets Notification coverage here (unlikePost never creates one —
    // see feed/README.md's "removing an action isn't performing one").
    describe('notification wiring', () => {
      it('creates a Notification row for the POST AUTHOR (recipient), never the liker (actor)', async () => {
        const prisma = buildPrismaMock();
        (prisma.post.findUnique as jest.Mock).mockImplementation((args: { select?: unknown }) => {
          const select = args.select as Record<string, unknown> | undefined;
          if (select?.likeCount) return Promise.resolve({ likeCount: 1 });
          return Promise.resolve({ id: 'post-1', authorId: 'post-author-1' });
        });
        (prisma.like.create as jest.Mock).mockResolvedValue({ id: 'like-1' });
        (prisma.post.update as jest.Mock).mockResolvedValue({});
        const service = new FeedService(prisma);

        await service.likePost('liker-1', 'post-1');

        expect(prisma.notification.create).toHaveBeenCalledWith({
          data: { userId: 'post-author-1', type: 'like', payloadRefId: 'post-1' },
        });
        // Explicit recipient-identity assertion, not just "a row exists"
        // — getting this backwards would silently notify the wrong
        // person.
        const callArgs = (prisma.notification.create as jest.Mock).mock.calls[0][0];
        expect(callArgs.data.userId).toBe('post-author-1');
        expect(callArgs.data.userId).not.toBe('liker-1');
      });

      it('creates no Notification row when a user likes their own post (no self-notification)', async () => {
        const prisma = buildPrismaMock();
        (prisma.post.findUnique as jest.Mock).mockImplementation((args: { select?: unknown }) => {
          const select = args.select as Record<string, unknown> | undefined;
          if (select?.likeCount) return Promise.resolve({ likeCount: 1 });
          return Promise.resolve({ id: 'post-1', authorId: 'self-1' });
        });
        (prisma.like.create as jest.Mock).mockResolvedValue({ id: 'like-1' });
        (prisma.post.update as jest.Mock).mockResolvedValue({});
        const service = new FeedService(prisma);

        await service.likePost('self-1', 'post-1');

        expect(prisma.notification.create).not.toHaveBeenCalled();
      });

      it('creates exactly one Notification row across a like followed by a duplicate (idempotent) like', async () => {
        const prisma = buildPrismaMock();
        let liked = false;
        (prisma.post.findUnique as jest.Mock).mockImplementation((args: { select?: unknown }) => {
          const select = args.select as Record<string, unknown> | undefined;
          if (select?.likeCount) return Promise.resolve({ likeCount: liked ? 1 : 0 });
          return Promise.resolve({ id: 'post-1', authorId: 'post-author-1' });
        });
        (prisma.like.create as jest.Mock).mockImplementation(() => {
          if (liked) {
            return Promise.reject(
              new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
                code: 'P2002',
                clientVersion: '5.0.0',
              }),
            );
          }
          liked = true;
          return Promise.resolve({ id: 'like-1' });
        });
        (prisma.post.update as jest.Mock).mockResolvedValue({});
        const service = new FeedService(prisma);

        await service.likePost('liker-1', 'post-1');
        await service.likePost('liker-1', 'post-1'); // duplicate — P2002, idempotent

        expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('addComment / getComments', () => {
    const AUTHOR2 = { id: 'author-1', displayName: 'Author One' };

    function buildCommentRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: 'comment-1',
        postId: 'post-1',
        authorId: 'author-1',
        author: AUTHOR2,
        contentText: 'Nice goal',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        ...overrides,
      };
    }

    it('throws NotFoundException when postId does not reference a real post', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new FeedService(prisma);

      await expect(service.addComment('missing-post', 'author-1', { contentText: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.comment.create).not.toHaveBeenCalled();
    });

    it('creates the Comment row and increments commentCount in the same transaction', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      const row = buildCommentRow();
      (prisma.comment.create as jest.Mock).mockResolvedValue(row);
      (prisma.post.update as jest.Mock).mockResolvedValue({});
      const service = new FeedService(prisma);

      const result = await service.addComment('post-1', 'author-1', { contentText: 'Nice goal' });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.comment.create).toHaveBeenCalledWith({
        data: { postId: 'post-1', authorId: 'author-1', contentText: 'Nice goal' },
        select: expect.objectContaining({ contentText: true, author: expect.anything() }),
      });
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { commentCount: { increment: 1 } },
      });
      expect(result).toEqual(row);
    });

    it("never selects the comment author's passwordHash or isMinor", async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      (prisma.comment.create as jest.Mock).mockResolvedValue(buildCommentRow());
      (prisma.post.update as jest.Mock).mockResolvedValue({});
      const service = new FeedService(prisma);

      await service.addComment('post-1', 'author-1', { contentText: 'x' });

      const callArgs = (prisma.comment.create as jest.Mock).mock.calls[0][0];
      expect(callArgs.select.author.select).not.toHaveProperty('passwordHash');
      expect(callArgs.select.author.select).not.toHaveProperty('isMinor');
    });

    it('throws NotFoundException from getComments when postId does not reference a real post', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new FeedService(prisma);

      await expect(service.getComments('missing-post', {})).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.comment.findMany).not.toHaveBeenCalled();
    });

    it('orders comments oldest-first (createdAt asc, id asc)', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      (prisma.comment.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma);

      await service.getComments('post-1', {});

      const callArgs = (prisma.comment.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
      expect(callArgs.where).toEqual({ postId: 'post-1' });
    });

    it('applies an ascending cursor filter (createdAt > cursor OR createdAt = cursor AND id > cursor.id)', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      (prisma.comment.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma);
      const cursor = encodeFeedCursor({ createdAt: new Date('2026-08-02T00:00:00.000Z'), id: 'comment-2' });

      await service.getComments('post-1', { cursor });

      const callArgs = (prisma.comment.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where).toEqual({
        postId: 'post-1',
        OR: [
          { createdAt: { gt: new Date('2026-08-02T00:00:00.000Z') } },
          { createdAt: new Date('2026-08-02T00:00:00.000Z'), id: { gt: 'comment-2' } },
        ],
      });
    });

    it('paginates with a nextCursor when more comments exist than the limit', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      const rows = [
        buildCommentRow({ id: 'comment-1', createdAt: new Date('2026-08-01T00:00:00.000Z') }),
        buildCommentRow({ id: 'comment-2', createdAt: new Date('2026-08-02T00:00:00.000Z') }),
        buildCommentRow({ id: 'comment-3', createdAt: new Date('2026-08-03T00:00:00.000Z') }), // lookahead row
      ];
      (prisma.comment.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new FeedService(prisma);

      const page = await service.getComments('post-1', { limit: 2 });

      expect(page.items.map((c) => c.id)).toEqual(['comment-1', 'comment-2']);
      expect(page.nextCursor).toBe(
        encodeFeedCursor({ createdAt: new Date('2026-08-02T00:00:00.000Z'), id: 'comment-2' }),
      );
    });

    // Notification wiring, added by sprint-2/follow-and-notifications.
    describe('notification wiring', () => {
      it('creates a Notification row for the POST AUTHOR (recipient), never the commenter (actor)', async () => {
        const prisma = buildPrismaMock();
        (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1', authorId: 'post-author-1' });
        (prisma.comment.create as jest.Mock).mockResolvedValue(buildCommentRow({ authorId: 'commenter-1' }));
        (prisma.post.update as jest.Mock).mockResolvedValue({});
        const service = new FeedService(prisma);

        await service.addComment('post-1', 'commenter-1', { contentText: 'Nice goal' });

        expect(prisma.notification.create).toHaveBeenCalledWith({
          data: { userId: 'post-author-1', type: 'comment', payloadRefId: 'post-1' },
        });
        const callArgs = (prisma.notification.create as jest.Mock).mock.calls[0][0];
        expect(callArgs.data.userId).toBe('post-author-1');
        expect(callArgs.data.userId).not.toBe('commenter-1');
      });

      it('creates no Notification row when a user comments on their own post (no self-notification)', async () => {
        const prisma = buildPrismaMock();
        (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1', authorId: 'self-1' });
        (prisma.comment.create as jest.Mock).mockResolvedValue(buildCommentRow({ authorId: 'self-1' }));
        (prisma.post.update as jest.Mock).mockResolvedValue({});
        const service = new FeedService(prisma);

        await service.addComment('post-1', 'self-1', { contentText: 'Nice goal' });

        expect(prisma.notification.create).not.toHaveBeenCalled();
      });
    });
  });

  describe('deleteComment', () => {
    function mockComment(overrides: Partial<{ id: string; postId: string; authorId: string; postAuthorId: string }> = {}) {
      const row = {
        id: overrides.id ?? 'comment-1',
        postId: overrides.postId ?? 'post-1',
        authorId: overrides.authorId ?? 'commenter-1',
        post: { authorId: overrides.postAuthorId ?? 'post-author-1' },
      };
      return row;
    }

    it('throws NotFoundException when commentId does not reference a real comment', async () => {
      const prisma = buildPrismaMock();
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new FeedService(prisma);

      await expect(service.deleteComment('post-1', 'missing-comment', 'commenter-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.comment.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException (not ForbiddenException) when the comment exists but belongs to a different post than the URL', async () => {
      const prisma = buildPrismaMock();
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(
        mockComment({ postId: 'a-different-post', authorId: 'commenter-1' }),
      );
      const service = new FeedService(prisma);

      await expect(
        service.deleteComment('post-1', 'comment-1', 'commenter-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.comment.delete).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the requester is neither the comment author nor the post author', async () => {
      const prisma = buildPrismaMock();
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(
        mockComment({ authorId: 'commenter-1', postAuthorId: 'post-author-1' }),
      );
      const service = new FeedService(prisma);

      await expect(
        service.deleteComment('post-1', 'comment-1', 'someone-else'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.comment.delete).not.toHaveBeenCalled();
    });

    it('allows the comment author to delete their own comment', async () => {
      const prisma = buildPrismaMock();
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(
        mockComment({ authorId: 'commenter-1', postAuthorId: 'post-author-1' }),
      );
      (prisma.comment.delete as jest.Mock).mockResolvedValue({ id: 'comment-1' });
      (prisma.post.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      const service = new FeedService(prisma);

      await service.deleteComment('post-1', 'comment-1', 'commenter-1');

      expect(prisma.comment.delete).toHaveBeenCalledWith({ where: { id: 'comment-1' } });
    });

    it('allows the POST AUTHOR to delete someone else\'s comment on their own post', async () => {
      const prisma = buildPrismaMock();
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(
        mockComment({ authorId: 'commenter-1', postAuthorId: 'post-author-1' }),
      );
      (prisma.comment.delete as jest.Mock).mockResolvedValue({ id: 'comment-1' });
      (prisma.post.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      const service = new FeedService(prisma);

      await service.deleteComment('post-1', 'comment-1', 'post-author-1');

      expect(prisma.comment.delete).toHaveBeenCalledWith({ where: { id: 'comment-1' } });
    });

    it('decrements commentCount transactionally, using the same floor-guarded updateMany pattern as unlikePost', async () => {
      const prisma = buildPrismaMock();
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(
        mockComment({ authorId: 'commenter-1', postAuthorId: 'post-author-1' }),
      );
      (prisma.comment.delete as jest.Mock).mockResolvedValue({ id: 'comment-1' });
      (prisma.post.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      const service = new FeedService(prisma);

      await service.deleteComment('post-1', 'comment-1', 'commenter-1');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.post.updateMany).toHaveBeenCalledWith({
        where: { id: 'post-1', commentCount: { gt: 0 } },
        data: { commentCount: { decrement: 1 } },
      });
    });

    it('is NOT idempotent: deleting the same comment a second time is a 404, not a 200 (unlike like/save/follow/join)', async () => {
      const prisma = buildPrismaMock();
      (prisma.comment.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockComment({ authorId: 'commenter-1', postAuthorId: 'post-author-1' }))
        .mockResolvedValueOnce(null); // gone after the first delete
      (prisma.comment.delete as jest.Mock).mockResolvedValue({ id: 'comment-1' });
      (prisma.post.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      const service = new FeedService(prisma);

      await service.deleteComment('post-1', 'comment-1', 'commenter-1');
      await expect(service.deleteComment('post-1', 'comment-1', 'commenter-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('savePost / unsavePost', () => {
    it('throws NotFoundException when postId does not reference a real post (save)', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new FeedService(prisma);

      await expect(service.savePost('user-1', 'missing-post')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.savedPost.create).not.toHaveBeenCalled();
    });

    it('creates a SavedPost row (no counter to touch — SavedPost has none)', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      (prisma.savedPost.create as jest.Mock).mockResolvedValue({ id: 'saved-1' });
      const service = new FeedService(prisma);

      const result = await service.savePost('user-1', 'post-1');

      expect(prisma.savedPost.create).toHaveBeenCalledWith({ data: { userId: 'user-1', postId: 'post-1' } });
      expect(result).toEqual({ postId: 'post-1', saved: true });
    });

    it('treats a duplicate save (P2002) as idempotent success', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      const dupError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      (prisma.savedPost.create as jest.Mock).mockRejectedValue(dupError);
      const service = new FeedService(prisma);

      await expect(service.savePost('user-1', 'post-1')).resolves.toEqual({ postId: 'post-1', saved: true });
    });

    it('throws NotFoundException when postId does not reference a real post (unsave)', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new FeedService(prisma);

      await expect(service.unsavePost('user-1', 'missing-post')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.savedPost.delete).not.toHaveBeenCalled();
    });

    it('is idempotent (no error) when unsaving a post that was never saved (P2025)', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      const notFoundError = new Prisma.PrismaClientKnownRequestError('Record to delete does not exist', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      (prisma.savedPost.delete as jest.Mock).mockRejectedValue(notFoundError);
      const service = new FeedService(prisma);

      await expect(service.unsavePost('user-1', 'post-1')).resolves.toEqual({ postId: 'post-1', saved: false });
    });

    it('deletes an existing SavedPost row on unsave', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      (prisma.savedPost.delete as jest.Mock).mockResolvedValue({ id: 'saved-1' });
      const service = new FeedService(prisma);

      const result = await service.unsavePost('user-1', 'post-1');

      expect(prisma.savedPost.delete).toHaveBeenCalledWith({
        where: { userId_postId: { userId: 'user-1', postId: 'post-1' } },
      });
      expect(result).toEqual({ postId: 'post-1', saved: false });
    });
  });

  describe('getSavedPosts', () => {
    function buildSavedRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        postId: 'post-1',
        savedAt: new Date('2026-08-01T00:00:00.000Z'),
        post: buildPostRow(),
        ...overrides,
      };
    }

    it('scopes the query to the given userId', async () => {
      const prisma = buildPrismaMock();
      (prisma.savedPost.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma);

      await service.getSavedPosts('user-1', {});

      const callArgs = (prisma.savedPost.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where).toEqual({ userId: 'user-1' });
      expect(callArgs.orderBy).toEqual([{ savedAt: 'desc' }, { postId: 'desc' }]);
    });

    it('paginates with a nextCursor when more saved posts exist than the limit', async () => {
      const prisma = buildPrismaMock();
      const rows = [
        buildSavedRow({ postId: 'post-3', savedAt: new Date('2026-08-03T00:00:00.000Z') }),
        buildSavedRow({ postId: 'post-2', savedAt: new Date('2026-08-02T00:00:00.000Z') }),
        buildSavedRow({ postId: 'post-1', savedAt: new Date('2026-08-01T00:00:00.000Z') }), // lookahead
      ];
      (prisma.savedPost.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new FeedService(prisma);

      const page = await service.getSavedPosts('user-1', { limit: 2 });

      expect(page.items.map((s) => s.postId)).toEqual(['post-3', 'post-2']);
      expect(page.nextCursor).toBe(
        encodeFeedCursor({ createdAt: new Date('2026-08-02T00:00:00.000Z'), id: 'post-2' }),
      );
    });

    it('applies a descending cursor filter keyed on savedAt/postId when a cursor is given', async () => {
      const prisma = buildPrismaMock();
      (prisma.savedPost.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma);
      const cursor = encodeFeedCursor({ createdAt: new Date('2026-08-02T00:00:00.000Z'), id: 'post-2' });

      await service.getSavedPosts('user-1', { cursor });

      const callArgs = (prisma.savedPost.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where).toEqual({
        userId: 'user-1',
        OR: [
          { savedAt: { lt: new Date('2026-08-02T00:00:00.000Z') } },
          { savedAt: new Date('2026-08-02T00:00:00.000Z'), postId: { lt: 'post-2' } },
        ],
      });
    });

    it('embeds the full post without leaking passwordHash/isMinor', async () => {
      const prisma = buildPrismaMock();
      (prisma.savedPost.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma);

      await service.getSavedPosts('user-1', {});

      const callArgs = (prisma.savedPost.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.select.post.select.author.select).not.toHaveProperty('passwordHash');
      expect(callArgs.select.post.select.author.select).not.toHaveProperty('isMinor');
    });
  });
});
