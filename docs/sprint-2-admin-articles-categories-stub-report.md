# Sprint 2 — apps/admin PR 5: Articles + Categories (disclosed stubs)

**Branch:** `sprint-2/admin-articles-categories-stub` — stacks on PR 4 (`sprint-2/admin-dashboard-stub`, #195).
**Figma:** `123:56` (Articles), `124:313` (Create New Post), `128:488` (Categories), `138:93` (Add Category).

## Why stubs

`POST/PATCH /admin/articles` and `POST /admin/categories` are not built; Build Plan Section 4.8 defines **no list endpoint** for either; no image storage is configured anywhere.

## What this PR ships

| Screen | Route | Reproduced |
|---|---|---|
| Articles | `/articles` | sample table (Date / Cover / Title / Category) + **Create Article** link |
| Create New Post | `/articles/new` | Title, article body (textarea), Category (select), Upload Images, Submit Post — **all disabled** |
| Categories | `/categories` | sample table (Name / Post Count / Status) + **Add Category** link |
| Add Category | `/categories/new` | Category name, Submit — **all disabled** |

New `.admin-stub__linkbtn` — an **enabled** link styled as a button, for navigating between stub screens whose destination route genuinely exists (distinct from `StubButton`, which is a genuinely inert action). "Create Article" / "Add Category" use it.

## Verification

- apps/admin vitest — **11 files / 43 tests, 0 failures** (`articlesCategories.test.tsx` +4)
- `npx tsc --noEmit`, `npm run lint`, `npm run build` — clean

**Decision Log #235.** Not merged — founder's call. Next: PR 6 `sprint-2/admin-users-stub`.
