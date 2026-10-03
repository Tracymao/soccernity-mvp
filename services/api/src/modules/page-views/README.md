# page-views module

Build target: **feat/admin-dashboard-page-views** — resolves **Decision
Log #306** (`admin-dashboard/README.md`'s own candidate: "no page-view/
visit-tracking model or middleware exists anywhere in this codebase,"
flagged when `AdminDashboardService` was first built and left `totalVisits`
as an explicit `null`).

Backs `apps/admin/src/pages/DashboardPage.tsx`'s "Total Visits (all time)"
stat card and its "Visitor statistics" chart section — both were `—`/sample
data before this PR. **This PR is backend-only** — `apps/admin`'s own
frontend wiring of `visitsByMonth` into a real chart is a separate,
explicitly-flagged follow-up (see "Response shape this PR produces" below).

---

## Genuinely new architecture beyond Build Plan Section 3's fixed
## 20-entity list — flagged, per CLAUDE.md's "the data model is a fixed
## spec" rule

`PageView` is a brand-new Prisma model with no precedent in Section 3.
Same discipline every prior schema-addition PR in this project has
followed (`Follow.createdAt`, `BanterRoomMember.joinedAt`,
`AgeReclassificationLog`, `MediaAsset.key`, etc.) — this is a Decision
Log candidate, not something added silently. See `schema.prisma`'s own
comment on the model for the full reasoning.

---

## Strictly anonymous aggregate counting — a hard constraint, not a style
## preference

This is a minors' platform (CLAUDE.md non-negotiable #1). `PageView`
deliberately carries **only**:

- `id`
- `route` — a coarse, low-cardinality route TEMPLATE (see below)
- `occurredAt`

and **nothing else**. Specifically, it holds **no**:

- `userId` / `viewerId` / any foreign key to `User` at all — contrast
  `PostView` (an existing, unrelated model), which *does* record an
  optional `viewerId`, for a genuinely different purpose (per-post view
  counts on content a specific person chose to open). `PageView` is not a
  variant of that model and should never be extended to look like one
  without a fresh DPIA review.
- IP address.
- Session id / cookie / device fingerprint of any kind.
- User-agent string.

Adding any of the above would open a new personal-data-collection
question `docs/sprint-1-dpia-outline-draft.md` has never reviewed — out of
scope for this PR by design, not an oversight. If a future feature
genuinely needs per-user or per-session analytics, that is a new, separate
DPIA-reviewed decision, not an extension of this model.

---

## What counts as a "page view" — Section 4 doesn't define this, so every
## rule here is a stated judgment call

`apps/web` and `apps/admin` are both client-side-rendered SPAs. Neither
app's own client-side route changes (e.g. navigating from `/community` to
`/clubs`) ever reach `services/api` at all — there is no literal "page
load" event this server can observe directly. The best available
server-side signal is: **a `GET` request to a real, matched Nest route,
made by a real client, that isn't one of the specific non-navigation cases
excluded below.**

`PageViewInterceptor` (registered globally via `APP_INTERCEPTOR` in
`page-view.module.ts` — see that file's own comment for why this is
cross-cutting infra, the same category as `SentryModule`/`ScheduleModule`
in `app.module.ts`, not a feature tied to one sprint) applies these rules,
in order, to every request in the app:

1. **Only `GET`.** Every mutating verb (`POST`/`PATCH`/`DELETE`) is an
   action, never a page load, per this PR's own task brief.
2. **Not a denylisted route.** `page-view.constants.ts`'s
   `PAGE_VIEW_ROUTE_DENYLIST` excludes a small, explicit, reasoned list of
   real `GET` routes that are not navigation: `/health` (a liveness
   probe), `/auth/refresh` / `/admin/auth/refresh` (silent background
   token refresh — `apps/admin/src/api/adminClient.ts` genuinely calls
   the admin one transparently on a 401 retry; `apps/web` does not
   currently call the user-facing one at all, grep-confirmed, but a
   token-refresh call is never a page load regardless of which app ends
   up invoking it), and `/notifications/unread-count` (`Header.tsx`
   re-fetches this on **every** client-side route change to keep the
   navbar badge current — it is the badge, not the page, and counting it
   would double-count almost every other page view a logged-in user
   makes).
