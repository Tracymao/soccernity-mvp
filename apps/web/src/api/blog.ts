// Blog/Articles API client -- Build Plan Section 4, the public-facing
// Blog/Articles feed built by sprint-4/public-blog-articles-feed
// (services/api/src/modules/blog/). Every route here is genuinely
// public -- NO Authorization header, unlike every other api/*.ts client
// in this app (api/clubs.ts, api/grassroots.ts, etc.) -- there is no
// JwtAuthGuard/AdminJwtAuthGuard anywhere on GET /articles,
// GET /articles/:id, or GET /categories.
//
// Response shapes mirror blog.service.ts's PublicArticleListItem /
// PublicArticleDetail / PublicCategory exactly. `body` is deliberately
// absent from ArticleSummary (the list shape) -- `excerpt` is a
// server-side truncation of it, computed at read time, not a real
// column (see that module's README's own Decision Log candidate on
// this); the detail shape (Article) adds the full `body`.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export interface BlogCategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface ArticleSummary {
  id: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  category: BlogCategoryRef;
  author: string;
}

export interface Article extends ArticleSummary {
  body: string;
}

export interface ArticleListPage {
  items: ArticleSummary[];
  nextCursor: string | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface CategoryListPage {
  items: Category[];
  nextCursor: string | null;
}

export class BlogApiError extends Error {
  readonly status?: number;

  constructor(message: string, options?: { status?: number }) {
    super(message);
    this.name = "BlogApiError";
    this.status = options?.status;
  }
}

async function get<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`);
  } catch {
    throw new BlogApiError("Couldn't reach the Soccernity server.");
  }

  if (!response.ok) {
    throw new BlogApiError(`Couldn't load that (${response.status}).`, { status: response.status });
  }

  return (await response.json()) as T;
}

// GET /articles?categoryId=&categorySlug=&cursor= -- published articles
// only, newest-published-first. `categoryId`/`categorySlug` are
// alternate, combinable filters on the referenced category -- pass at
// most one in practice (BlogPage.tsx only ever has a category's slug
// from listCategories(), never its own separate id lookup).
export async function listArticles(options?: {
  categoryId?: string;
  categorySlug?: string;
  cursor?: string;
}): Promise<ArticleListPage> {
  const params = new URLSearchParams();
  if (options?.categoryId) params.set("categoryId", options.categoryId);
  if (options?.categorySlug) params.set("categorySlug", options.categorySlug);
  if (options?.cursor) params.set("cursor", options.cursor);
  const qs = params.toString();
  return get<ArticleListPage>(`/articles${qs ? `?${qs}` : ""}`);
}

// GET /articles/:id -- a single published article, full body included.
// A draft's real id and a genuinely non-existent id both 404
// identically -- surfaced here as a BlogApiError with status 404,
// deliberately NOT a distinct error type; the caller
// (ArticleDetailPage.tsx) decides how to render "article not found" by
// inspecting `.status`, the same pattern api/clubs.ts's getClubById
// already establishes.
export async function getArticleById(articleId: string): Promise<Article> {
  return get<Article>(`/articles/${articleId}`);
}

// GET /categories?cursor= -- active categories only.
export async function listCategories(cursor?: string): Promise<CategoryListPage> {
  const url = cursor ? `/categories?cursor=${encodeURIComponent(cursor)}` : "/categories";
  return get<CategoryListPage>(url);
}
