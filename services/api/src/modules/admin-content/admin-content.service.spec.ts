import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminContentService } from './admin-content.service';
import { encodeAdminContentCursor } from './cursor.util';

// Mocked-Prisma unit tests, following community-groups.service.spec.ts /
// moderation.service.spec.ts. The real Article/Category FKs, the
// slug @@unique constraint, and real keyset pagination against Postgres
// are proven in test/admin-content.e2e-spec.ts — this file covers the
// branching/guard logic a mock can prove.

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'x',
  });
}

function buildPrismaMock() {
  const prisma = {
    article: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    category: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
  } as unknown as PrismaService;

  return prisma;
}

function article(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'article-1',
    title: 'A title',
    body: 'A body',
    categoryId: 'category-1',
    authorAdminId: 'admin-1',
    status: 'draft',
    publishedAt: null,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    ...overrides,
  };
}

function category(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'category-1',
    name: 'Premier League',
    slug: 'premier-league',
    status: 'active',
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    ...overrides,
  };
}

describe('AdminContentService', () => {
  // ---------- Articles ----------

  describe('createArticle', () => {
    it('creates a draft article by default, authorAdminId = the caller', async () => {
      const prisma = buildPrismaMock();
      (prisma.category.findUnique as jest.Mock).mockResolvedValue({ id: 'category-1' });
      (prisma.article.create as jest.Mock).mockResolvedValue(article());

      const service = new AdminContentService(prisma);
      const result = await service.createArticle('admin-1', {
        title: 'A title',
        body: 'A body',
        categoryId: 'category-1',
      });

      expect(prisma.article.create).toHaveBeenCalledWith({
        data: {
          title: 'A title',
          body: 'A body',
          categoryId: 'category-1',
          authorAdminId: 'admin-1',
          status: 'draft',
          publishedAt: null,
        },
      });
      expect(result.id).toBe('article-1');
    });

    it('sets publishedAt when created directly as published', async () => {
      const prisma = buildPrismaMock();
      (prisma.category.findUnique as jest.Mock).mockResolvedValue({ id: 'category-1' });
      (prisma.article.create as jest.Mock).mockResolvedValue(article({ status: 'published' }));

      const service = new AdminContentService(prisma);
      await service.createArticle('admin-1', {
        title: 'A title',
        body: 'A body',
        categoryId: 'category-1',
        status: 'published',
      });

      const call = (prisma.article.create as jest.Mock).mock.calls[0][0];
      expect(call.data.status).toBe('published');
      expect(call.data.publishedAt).toBeInstanceOf(Date);
    });

    it('404s when the category does not exist', async () => {
      const prisma = buildPrismaMock();
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new AdminContentService(prisma);

      await expect(
        service.createArticle('admin-1', { title: 'A title', body: 'A body', categoryId: 'missing' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.article.create).not.toHaveBeenCalled();
    });
  });

  describe('listArticles', () => {
    it('filters by status and categoryId, ANDed with the cursor condition', async () => {
      const prisma = buildPrismaMock();
      (prisma.article.findMany as jest.Mock).mockResolvedValue([]);
      const service = new AdminContentService(prisma);

      const cursor = encodeAdminContentCursor({ createdAt: new Date('2026-09-01T00:00:00.000Z'), id: 'article-0' });
      await service.listArticles({ status: 'published', categoryId: 'category-1', cursor, limit: 5 });

      const call = (prisma.article.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toEqual(
        expect.arrayContaining([{ status: 'published' }, { categoryId: 'category-1' }]),
      );
      expect(call.take).toBe(6);
      expect(call.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    });

    it('returns nextCursor only when a further page exists', async () => {
      const prisma = buildPrismaMock();
      const rows = Array.from({ length: 3 }, (_, i) =>
        article({ id: `article-${i}`, createdAt: new Date(2026, 8, 1 + i) }),
      );
      (prisma.article.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new AdminContentService(prisma);

      const page = await service.listArticles({ limit: 2 });
      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).not.toBeNull();
    });
  });

  describe('updateArticle', () => {
    it('sets publishedAt the first time status moves to published', async () => {
      const prisma = buildPrismaMock();
      (prisma.article.findUnique as jest.Mock).mockResolvedValue({
        id: 'article-1',
        status: 'draft',
        publishedAt: null,
      });
      (prisma.article.update as jest.Mock).mockResolvedValue(article({ status: 'published' }));

      const service = new AdminContentService(prisma);
      await service.updateArticle('article-1', { status: 'published' });

      const call = (prisma.article.update as jest.Mock).mock.calls[0][0];
      expect(call.data.status).toBe('published');
      expect(call.data.publishedAt).toBeInstanceOf(Date);
    });

    it('does not touch publishedAt when re-publishing an already-published article', async () => {
      const prisma = buildPrismaMock();
      const existingPublishedAt = new Date('2026-08-01T00:00:00.000Z');
      (prisma.article.findUnique as jest.Mock).mockResolvedValue({
        id: 'article-1',
        status: 'published',
        publishedAt: existingPublishedAt,
      });
      (prisma.article.update as jest.Mock).mockResolvedValue(article());

      const service = new AdminContentService(prisma);
      await service.updateArticle('article-1', { status: 'published' });

      const call = (prisma.article.update as jest.Mock).mock.calls[0][0];
      expect(call.data.publishedAt).toBeUndefined();
    });

    it('does not clear publishedAt when reverting to draft', async () => {
      const prisma = buildPrismaMock();
      (prisma.article.findUnique as jest.Mock).mockResolvedValue({
        id: 'article-1',
        status: 'published',
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
      });
      (prisma.article.update as jest.Mock).mockResolvedValue(article({ status: 'draft' }));

      const service = new AdminContentService(prisma);
      await service.updateArticle('article-1', { status: 'draft' });

      const call = (prisma.article.update as jest.Mock).mock.calls[0][0];
      expect(call.data.status).toBe('draft');
      expect(call.data.publishedAt).toBeUndefined();
    });

    it('404s when the article does not exist', async () => {
      const prisma = buildPrismaMock();
      (prisma.article.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new AdminContentService(prisma);

      await expect(service.updateArticle('missing', { title: 'x' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.article.update).not.toHaveBeenCalled();
    });

    it('404s when moving the article to a non-existent category', async () => {
      const prisma = buildPrismaMock();
      (prisma.article.findUnique as jest.Mock).mockResolvedValue({
        id: 'article-1',
        status: 'draft',
        publishedAt: null,
      });
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new AdminContentService(prisma);

      await expect(service.updateArticle('article-1', { categoryId: 'missing' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.article.update).not.toHaveBeenCalled();
    });
  });

  // ---------- Categories ----------

  describe('createCategory', () => {
    it('derives the slug server-side from the name', async () => {
      const prisma = buildPrismaMock();
      (prisma.category.create as jest.Mock).mockResolvedValue(category());
      const service = new AdminContentService(prisma);

      await service.createCategory({ name: 'Premier League' });

      expect(prisma.category.create).toHaveBeenCalledWith({
        data: { name: 'Premier League', slug: 'premier-league' },
      });
    });

    it('409s on a duplicate slug, not a raw P2002', async () => {
      const prisma = buildPrismaMock();
      (prisma.category.create as jest.Mock).mockRejectedValue(p2002());
      const service = new AdminContentService(prisma);

      await expect(service.createCategory({ name: 'Premier League' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows a non-P2002 error', async () => {
      const prisma = buildPrismaMock();
      const boom = new Error('boom');
      (prisma.category.create as jest.Mock).mockRejectedValue(boom);
      const service = new AdminContentService(prisma);

      await expect(service.createCategory({ name: 'Premier League' })).rejects.toBe(boom);
    });
  });

  describe('listCategories', () => {
    it('filters by status, ANDed with the cursor condition, and exposes articleCount', async () => {
      const prisma = buildPrismaMock();
      (prisma.category.findMany as jest.Mock).mockResolvedValue([
        { ...category(), _count: { articles: 25 } },
      ]);
      const service = new AdminContentService(prisma);

      const cursor = encodeAdminContentCursor({ createdAt: new Date('2026-09-01T00:00:00.000Z'), id: 'category-0' });
      const page = await service.listCategories({ status: 'active', cursor, limit: 5 });

      const call = (prisma.category.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toEqual(expect.arrayContaining([{ status: 'active' }]));
      expect(page.items[0].articleCount).toBe(25);
      expect((page.items[0] as unknown as { _count?: unknown })._count).toBeUndefined();
    });
  });

  describe('updateCategory', () => {
    it('re-derives the slug when the name changes', async () => {
      const prisma = buildPrismaMock();
      (prisma.category.findUnique as jest.Mock).mockResolvedValue({ id: 'category-1' });
      (prisma.category.update as jest.Mock).mockResolvedValue(category({ name: 'La Liga', slug: 'la-liga' }));
      const service = new AdminContentService(prisma);

      await service.updateCategory('category-1', { name: 'La Liga' });

      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: 'category-1' },
        data: { name: 'La Liga', slug: 'la-liga' },
      });
    });

    it('toggles status without touching the slug', async () => {
      const prisma = buildPrismaMock();
      (prisma.category.findUnique as jest.Mock).mockResolvedValue({ id: 'category-1' });
      (prisma.category.update as jest.Mock).mockResolvedValue(category({ status: 'inactive' }));
      const service = new AdminContentService(prisma);

      await service.updateCategory('category-1', { status: 'inactive' });

      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: 'category-1' },
        data: { status: 'inactive' },
      });
    });

    it('404s when the category does not exist', async () => {
      const prisma = buildPrismaMock();
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new AdminContentService(prisma);

      await expect(service.updateCategory('missing', { status: 'inactive' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('409s on a duplicate slug from a rename', async () => {
      const prisma = buildPrismaMock();
      (prisma.category.findUnique as jest.Mock).mockResolvedValue({ id: 'category-1' });
      (prisma.category.update as jest.Mock).mockRejectedValue(p2002());
      const service = new AdminContentService(prisma);

      await expect(service.updateCategory('category-1', { name: 'La Liga' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