3. **Not a pagination continuation.** A request carrying a `cursor` query
   param (Build Plan Section 5.5's keyset-pagination convention — every
   list endpoint in this codebase uses this) is a "load more" continuation
   of an already-counted view, not a fresh page load. The first page of
   any list (no `cursor`) still counts.
4. **A genuinely successful response.** Only a 2xx status code counts — a
   request that errored (thrown exception, or a handler that deliberately
   returned a non-2xx status) never actually rendered a real page.

**The route itself is derived from Nest's own routing metadata**
(`Reflect.getMetadata(PATH_METADATA, ...)` on `context.getClass()`/
`context.getHandler()` — the literal `@Controller()`/`@Get()` path
declarations, e.g. `/posts/:id`), **not** the raw Express request path or
`request.route` — this is deliberately framework-level rather than
HTTP-adapter-internals-dependent (`ExecutionContext.getClass()`/
`getHandler()` are guaranteed by Nest regardless of the underlying HTTP
adapter), and the result is exactly the low-cardinality,
no-real-ids-baked-in shape `PageView.route` requires by construction — no
separate ID-stripping/normalization step is needed. See
`page-view.interceptor.ts`'s `buildRouteTemplate()`.

Recording itself is **fire-and-forget** (`PageViewService.recordView()`
never returns a Promise the caller awaits) — a failed insert is logged and
silently dropped, on purpose: this must never add latency to, or ever
fail, the real response it's piggybacking on. An undercount here is a far
smaller problem than adding a new failure mode to every `GET` request in
the app.

### Known limitations — disclosed, not silently accepted

This is a deliberate **approximation**, not a precise page-view count:

- **Widget/background reads are indistinguishable from a real page visit
  at the URL level.** e.g. `GET /users/:id` is called both when
  `ProfilePage` is genuinely visited *and* as a prefetch inside
  `Header.tsx`'s nav drawer; `GET /contest/current` is called both by the
  real `/contest` page *and* embedded inside `PostComposer`/the
  Leaderboard's Contest tab as an eligibility/state check. This
  interceptor cannot tell these apart, so some routes will over-count
  relative to genuine page visits.
- **No client-side navigation is ever observed directly.** A route with
  no server round-trip on its own (e.g. `apps/web`'s marketing `/` home
  page, which renders entirely from hardcoded content with no API call —
  see `HomePage.tsx`) is under-counted or not counted at all.
