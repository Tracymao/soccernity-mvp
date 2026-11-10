import { NotFoundException } from '@nestjs/common';
import { Clock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { FeedService, visibleToViewer } from './feed.service';

// B-289 (Decision Log #483): reads of a post or a comment a moderator removed. The SQL (and the counts) are proved
// against Postgres in test/content-removal.e2e-spec.ts; these pin the response shapes and the 404 sameness.

const NOW = new Date('2026-11-10T09:00:00.000Z');
const clock: Clock = { now: () => NOW };

function buildPrisma() {
  return {
    post: { findFirst: jest.fn(), findUnique: jest.fn() },
    comment: { findMany: jest.fn().mockResolvedValue([]) },
    like: { findUnique: jest.fn() },
    savedPost: { findUnique: jest.fn() },
    follow: { findUnique: jest.fn() },
  } as unknown as PrismaService;
}

describe('FeedService: content removed by moderation (B-289)', () => {
  it('visibleToViewer excludes a removed post for EVERYONE, the author included', () => {
    const where = visibleToViewer('author-1', NOW);
    expect(where.AND).toContainEqual({ removedByModerationAt: null });
  });

  describe('getPostById', () => {
    it('answers the AUTHOR of a removed post with { id, removedByModeration: true } and nothing else', async () => {
      const prisma = buildPrisma();
      // first lookup (the normal visible read) finds nothing; second (the author stub lookup) finds the removed row
      (prisma.post.findFirst as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'post-1' });
      const result = await new FeedService(prisma, clock).getPostById('post-1', 'author-1');
      expect(result).toEqual({ id: 'post-1', removedByModeration: true });
      expect(Object.keys(result)).toEqual(['id', 'removedByModeration']);
      expect((prisma.post.findFirst as jest.Mock).mock.calls[1][0]).toEqual({
        where: { id: 'post-1', authorId: 'author-1', removedByModerationAt: { not: null } },
        select: { id: true },
      });
    });

    it('answers anyone else exactly like a post that does not exist (the same 404)', async () => {
      const removedForOthers = buildPrisma();
      (removedForOthers.post.findFirst as jest.Mock).mockResolvedValue(null);
      const missing = buildPrisma();
      (missing.post.findFirst as jest.Mock).mockResolvedValue(null);

      const a = await new FeedService(removedForOthers, clock).getPostById('post-1', 'viewer-9').catch((e) => e);
      const b = await new FeedService(missing, clock).getPostById('does-not-exist', 'viewer-9').catch((e) => e);
      expect(a).toBeInstanceOf(NotFoundException);
      expect(b).toBeInstanceOf(NotFoundException);
      expect(a.getResponse()).toEqual(b.getResponse());
      expect(a.getStatus()).toBe(b.getStatus());
    });
  });

  describe('getComments', () => {
    it('keeps a removed comment in the thread as { id, createdAt, removedByModeration: true } with no text and no author', async () => {
      const prisma = buildPrisma();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1', authorId: 'author-1' });
      (prisma.comment.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'c-1',
          postId: 'post-1',
          authorId: 'someone',
          contentText: 'abusive words',
          createdAt: new Date('2026-11-10T08:00:00Z'),
          hidden: false,
          sequence: 1,
          removedByModerationAt: new Date('2026-11-10T08:30:00Z'),
          author: { id: 'someone', username: 'x', displayName: 'Real Name' },
        },
      ]);
      const page = await new FeedService(prisma, clock).getComments('post-1', {}, 'viewer-9');
      expect(page.items).toEqual([{ id: 'c-1', createdAt: new Date('2026-11-10T08:00:00Z'), removedByModeration: true }]);
      const json = JSON.stringify(page);
      expect(json).not.toContain('abusive words');
      expect(json).not.toContain('Real Name');
      expect(json).not.toContain('author');
      expect(json).not.toContain('sequence');
    });

    it('a normal comment is unchanged and never leaks removedByModerationAt', async () => {
      const prisma = buildPrisma();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1', authorId: 'author-1' });
      (prisma.comment.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'c-2',
          postId: 'post-1',
          authorId: 'someone',
          contentText: 'nice',
          createdAt: new Date('2026-11-10T08:00:00Z'),
          hidden: false,
          sequence: 2,
          removedByModerationAt: null,
          author: { id: 'someone', username: 'sam', displayName: 'Sam' },
        },
      ]);
      const page = await new FeedService(prisma, clock).getComments('post-1', {}, 'viewer-9');
      expect(page.items[0]).toMatchObject({ id: 'c-2', contentText: 'nice' });
      expect(JSON.stringify(page)).not.toContain('removedByModeration');
    });
  });
});
