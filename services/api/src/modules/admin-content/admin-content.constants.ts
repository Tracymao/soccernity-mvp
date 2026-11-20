// Build Plan Section 4.8 (Admin Service) — Article/Category management.
// Article.status is a plain Postgres `String`, not a Prisma/Postgres
// enum — the schema comment already documents `draft | published`; same
// extensibility choice already made for Report.status, User.role, etc.
export const ARTICLE_STATUSES = ['draft', 'published'] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

// Category.status — sprint-5/admin-articles-categories-backend addition
// (see schema.prisma's own comment on Category.status for why).
export const CATEGORY_STATUSES = ['active', 'inactive'] as const;
export type CategoryStatus = (typeof CATEGORY_STATUSES)[number];

// Section 5.5: every list endpoint is paginated. Same default 20 / max 50
// every other list endpoint in this codebase uses.
export const ADMIN_CONTENT_DEFAULT_PAGE_SIZE = 20;
export const ADMIN_CONTENT_MAX_PAGE_SIZE = 50;

// Article.excerpt (Decision Log #333, resolved) — a curated, admin-
// authored summary, distinct from blog/excerpt.util.ts's own
// EXCERPT_MAX_LENGTH (200), which bounds the unstored, computed
// fallback truncation of `body` on the public read side. This one
// bounds what an admin may TYPE — intentionally a little roomier than
// the auto-truncated fallback, since a hand-written summary is a
// deliberate editorial choice, not a mechanical cut.
export const ARTICLE_EXCERPT_MAX_LENGTH = 300;