- **One person refreshing the same page repeatedly is indistinguishable
  from many different people each visiting once.** There is no
  session/device concept in this model at all (by design, see "Strictly
  anonymous" above), so `PageView` counts *requests*, not *unique
  visitors*.

A precise, unique-visitor-aware analytics system would need either
explicit client-side navigation beacons or some form of session tracking
— both are real, separate, unscoped architecture decisions, deliberately
not built here.

---

## Response shape this PR produces — a genuinely NEW shape, not a literal
## match of anything that already exists on the frontend

`GET /admin/dashboard/stats` now returns:

```ts
{
  newUsersThisMonth: number;
  totalArticlesPublished: number;
  communityUsersTotal: number;
  totalVisits: number;                          // was: null (Decision Log #306)
  visitsByMonth: Array<{ month: string; count: number }>; // NEW
}
```

`totalVisits` is `PageViewService.getTotalViewCount()` — an unfiltered,
all-time `PageView.count()`. A genuine `0` is now an **honest** reading
(no page views recorded yet), not the old ambiguous "we don't track
this."

`visitsByMonth` is `PageViewService.getMonthlyViewCounts()` — the last 6
UTC calendar months (`DEFAULT_VISITS_BY_MONTH_WINDOW`), oldest first,
ending with the current month, each entry keyed `"YYYY-MM"` (e.g.
`"2026-09"`) — a plain, chart-library-agnostic key, not a pre-formatted
display label ("Sep").

**Why this doesn't try to literally match `DashboardPage.tsx`'s existing
mock chart**: that chart (`admin-dashboard__chart-bars`, five bars at
hardcoded `[40, 65, 50, 80, 60]` percentage heights, labelled
`Jan`/`Feb`/`Mar`/`Apr`/`May`) has **no real props or data shape to match
at all** — it is 100% hardcoded sample markup with zero connection to any
API response (confirmed by reading the file directly, not assumed). There
was nothing to be a "drop-in swap" for. `visitsByMonth`'s shape is
designed to be easy to adapt into that chart (or any other) — a follow-up
`figma-to-code`-style PR needs to:

1. Wire `DashboardPage.tsx`'s "Total Visits" stat card to the now-real
   `totalVisits` field (currently renders `data?.totalVisits ?? undefined`,
   which already handles a real number correctly — no change needed
   there beyond removing the "—" fallback reasoning from its own header
   comment).
2. Replace the "Visitor statistics" section's hardcoded bars with a real
   render of `visitsByMonth`, converting each `"YYYY-MM"` key into
   whatever label format the chart wants (e.g. `"Sep"` via
   `new Date(...)` or a small formatter) and scaling bar heights off the
   real `count` values instead of the hardcoded percentages.

This PR does **not** touch `apps/admin` — per this project's established
backend-then-frontend PR-pairing convention (see e.g.
`sprint-2/feed-per-user-flags` → `sprint-2/postcard-viewer-state-wiring`,
or `sprint-2/clubs-joined-flag` → `sprint-2/clubpicker-joined-wiring` in
CLAUDE.md's own history) and this task's own explicit "backend-only"
instruction.

---

## Testing

**Mocked suite** (`page-view.service.spec.ts`,
`page-view.interceptor.spec.ts`) covers:

- `PageViewService.recordView` writes only `{ route }` (no other field),
  is genuinely fire-and-forget (a rejected `create()` is caught/logged,
  never thrown back at the caller, never returns a Promise the caller is
  expected to await).
- `getTotalViewCount`/`getMonthlyViewCounts` — the default 6-month
  window, the UTC month-boundary math (including the ISO-year rollback
  case, e.g. Nov 2025 → Dec 2025 → Jan 2026), and a custom `months`
  override.
- `PageViewInterceptor` — every rule above (GET-only, the four
  denylisted routes, the `cursor` exclusion, the 2xx-only rule, a thrown
  handler never being recorded, a non-HTTP execution context being
  skipped entirely without ever touching `getClass()`/`getHandler()`) —
  using real `Reflect.defineMetadata`/`getMetadata` calls (not a
  `jest.spyOn` stand-in), so these tests exercise the exact metadata
  shape Nest's own `@Controller()`/`@Get()` decorators actually produce.

`admin-dashboard.service.spec.ts`/`admin-dashboard.controller.http.spec.ts`
are updated in the same PR to mock the now-injected `PageViewService` and
assert the new `totalVisits`/`visitsByMonth` shape.

**No e2e spec added — reasoning stated, not a silent omission.**
`PageViewService.recordView`/`getTotalViewCount` are plain
`prisma.pageView.create()`/`count()` calls with no relation, no raw SQL,
and no transaction; `getMonthlyViewCounts` is `Promise.all([...count(),
...])`, the same shape `admin-dashboard.service.ts`'s own three
aggregates already use (and that module's own README already reached the
same "no e2e needed" conclusion for an analogous shape of change). None of
`test/README.md`'s three e2e triggers (raw SQL, transaction/isolation-level
reasoning, a genuinely novel relation/constraint) apply. The mocked unit
suite is the right, faster layer for this module's logic. The migration
itself (a single new table, no FK, no constraint beyond its own primary
key and two plain indexes) was applied and verified directly against both
the dev and test Postgres databases via `prisma migrate dev`/`migrate
deploy` — see the PR description for the exact `psql \d "PageView"`
output on both.

---

## Files

```
page-view.module.ts        — registers PageViewInterceptor globally via APP_INTERCEPTOR; exports PageViewService
page-view.service.ts       — PageViewService: recordView (fire-and-forget), getTotalViewCount, getMonthlyViewCounts
page-view.interceptor.ts   — PageViewInterceptor: decides which GET requests count as a page view, and records them
page-view.constants.ts     — the route denylist, the pagination-continuation query param, the default month window
```
