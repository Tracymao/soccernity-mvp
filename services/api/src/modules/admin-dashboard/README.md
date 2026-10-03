# admin-dashboard module

Build target: **Sprint 5** — Section 4.8 (Admin Service), the
Dashboard's literal contract line. Built by
`sprint-5/admin-users-dashboard-backend` (backend-api, 2026-09-15),
alongside `modules/admin-users/` — sequenced together per the task
brief, since two of this module's three real stats are User-table reads
`AdminUsersModule` already touches.

Backs `apps/admin/src/pages/DashboardPage.tsx` — previously a
self-documented STUB ("no `GET /admin/dashboard/stats` endpoint
exists"). This PR converts three of its four stat cards to real data.

---

## Endpoint

| Method & path | Guards | Purpose |
|---|---|---|
| `GET /admin/dashboard/stats` | `AdminJwtAuthGuard` only | New Users (this month), Total Articles (Published), Community Users (Registered), Total Visits. |

## Response shape

```ts
{
  newUsersThisMonth: number;      // User.createdAt within the current UTC calendar month
  totalArticlesPublished: number; // Article.count({ status: 'published' })
  communityUsersTotal: number;    // User.count() — unfiltered total
  totalVisits: number;            // REAL now — see "Decision Log #306 — RESOLVED" below
  visitsByMonth: Array<{ month: string; count: number }>; // REAL now — same section
}
```

---

## Decision Log #306 — RESOLVED by `feat/admin-dashboard-page-views`

**Originally flagged here, not built, per this module's own original task
brief's explicit instruction — not faked as `0` and not silently
omitted.** `DashboardPage.tsx`'s Figma design (node 110:5) wants "Total
Visits (all time)" and a visitor-statistics chart; neither was computable
at the time this module was first built, because **no page-view/visit-
tracking model or middleware existed anywhere in this codebase**.

**`feat/admin-dashboard-page-views` closes this gap.** A new, strictly
anonymous `PageView` model + a global `PageViewInterceptor` now record
real `GET` traffic across the whole app — see
`services/api/src/modules/page-views/README.md` for the full design,
including exactly which requests count as a "page view" (Section 4
doesn't define this precisely, so every rule there is a stated judgment
call) and the disclosed limitations of that approximation. `AdminDashboardService`
now injects `PageViewService` for two real fields:

- `totalVisits` — an unfiltered, all-time `PageView.count()`. A genuine
  `0` is now an honest reading (no page views recorded yet), replacing
  the old ambiguous "we don't track this" `null`.
- `visitsByMonth` — the last 6 UTC calendar months, oldest first, each
  keyed `"YYYY-MM"`. This is a genuinely **new** shape, not a literal
  match of `DashboardPage.tsx`'s existing hardcoded mock bars (which
  carry no real backing data or props at all — see
  `modules/page-views/README.md`'s own "Response shape this PR produces"
  section). Wiring `DashboardPage.tsx`'s chart to this real field is a
  separate, explicitly-flagged `apps/admin` follow-up — this PR is
  backend-only, per this project's established backend-then-frontend
  PR-pairing convention.

**Also still NOT built, unaffected by this resolution, same reasoning as
originally stated**: the "New users by league" breakdown and "Latest
posts" table `DashboardPage.tsx`'s own Figma design shows alongside the
four stat cards. Neither was named in this module's original task brief's
explicit stat list — "New users by league" has no league concept on
`User` at all (ties into the still-open Decision Log #6 sports-data-vendor
blocker), and "Latest posts" — while technically computable from the real
`Post` model — was left as sample data rather than silently expanding
scope. Both stay "Sample — not real data," disclosed on the page itself.

---

## Who may view: reachable by every admin role (a real divergence, stated)

`AdminJwtAuthGuard` **only** — deliberately **not** role-gated with
`AdminRolesGuard`, unlike every other Section 4.8 controller in this
codebase (`AdminModerationController`/`AdminUsersController`:
moderator/superadmin only; `AdminArticlesController`/
`AdminCategoriesController`: editor/superadmin only). The Dashboard is
the Admin Console's own landing screen — every admin role lands here
after logging in — and its three real stats straddle both jobs (New
Users/Community Users are User-table reads, `AdminUsersModule`'s own
moderator/superadmin territory; Total Articles Published is an
Article-table read, `AdminContentModule`'s editor/superadmin
territory). Restricting it to either job's roles would lock the *other*
job out of their own overview screen for no product reason — nothing in
Section 4.8, the Figma design, or the task brief calls for per-role
dashboard content. A stated decision, not a silent default; see
`admin-dashboard.controller.ts`'s own comment for the same reasoning
recorded at the guard itself.

---

## `newUsersThisMonth`'s month boundary is UTC, not local time

`month.util.ts`'s `startOfCurrentMonthUtc` uses `Date.UTC`/`getUTC*`
throughout, never `new Date(y, m, 1)` (which reads/writes local-time
calendar fields) — the same DST-safety discipline
`account-deletion-sweep.service.ts`'s own comment already documents for
a different calendar-arithmetic bug (`setMonth` vs `setUTCMonth`
silently shifting a cutoff by an hour across a DST boundary). A month
boundary computed in local time would give a *different* UTC instant
depending on the server's local timezone and time of year, which is not
what "this calendar month" should mean for a stat with no stated
timezone of its own. `month.util.spec.ts` proves the boundary directly
against hand-picked dates, including the December→January rollover and
a late-evening-UTC edge case.

---

## Testing

**Mocked suite** (`admin-dashboard.service.spec.ts`,
`admin-dashboard.controller.http.spec.ts`, `month.util.spec.ts`) covers
each of the three real aggregate queries independently (the right
`where` clause reaches Prisma for each), the "reachable by every admin
role" guard decision (tested with an `editor` token specifically, since
that's the role every *other* Section 4.8 controller would reject), and —
updated by `feat/admin-dashboard-page-views` — the now-real
`totalVisits`/`visitsByMonth` fields (`PageViewService` mocked, verifying
`getStats` passes `now` through to `getMonthlyViewCounts` and that a
genuine `0` total is preserved, never coerced back to `null`).

**No e2e spec added — reasoning stated, not a silent omission.** Every
method here is `Promise.all([prisma.user.count(...), ...])` — no
`$transaction`, no raw SQL, no new relation/constraint. None of
`test/README.md`'s three e2e triggers apply, the same conclusion
`admin-content/README.md` already reached for an analogous shape of
module (and the same conclusion `feed/README.md`'s
per-caller-viewer-state addition drew before that). The mocked unit
suite is the right, faster layer for this module's logic.

**Verification, all re-measured directly**: see the PR description for
`feat/admin-dashboard-page-views`'s exact before/after mocked-suite
counts (this module's updated tests, plus the new
`modules/page-views/*.spec.ts` files, are part of that same PR's single
before/after measurement — `nest build` + `npm run lint` both clean). The
prior `67 → 72 suites, 949 → 982 tests` figure above is this module's own
history from the PR that first built it (`sprint-5/admin-users-dashboard-backend`)
and predates this resolution.

---

## Files

```
admin-dashboard.module.ts   — wires AdminAuthFoundationModule + PageViewModule (read-only, no user-facing routes)
admin-dashboard.service.ts  — AdminDashboardService, the three real User/Article aggregates + real totalVisits/visitsByMonth via PageViewService
admin-dashboard.controller.ts — GET /admin/dashboard/stats
month.util.ts                — startOfCurrentMonthUtc, directly unit-tested
```
