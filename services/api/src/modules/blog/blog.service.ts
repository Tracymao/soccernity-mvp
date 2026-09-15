import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BLOG_DEFAULT_PAGE_SIZE, BLOG_MAX_PAGE_SIZE } from './blog.constants';
import {
  decodeArticleCursor,
  decodeCategoryCursor,
  encodeArticleCursor,
  encodeCategoryCursor,
} from './cursor.util';
import { ListPublicArticlesQueryDto } from './dto/list-articles-query.dto';
import { ListPublicCategoriesQueryDto } from './dto/list-categories-query.dto';
import { truncateExcerpt } from './excerpt.util';

// Public read-only Article select — deliberately narrower than
// admin-content.service.ts's own ARTICLE_LIST_SELECT: no
// `authorAdminId` (the raw AdminUser id must never leak publicly — only
// `authorAdmin.fullName` is exposed, never `email` or any other
// AdminUser field), no `status` (every row this service ever returns is
// already known to be 'published', per PUBLISHED_ARTICLE_FILTER below).
// `body` IS selected here — read only to derive the excerpt
// (excerpt.util.ts) and, on the detail path, to return in full — the
// list-response shape (toPublicArticleListItem) strips it back out.
const PUBLIC_ARTICLE_SELECT = {
  id: true,
  title: true,
  body: true,
  publishedAt: true,
  category: { select: { id: true, name: true, slug: true } },
  authorAdmin: { select: { fullName: true } },
} as const;

type PublicArticleRow = Prisma.ArticleGetPayload<{ select: typeof PUBLIC_ARTICLE_SELECT }>;

export interface PublicArticleCategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface PublicArticleListItem {
  id: string;
  title: string;
  excerpt: string;
  publishedAt: Date;
  category: PublicArticleCategoryRef;
  author: string;
}

export interface PublicArticleDetail extends PublicArticleListItem {
  body: string;
}

export interface PublicArticleListPage {
  items: PublicArticleListItem[];
  nextCursor: string | null;
}

function toPublicArticleListItem(row: PublicArticleRow): PublicArticleListItem {
  return {
    id: row.id,
    title: row.title,
    excerpt: truncateExcerpt(row.body),
    // Non-null by PUBLISHED_ARTICLE_FILTER's own WHERE clause (every row
    // reaching this function was queried with `publishedAt: { not: null }`).
    publishedAt: row.publishedAt as Date,
    category: row.category,
    author: row.authorAdmin.fullName,
  };
}

function toPublicArticleDetail(row: PublicArticleRow): PublicArticleDetail {
  return { ...toPublicArticleListItem(row), body: row.body };
}

// Every published-article query in this service is gated by this.
// `status: 'published'` is the real gate; `publishedAt: { not: null }`
// is a defensive second-layer check — the invariant "status ===
// 'published' implies publishedAt is set" is enforced only in
// application code (admin-content.service.ts's createArticle/
// updateArticle), never a DB constraint — mirroring this codebase's
// established belt-and-braces style (e.g. leaderboard.service.ts's own
// defensive active-account re-check on top of the rollup's own filter).
const PUBLISHED_ARTICLE_FILTER: Prisma.ArticleWhereInput = {
  status: 'published',
  publishedAt: { not: null },
};

const PUBLIC_CATEGORY_SELECT = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
} as const;

type PublicCategoryRow = Prisma.CategoryGetPayload<{ select: typeof PUBLIC_CATEGORY_SELECT }>;

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
}

function toPublicCategory(row: PublicCategoryRow): PublicCategory {
  return { id: row.id, name: row.name, slug: row.slug };
}

export interface PublicCategoryListPage {
  items: PublicCategory[];
  nextCursor: string | null;
}

// Build Plan Section 4 — the public-facing Blog/Articles feed (Sprint
// 4's second deliverable, independent of the Sports Hub work). A
// dedicated top-level service, deliberately NOT folded into
// AdminContentService — see README.md's "one service or two" section
// for the full reasoning. Nothing in this file has any notion of "am I
// allowed to see the draft version" — every method is gated to
// status: 'published' (Article) / status: 'active' (Category) at the
// query level, not by a guard, because these routes carry no auth at
// all (Build Plan Section 4's own "no auth required" line for this
// feed).
@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  // GET /articles — no auth. `categoryId`/`categorySlug` are alternate,
  // combinable filters on the referenced Category (see
  // ListPublicArticlesQueryDto's own header comment).
  //
  // Deliberately does NOT filter out an article whose category has since
  // been marked 'inactive' — see README.md's Decision Log candidate on
  // this. GET /categories is what hides an inactive category from the
  // public tab list; an already-published article under one stays
  // reachable both through the unfiltered "All" listing here and through
  // its own GET /articles/:id link.
  async listArticles(query: ListPublicArticlesQueryDto): Promise<PublicArticleListPage> {
    const limit = Math.min(query.limit ?? BLOG_DEFAULT_PAGE_SIZE, BLOG_MAX_PAGE_SIZE);

    const conditions: Prisma.ArticleWhereInput[] = [PUBLISHED_ARTICLE_FILTER];
    if (query.categoryId) {
      conditions.push({ categoryId: query.categoryId });
    }
    if (query.categorySlug) {
      conditions.push({ category: { slug: query.categorySlug } });
    }
    if (query.cursor) {
      const cursor = decodeArticleCursor(query.cursor);
      conditions.push({
        OR: [{ publishedAt: { lt: cursor.publishedAt } }, { publishedAt: cursor.publishedAt, id: { lt: cursor.id } }],
      });
    }

    const rows = await this.prisma.article.findMany({
      where: { AND: conditions },
      select: PUBLIC_ARTICLE_SELECT,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map(toPublicArticleListItem);
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && last ? encodeArticleCursor({ publishedAt: last.publishedAt as Date, id: last.id }) : null;

    return { items, nextCursor };
  }

  // GET /articles/:id — no auth. A draft (or a non-existent id) is a
  // plain 404, indistinguishable from each other — matching this
  // codebase's established "don't leak existence" convention (e.g.
  // UsersService.assertFollowGraphVisible, ModerationService's own
  // 404-before-403 ordering). A public caller has no way to tell "this
  // id doesn't exist" apart from "this id is a real, unpublished draft."
  async getArticleById(id: string): Promise<PublicArticleDetail> {
    const row = await this.prisma.article.findFirst({
      where: { id, ...PUBLISHED_ARTICLE_FILTER },
      select: PUBLIC_ARTICLE_SELECT,
    });
    if (!row) {
      throw new NotFoundException('Article not found');
    }
    return toPublicArticleDetail(row);
  }

  // GET /categories — no auth, active only. Deliberately no `status`
  // query param at all (unlike GET /admin/categories) — see
  // ListPublicCategoriesQueryDto's own header comment.
  async listCategories(query: ListPublicCategoriesQueryDto): Promise<PublicCategoryListPage> {
    const limit = Math.min(query.limit ?? BLOG_DEFAULT_PAGE_SIZE, BLOG_MAX_PAGE_SIZE);

    const conditions: Prisma.CategoryWhereInput[] = [{ status: 'active' }];
    if (query.cursor) {
      const cursor = decodeCategoryCursor(query.cursor);
      conditions.push({
        OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
      });
    }

    const rows = await this.prisma.category.findMany({
      where: { AND: conditions },
      select: PUBLIC_CATEGORY_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map(toPublicCategory);
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && last ? encodeCategoryCursor({ createdAt: last.createdAt, id: last.id }) : null;

    return { items, nextCursor };
  }
}
