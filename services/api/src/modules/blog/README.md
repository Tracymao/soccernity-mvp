# `blog` — the public-facing Blog/Articles feed

`sprint-4/public-blog-articles-feed` — Build Plan Section 4, Sprint 4's
second deliverable (the first being Sports Hub — independent of this,
no shared code, no shared schema tables, built and merged on its own
timeline). This module is the **public read side** of the content
pipeline `sprint-5/admin-articles-categories-backend`
(`services/api/src/modules/admin-content/`) already built for the
Admin Console: an editor drafts and publishes an `Article` there; this
module is where the rest of the world reads it.

## Endpoints

All three are genuinely public — **no guard at all**, not a guard that
always passes. No route here has ever required a `JwtAuthGuard` or an
`AdminJwtAuthGuard`.

- `GET /articles?categoryId=&categorySlug=&cursor=&limit=` — published
  articles only (`Article.status === 'published'`), newest-published-first,
  keyset-paginated (Section 5.5: default 20 / max 50). `categoryId` (a
  real `Category` UUID) and `categorySlug` (`Category.slug`) are
  alternate, combinable equality filters on the referenced category —
  the task brief's own ask, so `BlogPage.tsx`'s category tabs (built
  from `GET /categories`, which already carries each category's `slug`)
  never need a separate id lookup just to filter.
- `GET /articles/:id` — a single published article, full body included.
  A draft's real id and a genuinely non-existent id both 404 identically
  — see "Don't leak draft existence" below.
- `GET /categories` — active categories only (`Category.status ===
  'active'`), keyset-paginated. No `status` query param at all (unlike
  the admin side's `GET /admin/categories`) — a public caller has no
  legitimate reason to ask for the inactive list.

## One service (and module), not two — and admin-content stays untouched

Two shapes were on the table for this ticket: extend
`AdminContentService`/`AdminContentModule` with a couple of new,
unguarded routes, or build a brand-new top-level module. **A new
module was built.** `AdminContentModule` imports
`AdminAuthFoundationModule` specifically because every one of its
routes needs `AdminJwtAuthGuard`/`AdminRolesGuard`; folding a genuinely
public read path into that module would mean either loosening that
module's own guard story or hand-picking which routes on a
role-gated controller skip the guard — a new, unprecedented mixed
pattern this codebase doesn't use anywhere else (see
`admin-articles.controller.ts`'s own header comment on why even `GET
/admin/articles` stays role-gated, no view/mutate split). A dedicated
`BlogModule`/`BlogService`, reading the same two tables through Prisma
directly, keeps the two audiences (an authenticated editor managing
drafts, an anonymous reader browsing published content) on
structurally separate code paths with no guard interaction to reason
about — the same shape `LeaderboardModule` and `ContestModule` each
already use for their own public/authenticated read splits.

**Not a single line in `services/api/src/modules/admin-content/` was
touched by this PR** — its controllers, service, DTOs, and constants
are byte-identical to before. `admin-content.service.ts`'s
`ARTICLE_LIST_SELECT` and this module's `PUBLIC_ARTICLE_SELECT` are
two independent constants (the public one omits `authorAdminId`/
`status` entirely, and swaps `authorAdminId` for `authorAdmin.fullName`
— the admin list never needed the author's name, since
`ArticlesPage.tsx` already has the current admin's own identity from
their session; the public feed has no such context and needs a real
byline).

## Never expose `AdminUser.email` (or any field but `fullName`)

`Article.authorAdmin` is a full `AdminUser` relation. The public select
(`PUBLIC_ARTICLE_SELECT` in `blog.service.ts`) selects **only**
`authorAdmin: { select: { fullName: true } }` — no `email`, no `id`, no
`role`, no `accountStatus`. The response's `author` field is a plain
string (`row.authorAdmin.fullName`), not a nested object a client could
ever accidentally over-fetch from.

## Don't leak draft existence

`GET /articles/:id` queries with `findFirst({ where: { id, status:
'published', publishedAt: { not: null } } })` — a real draft's id and a
genuinely non-existent id produce the identical `null` result from
Prisma, and therefore the identical `404 { message: 'Article not
found' }` response. There is no way for a public caller to distinguish
"this id never existed" from "this id is a real, unpublished draft" —
matching this codebase's established don't-leak-existence convention
(`UsersService.assertFollowGraphVisible`, `ModerationService`'s
404-before-403 ordering, `ClubsService.assertClubExists`, etc.).

## Ordering: `publishedAt`, not `createdAt`

Both this module's own cursor and its `ORDER BY` use `publishedAt desc,
id desc` — **not** `Article.createdAt`, which is what the admin side's
own `GET /admin/articles` orders by. A public reader cares about when
something went live, not when its draft was first typed; an article
drafted months before it's finally published should appear at the top
of a fresh "newest first" public feed the day it actually publishes,
not buried under its own stale `createdAt`. This relies on
`admin-content.service.ts`'s own documented invariant — `publishedAt`
is set the first time `status` moves to `'published'` and is never
cleared afterward (even on a later revert-to-draft-then-republish
cycle) — so every row this module can ever return has a real,
monotonic `publishedAt`. `PUBLISHED_ARTICLE_FILTER`'s `publishedAt: {
not: null }` clause is a defensive second-layer check on top of the
`status: 'published'` filter, not the primary gate — the invariant is
enforced only in application code, never a DB constraint, mirroring
`leaderboard.service.ts`'s own defensive active-account re-check on top
of its rollup's own filter.

## Decision Log candidates (flagged, not resolved here)

None of the below required a schema change or touched
`admin-content` — deliberately, since this ticket's own brief rules
that out. Each is flagged here (and in the corresponding code comment)
per this project's own "flag a genuine schema/scope gap, don't add it
silently" convention (`CLAUDE.md`'s "the data model is a fixed spec"
rule) — a future doc-hygiene pass should transcribe these into the live
Build Plan Decision Log (Section 9), the same backfill pattern already
used for `Category.status`/`Article.createdAt` and the Sprint 5
Users/Dashboard/Media modules.

1. **A real `Article.excerpt` column, deferred.** `BlogPage.tsx`'s own
   dummy data has an `excerpt` field; `Article` doesn't. This module
   ships a plain, unstored, word-boundary truncation of `body`
   (`excerpt.util.ts`'s `truncateExcerpt`, `EXCERPT_MAX_LENGTH = 200`),
   computed at read time and never persisted — never touching
   `admin-content`. A real column would let an editor write a genuinely
   different, hand-crafted excerpt (not just a truncation of the body)
   — but making that column useful means editing
   `admin-content.service.ts`'s `CreateArticleDto`/`UpdateArticleDto`
   and its two service methods, which is explicitly out of this
   ticket's scope. If Soccernity wants real, editor-authored excerpts
   later, that's a small, clean admin-content follow-up (one nullable
   `String?` column + two DTO fields), with this module's response
   shape (`excerpt: string`) needing zero change — only the value's
   provenance would change from "computed" to "authored, falling back
   to the computed truncation when blank."
2. **An `Article`-to-`MediaAsset` image relation, deferred.** The
   Sprint 5 Media library backend (`sprint-5/admin-media-storage-backend`)
   exists now, and both that PR and the original Articles/Categories PR
   flagged "Article has no image relation" as a follow-up once it
   landed. Investigated for this ticket and deferred anyway: a
   *functional* image feature needs an admin write path to actually
   assign an uploaded `MediaAsset` to an `Article` (a picker in
   `CreateArticlePage.tsx`, a new optional field on
   `CreateArticleDto`/`UpdateArticleDto`) — which, again, means editing
   `admin-content`, explicitly out of scope here. Adding just the
   schema field with no way to ever set it (`Article.imageAssetId
   String?` + the mandatory reverse relation array on `MediaAsset`)
   would be a dangling, functionally useless column — worse than not
   adding it, not "clean and small" once you account for what makes it
   actually work. `BlogPage.tsx`/`ArticleDetailPage.tsx` keep their
   existing placeholder `<span>` media blocks, unchanged by this PR.
3. **An inactive category doesn't hide its own already-published
   articles from `GET /articles`.** Marking a `Category` `'inactive'`
   only removes it from `GET /categories`'s own tab list — it does
   **not** filter `GET /articles`'s "All" listing, and an explicit
   `?categoryId=<uuid-of-an-inactive-category>` still returns that
   category's published articles (nothing prevents a stale bookmarked
   link from working). Section 4.8 doesn't specify this interaction
   either way; this is the more conservative reading (retiring a
   category from the browse UI doesn't retroactively un-publish
   content), but it's a real product judgment call, not an obvious
   default.

## Verification

Real, freshly measured before/after test counts (mocked-Prisma unit
layer only — see the note below on why no e2e spec accompanies this
module):

- `services/api` mocked suite: measure before/after via `npx jest`
  from a clean checkout of this branch vs. `main`.
- `apps/web`: measure before/after via `npx vitest run`.
- `npx tsc --noEmit`, `npm run lint`, and a production build clean on
  both workspaces.

**No e2e spec was added.** Every method in `blog.service.ts` is a plain
`findMany`/`findFirst` against `Article.categoryId`/`Article.authorAdminId`
— both already-existing, already-exercised FKs — with no raw SQL, no
`$transaction`, and no new relation or constraint. None of
`test/README.md`'s three e2e-add triggers apply, the same conclusion
`admin-content/README.md` and `admin-dashboard/README.md` each already
reached for their own analogous plain-read modules.
