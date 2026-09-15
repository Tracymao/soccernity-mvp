import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ADMIN_CONTENT_DEFAULT_PAGE_SIZE,
  ADMIN_CONTENT_MAX_PAGE_SIZE,
} from './admin-content.constants';
import { decodeAdminContentCursor, encodeAdminContentCursor } from './cursor.util';
import { CreateArticleDto } from './dto/create-article.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ListArticlesQueryDto } from './dto/list-articles-query.dto';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { slugify } from './slug.util';

// GET /admin/articles response shape — lean, list-appropriate columns
// only (Section 5.5's low-bandwidth discipline, the same reasoning
// ClubsService.CLUB_SELECT / CommunityGroupsService.GROUP_SELECT already
// follow). `body` is deliberately NOT selected here — ArticlesPage.tsx's
// own list only ever needs title/date/category (the task brief's own
// literal spec); a caller editing an article already has its full row
// via the create/update responses below, both of which DO include body.
const ARTICLE_LIST_SELECT = {
  id: true,
  title: true,
  status: true,
  categoryId: true,
  category: { select: { id: true, name: true } },
  authorAdminId: true,
  publishedAt: true,
  createdAt: true,
} as const;

export type ArticleListItem = Prisma.ArticleGetPayload<{ select: typeof ARTICLE_LIST_SELECT }>;

export interface ArticleListPage {
  items: ArticleListItem[];
  nextCursor: string | null;
}

// GET /admin/categories response shape. `articleCount` is a computed
// field (Prisma's own `_count`, a cheap aggregate — no Article rows
// pulled), matching CategoriesPage.tsx's own "Post Count" column;
// `_count` itself is never returned verbatim to keep the response shape
// flat and simple for the frontend to consume.
const CATEGORY_LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
  createdAt: true,
  _count: { select: { articles: true } },
} as const;

type CategoryRow = Prisma.CategoryGetPayload<{ select: typeof CATEGORY_LIST_SELECT }>;
export type CategoryListItem = Omit<CategoryRow, '_count'> & { articleCount: number };

export interface CategoryListPage {
  items: CategoryListItem[];
  nextCursor: string | null;
}

function toCategoryListItem(row: CategoryRow): CategoryListItem {
  const { _count, ...rest } = row;
  return { ...rest, articleCount: _count.articles };
}

