// Moderation admin client — services/api `/admin/moderation/reports*`
// (Build Plan Section 4.8 / Section 8.4, Decision Log #135/#189, built by
// sprint-5/admin-moderation-queue-backend). This PR wires
// ModerationQueuePage.tsx / ReportDetailPage.tsx / AppealReviewPage.tsx to
// it — see that PR's README (services/api/src/modules/moderation/README.md)
// for the full guard/state-machine reasoning; response shapes mirror
// moderation.service.ts's `Report` (the real Prisma model) exactly.
//
// Every call goes through adminFetch (isolated admin auth path,
// ADMIN_JWT_SECRET, transparent 401→refresh — adminClient.ts /
// Decision Log #54). Every route here requires `moderator` or
// `superadmin` — an `editor` token gets a real 403 (AdminRolesGuard).
import { adminFetch } from "./adminClient";

// Mirrors services/api moderation.constants.ts exactly. apps/admin can't
// import from services/api, so this is this codebase's usual per-side
// copy (the same convention api/contest.ts's own header comment
// describes for its own types).
export const REPORT_TARGET_TYPES = ["post", "user", "comment"] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_ACTIONS = [
  "content_removed",
  "warning_issued",
  "user_suspended",
  "dismissed",
] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

export const APPEAL_DECISIONS = ["upheld", "overturned"] as const;
export type AppealDecision = (typeof APPEAL_DECISIONS)[number];

// Button copy, matching the original Figma-derived stub screen (node
// 5796:8635) verbatim -- also used to describe an already-recorded
// `actionTaken` value on Report Detail / Appeal Review's read-only views.
export const REPORT_ACTION_LABELS: Record<ReportAction, string> = {
  content_removed: "Remove Content",
  warning_issued: "Warn User",
  user_suspended: "Suspend User",
  dismissed: "Dismiss Report",
};

// The real Report row — services/api prisma/schema.prisma's `Report`
// model, over HTTP (Date fields are ISO strings, same convention every
// other apps/admin/apps/web api client uses).
export interface Report {
  id: string;
  reporterId: string;
  targetType: string; // "post" | "user" | "comment"
  targetId: string;
  reason: string;
  status: string; // "open" | "reviewed" | "actioned"
  createdAt: string;

  reviewedByAdminId: string | null;
  reviewedAt: string | null;
  actionTaken: string | null; // one of REPORT_ACTIONS, or null

  appealStatus: string | null; // null | "pending" | "upheld" | "overturned"
  appealReason: string | null;
  appealedAt: string | null;
  appealReviewedByAdminId: string | null;
  appealReviewedAt: string | null;
}

export interface ReportListPage {
  items: Report[];
  nextCursor: string | null;
}

// GET /admin/moderation/reports — keyset-paginated, optional exact-match
// `status` filter. There is no `appealStatus` filter on the backend
// (list-reports-query.dto.ts) — the "Appeals" tab filters `status:
// 'actioned'` results down to `appealStatus === 'pending'` client-side.
export function listReports(query: {
  status?: "open" | "reviewed" | "actioned";
  cursor?: string;
  limit?: number;
} = {}): Promise<ReportListPage> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return adminFetch<ReportListPage>(`/admin/moderation/reports${qs ? `?${qs}` : ""}`);
}

// PATCH /admin/moderation/reports/:id — only reachable on an 'open'
// report (a 409 otherwise, e.g. a stale second click). Recording an
// action does NOT itself enforce it (no soft-delete/suspend mechanism
// exists yet) — see moderation/README.md's disclosed-limitation section;
// the queue/detail screens surface that as a UI note, not silently.
export function actionReport(id: string, action: ReportAction): Promise<Report> {
  return adminFetch<Report>(`/admin/moderation/reports/${id}`, {
    method: "PATCH",
    body: { action },
  });
}

// PATCH /admin/moderation/reports/:id/appeal — Decision Log #138,
// hard-enforced server-side: the admin who actioned the original report
// gets a real 403 if they try to decide its appeal.
export function decideAppeal(id: string, decision: AppealDecision): Promise<Report> {
  return adminFetch<Report>(`/admin/moderation/reports/${id}/appeal`, {
    method: "PATCH",
    body: { decision },
  });
}

// --- Decision Log candidate #4 (this PR) -----------------------------
//
// There is no `GET /reports/:id` or `GET /admin/moderation/reports/:id`
// anywhere in services/api — confirmed by reading reports.controller.ts
// and admin-moderation.controller.ts directly (moderation/README.md's
// own endpoint table lists only the five routes above). Report Detail
// and Appeal Review both need a single report by id, reached by clicking
// "Review" on a Moderation Queue row.
//
// This is flagged here rather than silently adding a backend endpoint
// (out of scope for a frontend-only PR) or silently degrading to
// "sample data" the way the old stub screens did. The chosen approach:
// the Queue passes the full `Report` it already has via router `state`
// (react-router's `Link to={...} state={{ report }}`) — the same
// pattern apps/web's MessagesPage.tsx/NewConversationPage.tsx use to
// hand a `Conversation`'s otherParticipant to ConversationPage.tsx
// without a dedicated single-resource GET. `findReportById` below is
// the fallback for a DIRECT visit or a page refresh (no router state):
// it re-lists the one status bucket the target page cares about
// (`status: 'open'` for Report Detail, `status: 'actioned'` for Appeal
// Review) and searches client-side for the matching id, bounded to a
// few pages so a very large open-report backlog can't turn a refresh
// into an unbounded crawl. If the report isn't found within that bound,
// the page shows an honest "open it from the queue instead" state
// rather than fabricating one — same discipline as the rest of this
// codebase's "don't silently paper over a real gap" precedent.
//
// A real `GET /admin/moderation/reports/:id` would remove this
// workaround entirely and is the more correct long-term fix; recorded
// here as Decision Log candidate #4 (moderation module) for a founder
// call, per the task brief's own instruction not to silently add one.
const FIND_BY_ID_MAX_PAGES = 5;

export async function findReportById(
  id: string,
  status: "open" | "reviewed" | "actioned",
): Promise<Report | null> {
  let cursor: string | undefined;
  for (let page = 0; page < FIND_BY_ID_MAX_PAGES; page += 1) {
    const result = await listReports({ status, cursor, limit: 50 });
    const found = result.items.find((r) => r.id === id);
    if (found) return found;
    if (!result.nextCursor) return null;
    cursor = result.nextCursor;
  }
  return null;
}
