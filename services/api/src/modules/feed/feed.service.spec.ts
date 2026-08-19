import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { encodeFeedCursor } from './cursor.util';
import { FEED_DEFAULT_PAGE_SIZE, FEED_MAX_PAGE_SIZE } from './dto/feed-query.dto';
import { FeedService } from './feed.service';

function buildPrismaMock() {
  return {
    post: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  } as unknown as PrismaService;
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
});
