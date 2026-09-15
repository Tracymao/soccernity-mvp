# admin-content module

Build target: **Sprint 5** — Section 4.8 (Admin Service), the
Article/Category management half. Built by
`sprint-5/admin-articles-categories-backend` (backend-api, 2026-09-15) —
Sprint 5's other done-when half, alongside the moderation-queue backend
(`sprint-5/admin-moderation-queue-backend`, `modules/moderation/`).

Backs `apps/admin/src/pages/articles/ArticlesPage.tsx` /
`CreateArticlePage.tsx` and `apps/admin/src/pages/categories/CategoriesPage.tsx` /
`AddCategoryPage.tsx` — all four were real, Figma-derived UI shipped as
self-documented STUBS ("no articles/categories backend exists," per
`sprint-2/admin-articles-categories-stub`). This same PR converts all
four to real data (`sprint-5/admin-articles-categories-frontend` is the
second half of this branch, not a separate PR — see the frontend commit).

`Article` and `Category` (Section 3) both gained a `createdAt` column;
`Category` also gained `status`. Migration
`20260915135512_add_article_category_admin_fields` — **a real, hand-run
`prisma migrate dev` confirmed this migration applies cleanly**, both
against the live dev database and against `soccernity_test` (via a real
`prisma migrate deploy`), matching PR #244/#245's own bar. `User` /
`Guardian` safeguarding fields are untouched — only `Article` and
`Category` change (confirmed by schema diff).

---

## Endpoints

| Method & path | Guards | Purpose |
|---|---|---|
| `GET /admin/articles` | `AdminJwtAuthGuard` + `AdminRolesGuard('editor', 'superadmin')` | List articles, keyset-paginated, optional `?status=`/`?categoryId=` filters. **Genuine spec-gap addition** — see below. |
| `POST /admin/articles` | same | Create an article. Section 4.8's literal line. |
| `PATCH /admin/articles/:id` | same | Edit an article / change its status (publish, unpublish). Section 4.8's literal line. |
| `GET /admin/categories` | same | List categories, keyset-paginated, optional `?status=` filter, with a computed `articleCount`. **Genuine spec-gap addition** — see below. |
| `POST /admin/categories` | same | Create a category. Section 4.8's literal line. |
| `PATCH /admin/categories/:id` | same | Rename a category and/or toggle its active/inactive status. **Genuine spec-gap addition** — see below. |

All six routes are role-gated identically — see "Who may view: the GET
role-gating decision" below.

---

## Three Decision Log candidates: the spec-gap endpoints (flagged, built anyway)

Section 4's API Contract Sketch defines only `POST /admin/articles`,
`PATCH /admin/articles/:id`, and `POST /admin/categories` literally — no
GET for either resource, and no PATCH/DELETE for categories. Same shape
of gap the moderation module's own README already flagged for its own
spec-gap routes; flagging it here rather than treating it as
self-evidently correct, per the task brief's own explicit instruction.

1. **`GET /admin/articles`** — the real Figma screen
   (`ArticlesPage.tsx`, node 123:56) is a list of every article, and
   nothing in Section 4.8 defines how that list is populated without a
   GET. Built because the alternative — an Articles admin screen that
   can create articles but never see them — is a bigger gap than one
   undefined route.
2. **`GET /admin/categories`** — same shape of gap, for
   `CategoriesPage.tsx` (node 128:488).
3. **`PATCH /admin/categories/:id`** — Section 4.8 never mentions
   editing or retiring a category, but `CategoriesPage.tsx`'s own Figma
   design already renders a Status column with both `Active` and
   `Inactive` sample rows — a control with nothing behind it otherwise.
   Also the real mechanism for retiring a category without deleting it
   (see the schema-addition section below for why deletion isn't the
   right primitive here).

Not treated as self-evidently correct — flagging all three here for a
founder/Decision Log call on whether the exact shape (route names, guard
choices) should be formally written into Section 4, the same way
moderation's own two spec-gap routes were flagged.

## A fourth Decision Log candidate: the `Article.createdAt` / `Category.createdAt` / `Category.status` schema additions

Genuine additions beyond Section 3's original field lists, flagged per
`CLAUDE.md`'s "the data model is a fixed spec" rule rather than added
silently:

