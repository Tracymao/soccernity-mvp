// See page-view.interceptor.ts for how these are used, and README.md for
// the full "what counts as a page view" reasoning — none of this is
// defined by Build Plan Section 4, so every choice here is a stated
// judgment call, not an obvious default.

// Route TEMPLATES (Nest's own @Controller()/@Get() path metadata, dynamic
// segments left un-substituted — e.g. "/posts/:id") that are real, valid
// GET endpoints but do NOT represent a person loading a page in
// apps/web/apps/admin. Each is denylisted for a specific, disclosed
// reason:
//
//   - "/health" — a liveness probe (used by deploy.yml's smoke test and
//     any future uptime monitor), never hit by a real browser session.
//   - "/admin/auth/refresh" — a confirmed real case: apps/admin's own
//     `adminClient.ts` calls this transparently on a 401 retry, with no
//     user-visible navigation attached. "/auth/refresh" is included
//     alongside it on the same reasoning even though apps/web does not
//     currently call it anywhere (grep-confirmed, not assumed) — a
//     token-refresh call is never a page load regardless of which app
//     ends up invoking it, and denylisting it now costs nothing.
//   - "/notifications/unread-count" — Header.tsx re-fetches this on
//     EVERY client-side route change ([accessToken, location.key], see
//     apps/web/src/layout/Header.tsx) to keep the navbar badge current.
//     It fires once per real navigation too, but it is the badge, not
//     the page itself — counting it would double-count almost every
//     other page view a logged-in user makes.
export const PAGE_VIEW_ROUTE_DENYLIST: ReadonlySet<string> = new Set([
  '/health',
  '/auth/refresh',
  '/admin/auth/refresh',
  '/notifications/unread-count',
]);

// A request carrying this query param is a "load more" continuation of an
// already-counted view (Build Plan Section 5.5's keyset-pagination
// convention — every list endpoint in this codebase uses `?cursor=` for
// exactly this), not a fresh page load. The first page of any list
// (no cursor) still counts.
export const PAGE_VIEW_CONTINUATION_QUERY_PARAM = 'cursor';

// Default window for AdminDashboardService's `visitsByMonth` time series —
// see page-view.service.ts's getMonthlyViewCounts.
export const DEFAULT_VISITS_BY_MONTH_WINDOW = 6;
