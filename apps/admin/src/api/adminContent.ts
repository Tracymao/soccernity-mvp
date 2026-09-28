// Admin Articles/Categories client — services/api `/admin/articles*` and
// `/admin/categories*` (Build Plan Section 4.8, built by
// sprint-5/admin-articles-categories-backend). Wires ArticlesPage.tsx /
// CreateArticlePage.tsx / CategoriesPage.tsx / AddCategoryPage.tsx to it —
// see that PR's README (services/api/src/modules/admin-content/README.md)
// for the full guard/schema reasoning; response shapes mirror
// admin-content.service.ts's `ArticleListItem`/`CategoryListItem` exactly.
//
// Every call goes through adminFetch (isolated admin auth path,
// ADMIN_JWT_SECRET, transparent 401->refresh — adminClient.ts /
// Decision Log #54). Every route here requires `editor` or `superadmin` —
// a `moderator` token gets a real 403 (AdminRolesGuard), on GET too — see
// admin-articles.controller.ts's own header comment for why.
import { adminFetch } from "./adminClient";

export const ARTICLE_STATUSES = ["draft", "published"] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export const CATEGORY_STATUSES = ["active", "inactive"] as const;
export type CategoryStatus = (typeof CATEGORY_STATUSES)[number];

export interface ArticleCategoryRef {
  id: string;
  name: string;
}

// The real Article row, list-shaped — services/api's own ARTICLE_LIST_SELECT
// (admin-content.service.ts) deliberately omits `body` from the list
// response (Section 5.5 low-bandwidth discipline); the create/update
// responses below DO include the full row, body included.
export interface ArticleListItem {
  id: string;
  title: string;
  status: ArticleStatus;
  categoryId: string;
  category: ArticleCategoryRef;
  authorAdminId: string;
  publishedAt: string | null;
  createdAt: string;
}

export interface Article extends ArticleListItem {
  body: string;
  // Curated summary (Decision Log #333, resolved) — `null` when the
  // admin hasn't set one, in which case the public /articles feed falls
  // back to a computed truncation of `body` (services/api's own
  // excerpt.util.ts). Not on ArticleListItem — services/api's
  // ARTICLE_LIST_SELECT doesn't select it, matching that endpoint's own
  // low-bandwidth list-shape discipline.
  excerpt: string | null;
}

export interface ArticleListPage {
  items: ArticleListItem[];
  nextCursor: string | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  status: CategoryStatus;
  createdAt: string;
  articleCount: number;
}

export interface CategoryListPage {
  items: Category[];
  nextCursor: string | null;
}

// GET /admin/articles — keyset-paginated, two optional exact-match
// filters (status, categoryId).
export function listArticles(
  query: { status?: ArticleStatus; categoryId?: string; cursor?: string; limit?: number } = {},
): Promise<ArticleListPage> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return adminFetch<ArticleListPage>(`/admin/articles${qs ? `?${qs}` : ""}`);
}

// POST /admin/articles — authorAdminId is derived server-side from the
// caller's own token, never sent here. `status` is optional; omitting it
// leaves the article a draft (Article.status's own schema default).
// `excerpt` is optional (Decision Log #333, resolved) — omitting it (or
// sending an empty/whitespace string) leaves the public read side to
// fall back to its own computed truncation of `body`.
export function createArticle(dto: {
  title: string;
  body: string;
  categoryId: string;
  status?: ArticleStatus;
  excerpt?: string;
}): Promise<Article> {
  return adminFetch<Article>("/admin/articles", { method: "POST", body: dto });
}

// PATCH /admin/articles/:id — ArticlesPage.tsx's own Publish/Unpublish row
// action (mirroring updateCategory's status-toggle pattern), and
// CreateArticlePage.tsx's createArticle() call also sends `status`
// explicitly now, via this same DTO shape. Sending `excerpt: ""` clears a
// previously-set curated excerpt back to the computed fallback.
export function updateArticle(
  id: string,
  dto: Partial<{ title: string; body: string; categoryId: string; status: ArticleStatus; excerpt: string }>,
): Promise<Article> {
  return adminFetch<Article>(`/admin/articles/${id}`, { method: "PATCH", body: dto });
}

// GET /admin/categories — keyset-paginated, one optional exact-match
// `status` filter.
export function listCategories(
  query: { status?: CategoryStatus; cursor?: string; limit?: number } = {},
): Promise<CategoryListPage> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return adminFetch<CategoryListPage>(`/admin/categories${qs ? `?${qs}` : ""}`);
}

// POST /admin/categories — `slug` is never sent; it's derived server-side
// from `name` (never trust a client-supplied slug).
export function createCategory(dto: { name: string }): Promise<Category> {
  return adminFetch<Category>("/admin/categories", { method: "POST", body: dto });
}

// PATCH /admin/categories/:id — CategoriesPage.tsx's own status-toggle
// action. Also covers a rename (the slug is re-derived server-side); this
// PR's frontend only ever calls it with `{ status }`.
export function updateCategory(
  id: string,
  dto: Partial<{ name: string; status: CategoryStatus }>,
): Promise<Category> {
  return adminFetch<Category>(`/admin/categories/${id}`, { method: "PATCH", body: dto });
}