- **`Article.createdAt`** — Section 3's original `Article` had no
  timestamp at all. Needed for two real, unavoidable reasons:
  `ArticlesPage.tsx`'s own "Date" column has nothing else to show for a
  still-draft article (`publishedAt` is `null` until publish), and `GET
  /admin/articles` needs a real column to keyset-paginate by — the same
  gap `Follow.createdAt` / `Like.likedAt` / `BanterRoomMember.joinedAt`
  each closed for their own models.
- **`Category.createdAt`** — the identical "a list endpoint needs a real
  column to order/page by" gap, for `GET /admin/categories`.
- **`Category.status`** (`"active"` | `"inactive"`, default `"active"`)
  — `CategoriesPage.tsx`'s own Figma design already renders a Status
  column with both values; `Category` had no field to back it. Mirrors
  `User.accountStatus` / `AdminUser.accountStatus`'s existing
  string-enum convention. **Retiring a category (inactive) rather than
  deleting it is deliberate, not a smaller version of the same idea**:
  `Article.categoryId` has no `ON DELETE CASCADE` (and Section 4.8
  defines no category-deletion route at all — see "Don't" below), so a
  hard delete would orphan every `Article` referencing it. The status
  toggle covers the real underlying product need — stop a category
  accepting new articles — without that risk.

---

## Who may view: the GET role-gating decision

The task brief that dispatched this module named only the mutation
routes for role-gating (`POST`/`PATCH` restricted to `editor` and
`superadmin`, excluding `moderator` — mirroring how PR #244's own brief
said "an editor should not have queue access"), and explicitly asked
whether GET should be role-gated the same way `AdminModerationController`
gates its own GET, or left open to every admin role.

**Checked against the real code before deciding, not assumed:**
`AdminModerationController` (`modules/moderation/admin-moderation.controller.ts`)
applies `AdminRolesGuard('moderator', 'superadmin')` to its **entire**
controller — `@UseGuards`/`@AdminRoles` sit at the class level, and `GET
/admin/moderation/reports` is covered by the exact same role check as the
two `PATCH` routes. There is **no** view-vs-mutate split anywhere in that
controller — the only split is by JOB (an `editor` gets zero access,
not read-only access).

**Decision: mirror that shape exactly.** `AdminArticlesController` and
`AdminCategoriesController` both apply `AdminJwtAuthGuard` +
`AdminRolesGuard('editor', 'superadmin')` at the class level — `GET`
included, not just the two mutating routes. Reasoning:

1. It matches the only existing role-gated-admin-surface precedent in
   this codebase exactly, rather than inventing a second, inconsistent
   shape (a class-level auth-only guard plus per-route role overrides on
   just the mutating routes) with no functional requirement driving it.
2. `AdminUser`'s own schema comment already frames Articles and Reports
   as two separate jobs ("authors Articles; actions Reports") with no
   stated overlap — a moderator has no more reason to browse the
   Articles/Categories admin lists than an editor has to browse the
   moderation queue.
3. Nothing in Section 4.8, the Figma designs, or the task brief
   identifies a real product need for a moderator to view (but not
   edit) Articles/Categories.

This is a stated decision, not a silent divergence from — or a silent
copy of — the task brief's own premise (which assumed, inaccurately,
that moderation's GET was already split from its mutate routes).

---

## Guard reasoning for the mutation routes

`AdminRolesGuard('editor', 'superadmin')` on `POST`/`PATCH` for both
resources — the task brief's own explicit instruction, following
`AdminUser`'s schema comment ("an editor authors Articles") symmetrically
to how moderation excludes `editor` from its own routes. Uses the exact
same reusable `AdminRolesGuard`/`@AdminRoles(...)` infrastructure
`modules/admin/guards/` already exports from `AdminAuthFoundationModule`
— no new guard class, no new DI wiring.

---

## Who may edit an article? (no per-author restriction, a deliberate choice)

Unlike `GrassrootsService` (fixture management restricted to a team's own
`createdById`) or `ContestService` (entries scoped to the submitting
user), **any `editor` or `superadmin` may edit any `Article`** —
`updateArticle` does not check `authorAdminId` against the caller at all.

