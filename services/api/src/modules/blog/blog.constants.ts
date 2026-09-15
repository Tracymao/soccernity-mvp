// sprint-4/public-blog-articles-feed — Build Plan Section 4, Sprint 4's
// public-facing Blog/Articles feed. Section 5.5: same default 20 / max
// 50 page-size convention every list endpoint in this codebase uses
// (feed, clubs, admin-content, leaderboard, etc.) — a fresh copy for
// this module rather than importing admin-content's own constants,
// since this ticket deliberately does not touch admin-content (see
// README.md's "one service or two" section).
export const BLOG_DEFAULT_PAGE_SIZE = 20;
export const BLOG_MAX_PAGE_SIZE = 50;
