import { PrismaService } from '../../prisma/prisma.service';
import { FeedService } from './feed.service';

// B-061 (Decision Log #472 (d)): every read that returns a post's media carries `mediaSensitive`, taken
// from the AUTHOR's CURRENT toggle at read time. A post with no media is always false. The author's own
// view carries it too. Mocked Prisma; the real read-time behaviour (a change also applies to posts
// already published) is in test/dm-permission-media-sensitive.e2e-spec.ts.

const NOW = new Date('2026-11-16T12:00:00.000Z');
const CLOCK = { now: () => new Date(NOW) };

function author(mediaSensitive: boolean) {
  return { id: 'author-1', username: 'ada', displayName: 'Ada Author', mediaSensitive };
}

function postRow(over: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    sequence: 1,
    authorId: 'author-1',
    author: author(true),
    contentText: 'hello',
    mediaUrls: ['https://cdn.example/post-media/author-1/m1.jpg'],
    media: [{ id: 'm1', kind: 'image', publicUrl: 'https://cdn.example/post-media/author-1/m1.jpg' }],
    clubPageId: null,
    banterRoomId: null,
    likeCount: 0,
    commentCount: 0,
    viewCount: 0,
    commentPermission: 'everyone',
    createdAt: new Date('2026-11-16T10:00:00.000Z'),
    contestEntry: null,
    ...over,
  };
}

function build() {
  const prisma = {
    post: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    like: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    savedPost: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
    follow: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
    postMedia: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    pointsLedgerEntry: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    user: { findUnique: jest.fn().mockResolvedValue({ representedClubId: null }) },
    hashtag: { upsert: jest.fn(), updateMany: jest.fn() },
    postHashtag: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    contestEntry: { findUnique: jest.fn().mockResolvedValue(null) },
    block: { findFirst: jest.fn().mockResolvedValue(null) },
    notification: { create: jest.fn() },
  } as unknown as PrismaService;
  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma, service: new FeedService(prisma, CLOCK) };
}

describe('FeedService: mediaSensitive (B-061)', () => {
  it('selects the AUTHOR toggle on the shared post select (so every post read carries it)', async () => {
    const { prisma, service } = build();
    (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
    await service.getFeed('viewer-1', {});
    const select = (prisma.post.findMany as jest.Mock).mock.calls[0][0].select;
    expect(select.author.select).toMatchObject({ id: true, mediaSensitive: true });
  });

  describe('GET /posts/:id', () => {
    it('is true for a post with media when the author has the toggle on, for any viewer', async () => {
      const { prisma, service } = build();
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(postRow());
      const post = await service.getPostById('post-1', 'viewer-1');
      expect(post.mediaSensitive).toBe(true);
    });

    it('is also true for the AUTHOR viewing their own post', async () => {
      const { prisma, service } = build();
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(postRow());
      const post = await service.getPostById('post-1', 'author-1');
      expect(post.mediaSensitive).toBe(true);
    });

    it('is false for a post with media when the author has the toggle off', async () => {
      const { prisma, service } = build();
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(postRow({ author: author(false) }));
      expect((await service.getPostById('post-1', 'viewer-1')).mediaSensitive).toBe(false);
    });

    it('is false for a post with NO media even when the author has the toggle on', async () => {
      const { prisma, service } = build();
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(postRow({ mediaUrls: [], media: [] }));
      expect((await service.getPostById('post-1', 'viewer-1')).mediaSensitive).toBe(false);
    });

    it('still counts a post with only legacy mediaUrls (no PostMedia rows) as having media', async () => {
      const { prisma, service } = build();
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(postRow({ media: [] }));
      expect((await service.getPostById('post-1', 'viewer-1')).mediaSensitive).toBe(true);
    });

    it('never leaves the raw toggle on the author object', async () => {
      const { prisma, service } = build();
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(postRow());
      const post = await service.getPostById('post-1', 'viewer-1');
      expect(post.author).toEqual(expect.not.objectContaining({ mediaSensitive: expect.anything() }));
      expect(Object.keys(post.author).sort()).toEqual(['id', 'isFollowing', 'publicName']);
    });
  });

  describe('GET /posts/feed', () => {
    it('reads the toggle per author, per post: one author on, one off, one with no media', async () => {
      const { prisma, service } = build();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([
        postRow({ id: 'p1', sequence: 3 }),
        postRow({ id: 'p2', sequence: 2, authorId: 'author-2', author: { ...author(false), id: 'author-2' } }),
        postRow({ id: 'p3', sequence: 1, mediaUrls: [], media: [] }),
      ]);
      const page = await service.getFeed('viewer-1', {});
      expect(page.items.map((p) => [p.id, p.mediaSensitive])).toEqual([
        ['p1', true],
        ['p2', false],
        ['p3', false],
      ]);
    });
  });

  describe('GET /users/:id/saved-posts', () => {
    it('carries it on the embedded post, from the post author', async () => {
      const { prisma, service } = build();
      (prisma.savedPost.findMany as jest.Mock).mockResolvedValue([
        { id: 's1', sequence: 1, savedAt: new Date('2026-11-16T11:00:00Z'), post: postRow() },
      ]);
      const page = await service.getSavedPosts('viewer-1', {});
      expect(page.items[0].post.mediaSensitive).toBe(true);
    });
  });

  describe('POST /posts (the creation response)', () => {
    it('carries it too (the author has the toggle on and the new post has media)', async () => {
      const { prisma, service } = build();
      (prisma.post.create as jest.Mock).mockResolvedValue(postRow());
      (prisma.post.findUniqueOrThrow as jest.Mock).mockResolvedValue(postRow());
      const created = await service.createPost('author-1', { contentText: 'hello' });
      expect(typeof created.mediaSensitive).toBe('boolean');
    });
  });
});