This is a disclosed judgment call, not an oversight: nothing in Section
4.8, Section 8.4, or either Figma screen names a per-author edit
restriction for Articles, and the only existing precedent for that kind
of restriction in this codebase is justified by a genuinely different
shape of resource (two-party sports records / individual contest
entries, not shared editorial content). Any editor/superadmin editing
any article is the same shared-newsroom model most CMSes use, and
matches `AdminUser.role`'s own framing of "editor" as a single shared
job, not a set of individually-owned articles.

---

## `publishedAt` semantics on `PATCH /admin/articles/:id`

`publishedAt` is set to `now()` the **first** time an article's `status`
moves to `'published'` (i.e. it was previously `null`). Reverting to
`'draft'` deliberately does **not** clear a previously-set `publishedAt`
— preserved as the historical "first went live at" record, the same
"preserve a historical timestamp rather than null it out on a later
state change" precedent `ModerationService.decideAppeal` already set
(leaving `appealStatus` as `'overturned'` rather than resetting it to
`null`). Re-publishing a second time is a no-op on `publishedAt` — it
already has a value. `POST /admin/articles` follows the identical rule:
creating an article directly as `status: 'published'` sets `publishedAt`
in the same write; omitting `status` (or passing `'draft'`) leaves it
`null`.

---

## Category rename: slug is always server-derived

Neither `CreateCategoryDto` nor `UpdateCategoryDto` accepts a `slug`
field at all — the global `ValidationPipe`'s `forbidNonWhitelisted: true`
rejects a request body containing one outright (400), before it reaches
the controller. `slug.util.ts`'s `slugify()` derives it from `name` on
every create and every rename, per the task brief's own explicit "don't
trust a client-supplied slug" instruction. A duplicate slug (i.e. an
effectively-duplicate name) surfaces as a clear `409`, not a raw `P2002`
— the same pre-check-plus-race-safe-backstop pattern
`CommunityGroupsService.createGroup` already established for its own
`nameNormalized` `@@unique` constraint (`Category.slug`'s own pre-existing
`@unique` constraint is the actual enforcement mechanism; the try/catch
is the race-safe backstop for a genuinely concurrent duplicate-name
create/rename).

---

## No `e2e` spec added for this module — stated reasoning, not a silent omission

Per `test/README.md`'s own guiding principle: add a real e2e spec
specifically when a code path involves raw SQL, transaction/isolation-
level reasoning, or a genuinely novel Prisma relation/constraint. None of
the three apply here — every method in `AdminContentService` is a plain
`findUnique`/`findMany`/`create`/`update` call, no `$transaction`, no
`$executeRaw`/`$queryRaw`, and no new relation or `@@unique` constraint
(`Category.slug`'s `@unique` already existed; `Article.createdAt` /
`Category.createdAt` / `Category.status` are plain scalar columns, not
relations). The mocked unit suite
(`admin-content.service.spec.ts`, `admin-articles.controller.http.spec.ts`,
`admin-categories.controller.http.spec.ts`) is the right, faster layer
for this module's logic — the same conclusion `feed/README.md`'s own
per-caller-viewer-state addition (`sprint-2/feed-per-user-flags`, plain
`findMany`/`findUnique` calls, no transaction/raw-SQL/new-relation) drew
for an analogous shape of change. The full e2e suite was re-run after applying
this PR's migration as a pure regression check — **17 suites / 161
tests, 0 failures, before and after** (no e2e file changed by this PR).

---

## Don't (per the task brief, restated here for anyone extending this module)

- **No image upload, no `MediaAsset` wiring.** `CreateArticlePage.tsx`'s
  "Add up to 5 images, 50MB each" control stays visibly disabled with a
  disclosed note — the Media backend (a separate, sequenced-later
  ticket) has no module/endpoints yet, even though the `MediaAsset`
  model itself already exists in `schema.prisma`. `Article` has no
  image relation.
- **No public-facing `GET /articles`.** Section 4.8 is admin-only;
  `apps/web`'s Blog/Article Detail pages are a separate, already-shipped
  feature using their own illustrative-dummy-data path (no backend
  content module exists for them at all — see
  `docs/sprint-2-blog-articles-to-code-report.md`). This PR does not
  connect the two.
- **No category-deletion endpoint.** The active/inactive status toggle
  covers the real underlying need (retire a category without orphaning
  its `Article` rows) — see the schema-addition section above.
