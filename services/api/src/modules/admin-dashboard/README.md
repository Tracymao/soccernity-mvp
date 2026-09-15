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
  totalVisits: null;              // ALWAYS null — see the Decision Log candidate below
}
```

---

## Decision Log candidate: `totalVisits` and the visitor-statistics chart

**Flagged, not built, per the task brief's own explicit instruction —
not faked as `0` and not silently omitted.** `DashboardPage.tsx`'s Figma
design (node 110:5) also wants "Total Visits (all time)" and a
visitor-statistics chart. Neither is computable: **no page-view/visit-
tracking model or middleware exists anywhere in this codebase** —
confirmed by checking `schema.prisma` and `services/api/src/`
directly before building anything, not assumed. Building either would
mean a genuinely new event-logging model (something like a
`PageView`/`VisitEvent` entity) plus request-tracking middleware to
populate it — real, unscoped new architecture, explicitly out of this
PR's scope per the task brief's own "don't build visit/pageview
tracking in this ticket" instruction.

**`totalVisits` is an explicit `null` field in the response, never a
dropped key and never a faked `0`.** A real "no visits recorded" `0`
would be indistinguishable from "we don't track this at all" if this
field were silently `0` — an explicit `null`, present and typed, says
plainly that this stat was never computed. `DashboardPage.tsx` renders
its existing "—" placeholder for exactly this one stat, leaving the
other three real numbers untouched — not the whole dashboard falling
back to placeholders.

**Also NOT built, same reasoning, narrower scope than the task brief
asked for**: the "New users by league" breakdown and "Latest posts"
table `DashboardPage.tsx`'s own Figma design shows alongside the four
stat cards. Neither was named in the task brief's own explicit stat
list (New Users / Total Articles Published / Community Users / flag
Total Visits) — "New users by league" has no league concept on `User`
at all (ties into the still-open Decision Log #6 sports-data-vendor
blocker the rest of this codebase already flags for anything
league-shaped), and "Latest posts" — while technically computable from
the real `Post` model — was left as sample data rather than silently
expanding this PR's own scope beyond what was asked. Both stay
"Sample — not real data," disclosed on the page itself, not silently
built or silently left looking like an oversight.

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
`where` clause reaches Prisma for each), the always-`null` `totalVisits`
contract, and the "reachable by every admin role" guard decision (tested
with an `editor` token specifically, since that's the role every *other*
Section 4.8 controller would reject).

**No e2e spec added — reasoning stated, not a silent omission.** Every
method here is `Promise.all([prisma.user.count(...), ...])` — no
`$transaction`, no raw SQL, no new relation/constraint. None of
`test/README.md`'s three e2e triggers apply, the same conclusion
`admin-content/README.md` already reached for an analogous shape of
module (and the same conclusion `feed/README.md`'s
per-caller-viewer-state addition drew before that). The mocked unit
suite is the right, faster layer for this module's logic.

**Verification, all re-measured directly**: see `admin-users/README.md`'s
own matching Testing section — this module's tests are counted in that
same before/after total (67 → 72 suites, 949 → 982 tests, mocked suite;
`nest build` + `npm run lint` both clean), since both modules shipped in
one PR and were verified together, not separately.

---

## Files

```
admin-dashboard.module.ts   — wires AdminAuthFoundationModule only (read-only, no user-facing routes)
admin-dashboard.service.ts  — AdminDashboardService, the three real aggregates + the always-null totalVisits
admin-dashboard.controller.ts — GET /admin/dashboard/stats
month.util.ts                — startOfCurrentMonthUtc, directly unit-tested
```