// Build Plan Section 4.8 (Admin Service) — Article/Category management.
// See README.md for the full endpoint table, the role-gating reasoning,
// and every Decision Log candidate this module surfaces (the GET/PATCH
// routes beyond Section 4.8's literal POST-only lines, Category.status/
// Article.createdAt/Category.createdAt schema additions).
@Injectable()
export class AdminContentService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // Articles
  // -------------------------------------------------------------------

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
  }

  private async assertArticleExists(id: string): Promise<{ id: string; status: string; publishedAt: Date | null }> {
    const article = await this.prisma.article.findUnique({
      where: { id },
      select: { id: true, status: true, publishedAt: true },
    });
    if (!article) {
      throw new NotFoundException('Article not found');
    }
    return article;
  }

  // POST /admin/articles (AdminRolesGuard('editor', 'superadmin')).
  // authorAdminId comes from the caller's own verified access token
  // (@CurrentAdmin()), never the body. `status` defaults to Article's
  // own schema @default("draft") when the caller omits it; a caller MAY
  // create an already-published article directly (status: 'published'),
  // in which case publishedAt is set to now() in the same write.
  async createArticle(adminId: string, dto: CreateArticleDto) {
    await this.assertCategoryExists(dto.categoryId);

    const status = dto.status ?? 'draft';
    return this.prisma.article.create({
      data: {
        title: dto.title,
        body: dto.body,
        categoryId: dto.categoryId,
        authorAdminId: adminId,
        status,
        publishedAt: status === 'published' ? new Date() : null,
      },
    });
  }

  // GET /admin/articles (AdminRolesGuard('editor', 'superadmin') — see
  // README.md's "who may view" reasoning for why this diverges from
  // moderation's own view-vs-mutate role split). Keyset-paginated,
  // newest-first, two optional exact-match filters.
  async listArticles(query: ListArticlesQueryDto): Promise<ArticleListPage> {
    const limit = Math.min(query.limit ?? ADMIN_CONTENT_DEFAULT_PAGE_SIZE, ADMIN_CONTENT_MAX_PAGE_SIZE);

    const conditions: Prisma.ArticleWhereInput[] = [];
    if (query.status) {
      conditions.push({ status: query.status });
    }
    if (query.categoryId) {
      conditions.push({ categoryId: query.categoryId });
    }
    if (query.cursor) {
      const cursor = decodeAdminContentCursor(query.cursor);
      conditions.push({
        OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
      });
    }

    const where: Prisma.ArticleWhereInput = conditions.length > 0 ? { AND: conditions } : {};

    const rows = await this.prisma.article.findMany({
      where,
      select: ARTICLE_LIST_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? encodeAdminContentCursor({ createdAt: last.createdAt, id: last.id }) : null;

    return { items, nextCursor };
  }

  // PATCH /admin/articles/:id (AdminRolesGuard('editor', 'superadmin')).
  // Every field optional. No per-author edit restriction is enforced —
  // a deliberate choice, disclosed in README.md, not an oversight: unlike
  // Grassroots fixtures or Contest entries, Article carries no product
  // requirement anywhere in Section 4.8/8.4 that only its own author may
  // edit it, and this codebase's only precedent for that kind of
  // restriction (GrassrootsService) is justified by a genuinely different
  // shape of resource (two-party sports records, not shared editorial
  // content) — any editor/superadmin may edit any article, the same
  // shared-newsroom model most CMSes use.
  //
  // publishedAt is set to now() the FIRST time an article's status moves
  // to 'published' (i.e. it was previously null). Reverting to 'draft'
  // deliberately does NOT clear a previously-set publishedAt — preserved
  // as the historical "first went live at" record, mirroring this
  // codebase's own precedent of preserving a historical timestamp field
  // rather than nulling it out on a later state change (e.g.
  // ModerationService.decideAppeal leaving appealStatus as 'overturned'
  // rather than resetting it to null). Re-publishing a second time is a
  // no-op on publishedAt (it already has a value).
  async updateArticle(id: string, dto: UpdateArticleDto) {
    const existing = await this.assertArticleExists(id);

    if (dto.categoryId) {
      await this.assertCategoryExists(dto.categoryId);
    }

    const data: Prisma.ArticleUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.categoryId !== undefined) data.category = { connect: { id: dto.categoryId } };
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === 'published' && existing.publishedAt === null) {
        data.publishedAt = new Date();
      }
    }

    return this.prisma.article.update({ where: { id }, data });
  }

  // -------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------

  // POST /admin/categories (AdminRolesGuard('editor', 'superadmin')).
  // `slug` is always derived server-side (slug.util.ts) — never trusted
  // from the client. A duplicate slug (i.e. an effectively-duplicate
  // name) surfaces as a clear 409, not a raw P2002 — the same
  // pre-check-plus-race-safe-backstop pattern
  // CommunityGroupsService.createGroup already established for its own
  // nameNormalized @@unique constraint.
  async createCategory(dto: CreateCategoryDto) {
    const slug = slugify(dto.name);
    try {
      return await this.prisma.category.create({
        data: { name: dto.name, slug },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A category with this name already exists');
      }
      throw err;
    }
  }

  // GET /admin/categories (AdminRolesGuard('editor', 'superadmin')).
  // Keyset-paginated, newest-first, one optional exact-match `status`
  // filter. `articleCount` is CategoriesPage.tsx's own "Post Count"
  // column, computed via Prisma's `_count` (a cheap aggregate).
  async listCategories(query: ListCategoriesQueryDto): Promise<CategoryListPage> {
    const limit = Math.min(query.limit ?? ADMIN_CONTENT_DEFAULT_PAGE_SIZE, ADMIN_CONTENT_MAX_PAGE_SIZE);

    const conditions: Prisma.CategoryWhereInput[] = [];
    if (query.status) {
      conditions.push({ status: query.status });
    }
    if (query.cursor) {
      const cursor = decodeAdminContentCursor(query.cursor);
      conditions.push({
        OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
      });
    }

    const where: Prisma.CategoryWhereInput = conditions.length > 0 ? { AND: conditions } : {};

    const rows = await this.prisma.category.findMany({
      where,
      select: CATEGORY_LIST_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map(toCategoryListItem);
    const last = pageRows[pageRows.length - 1];
    const nextCursor = hasMore && last ? encodeAdminContentCursor({ createdAt: last.createdAt, id: last.id }) : null;

    return { items, nextCursor };
  }

  // PATCH /admin/categories/:id (AdminRolesGuard('editor', 'superadmin')).
  // Covers a rename (slug re-derived server-side, re-checked for
  // uniqueness the same way createCategory is) and/or the active/
  // inactive status toggle. No category-deletion route exists anywhere
  // in this module by design — see README.md; retiring a category via
  // this same PATCH covers the real underlying need (Article.categoryId
  // has no ON DELETE CASCADE, so a hard delete would orphan every
  // Article referencing it).
  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.category.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    const data: Prisma.CategoryUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
      data.slug = slugify(dto.name);
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
    }

    try {
      return await this.prisma.category.update({ where: { id }, data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A category with this name already exists');
      }
      throw err;
    }
  }
}
