import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BlogService } from './blog.service';
import { encodeArticleCursor, encodeCategoryCursor } from './cursor.util';

// Mocked-Prisma unit tests, following admin-content.service.spec.ts /
// community-groups.service.spec.ts. No e2e spec accompanies this module
// — every method here is a plain findMany/findFirst against Article's
// already-existing categoryId/authorAdminId FKs, no raw SQL, no
// transaction, no novel Prisma relation or constraint (see
// test/README.md's own three e2e-add triggers, none of which apply
// here — the same conclusion admin-content/README.md and
// admin-dashboard/README.md each already reached for their own
// analogous plain-read modules).

function buildPrismaMock() {
  const prisma = {
    article: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
    category: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;

  return prisma;
}

function articleRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'article-1',
    title: 'A title',
    body: 'A '.repeat(150).trim(), // 300 chars, long enough to exercise real truncation
    publishedAt: new Date('2026-09-01T10:00:00.000Z'),
    category: { id: 'category-1', name: 'Premier League', slug: 'premier-league' },
    authorAdmin: { fullName: 'Jane Editor' },
    ...overrides,
  };
}

function categoryRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'category-1',
    name: 'Premier League',
    slug: 'premier-league',
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    ...overrides,
  };
}

describe('BlogService', () => {
  describe('listArticles', () => {
    it('always filters to status: published, publishedAt not null', async () => {
      const prisma = buildPrismaMock();
      const service = new BlogService(prisma);

      await service.listArticles({});

      const call = (prisma.article.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toEqual(
        expect.arrayContaining([{ status: 'published', publishedAt: { not: null } }]),
      );
      expect(call.orderBy).toEqual([{ publishedAt: 'desc' }, { id: 'desc' }]);
    });

    it('never selects authorAdminId or status directly — only authorAdmin.fullName', async () => {
      const prisma = buildPrismaMock();
      const service = new BlogService(prisma);

      await service.listArticles({});

      const call = (prisma.article.findMany as jest.Mock).mock.calls[0][0];
      expect(call.select.authorAdminId).toBeUndefined();
      expect(call.select.status).toBeUndefined();
      expect(call.select.authorAdmin).toEqual({ select: { fullName: true } });
    });

    it('filters by categoryId when supplied, ANDed with the published filter', async () => {
      const prisma = buildPrismaMock();
      const service = new BlogService(prisma);

      await service.listArticles({ categoryId: 'category-1' });

      const call = (prisma.article.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toEqual(expect.arrayContaining([{ categoryId: 'category-1' }]));
    });

    it('filters by categorySlug when supplied', async () => {
      const prisma = buildPrismaMock();
      const service = new BlogService(prisma);

      await service.listArticles({ categorySlug: 'premier-league' });

      const call = (prisma.article.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toEqual(
        expect.arrayContaining([{ category: { slug: 'premier-league' } }]),
      );
    });

    it('combines categoryId and categorySlug when both are supplied', async () => {
      const prisma = buildPrismaMock();
      const service = new BlogService(prisma);

      await service.listArticles({ categoryId: 'category-1', categorySlug: 'premier-league' });

      const call = (prisma.article.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toEqual(
        expect.arrayContaining([{ categoryId: 'category-1' }, { category: { slug: 'premier-league' } }]),
      );
    });

    it('applies the cursor as an additional AND condition on publishedAt/id', async () => {
      const prisma = buildPrismaMock();
      const service = new BlogService(prisma);
      const cursor = encodeArticleCursor({ publishedAt: new Date('2026-09-01T00:00:00.000Z'), id: 'article-0' });

      await service.listArticles({ cursor, limit: 5 });

      const call = (prisma.article.findMany as jest.Mock).mock.calls[0][0];
      expect(call.take).toBe(6);
      expect(call.where.AND).toEqual(
        expect.arrayContaining([
          {
            OR: [
              { publishedAt: { lt: new Date('2026-09-01T00:00:00.000Z') } },
              { publishedAt: new Date('2026-09-01T00:00:00.000Z'), id: { lt: 'article-0' } },
            ],
          },
        ]),
      );
    });

    it('strips body and derives a truncated excerpt in the response, and returns nextCursor only when a further page exists', async () => {
      const prisma = buildPrismaMock();
      const rows = Array.from({ length: 3 }, (_, i) =>
        articleRow({ id: `article-${i}`, publishedAt: new Date(2026, 8, 1 + i) }),
      );
      (prisma.article.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new BlogService(prisma);

      const page = await service.listArticles({ limit: 2 });

      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).not.toBeNull();
      const first = page.items[0] as unknown as { body?: unknown; excerpt: string };
      expect(first.body).toBeUndefined();
      expect(first.excerpt.length).toBeLessThan(rows[0].body.length);
      expect(first.excerpt.endsWith('…')).toBe(true);
    });

    it('returns the full body untruncated as the excerpt when it is already short', async () => {
      const prisma = buildPrismaMock();
      (prisma.article.findMany as jest.Mock).mockResolvedValue([articleRow({ body: 'Short body.' })]);
      const service = new BlogService(prisma);

      const page = await service.listArticles({});

      expect(page.items[0].excerpt).toBe('Short body.');
    });
  });

  describe('getArticleById', () => {
    it('queries with status: published, publishedAt not null, ANDed with the id', async () => {
      const prisma = buildPrismaMock();
      (prisma.article.findFirst as jest.Mock).mockResolvedValue(articleRow());
      const service = new BlogService(prisma);

      await service.getArticleById('article-1');

      const call = (prisma.article.findFirst as jest.Mock).mock.calls[0][0];
      expect(call.where).toEqual({ id: 'article-1', status: 'published', publishedAt: { not: null } });
    });

    it('404s for a non-existent id', async () => {
      const prisma = buildPrismaMock();
      (prisma.article.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new BlogService(prisma);

      await expect(service.getArticleById('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s for a real but unpublished (draft) article — same as a non-existent id', async () => {
      // A draft never matches the findFirst's own status: 'published'
      // filter, so Prisma itself returns null — this test documents that
      // a draft's real id is indistinguishable from a missing one from
      // the caller's side, matching this codebase's don't-leak-existence
      // convention.
      const prisma = buildPrismaMock();
      (prisma.article.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new BlogService(prisma);

      await expect(service.getArticleById('a-real-draft-id')).rejects.toBeInstanceOf(NotFoundException);
      const call = (prisma.article.findFirst as jest.Mock).mock.calls[0][0];
      expect(call.where.status).toBe('published');
    });

    it('returns the full body on a real published article', async () => {
      const prisma = buildPrismaMock();
      (prisma.article.findFirst as jest.Mock).mockResolvedValue(articleRow({ body: 'Full body here.' }));
      const service = new BlogService(prisma);

      const result = await service.getArticleById('article-1');
      expect(result.body).toBe('Full body here.');
      expect(result.author).toBe('Jane Editor');
    });
  });

  describe('listCategories', () => {
    it('always filters to status: active', async () => {
      const prisma = buildPrismaMock();
      const service = new BlogService(prisma);

      await service.listCategories({});

      const call = (prisma.category.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toEqual(expect.arrayContaining([{ status: 'active' }]));
      expect(call.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    });

    it('has no status query param path — a caller cannot ask for inactive categories', async () => {
      const prisma = buildPrismaMock();
      const service = new BlogService(prisma);

      // ListPublicCategoriesQueryDto has no `status` field at all; even
      // if a caller's raw query object carried one (bypassing the DTO),
      // the service itself never reads query.status.
      await service.listCategories({ cursor: undefined, limit: undefined } as never);

      const call = (prisma.category.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toEqual([{ status: 'active' }]);
    });

    it('strips createdAt from the response shape', async () => {
      const prisma = buildPrismaMock();
      (prisma.category.findMany as jest.Mock).mockResolvedValue([categoryRow()]);
      const service = new BlogService(prisma);

      const page = await service.listCategories({});

      expect(page.items[0]).toEqual({ id: 'category-1', name: 'Premier League', slug: 'premier-league' });
    });

    it('applies the cursor and returns nextCursor only when a further page exists', async () => {
      const prisma = buildPrismaMock();
      const cursor = encodeCategoryCursor({ createdAt: new Date('2026-09-01T00:00:00.000Z'), id: 'category-0' });
      const rows = Array.from({ length: 2 }, (_, i) =>
        categoryRow({ id: `category-${i}`, createdAt: new Date(2026, 8, 1 + i) }),
      );
      (prisma.category.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new BlogService(prisma);

      const page = await service.listCategories({ cursor, limit: 1 });

      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).not.toBeNull();
    });
  });
});
