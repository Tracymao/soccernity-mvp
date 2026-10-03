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
//
// schema/report-severity-escalation-admin-vetting-application (backend)
// added Report.severity/concernsMinor and the escalation-trail fields
// (escalatedAt/escalatedByAdminId/escalationNotes/escalatedToAuthority),
// plus a child-safety-vetting gate (services/api moderation.service.ts's
// assertChildSafetyVetted) applied to listReports (silently filters
// concernsMinor rows for a non-vetted admin — no partial/redacted row
// shape is ever returned) and to actionReport/decideAppeal (a real 403,
// CHILD_SAFETY_VETTING_REQUIRED_CODE, on DIRECT access to a
// concernsMinor report) and to the new escalateReport (403 for ANY
// non-vetted admin, regardless of the target report's own
// concernsMinor). This PR wires all of that into
// ModerationQueuePage.tsx / ReportDetailPage.tsx / AppealReviewPage.tsx.
import { AdminApiError, adminFetch } from "./adminClient";

// Mirrors services/api moderation.constants.ts exactly. apps/admin can't
// import from services/api, so this is this codebase's usual per-side
// copy (the same convention api/contest.ts's own header comment
// describes for its own types).
export const REPORT_TARGET_TYPES = ["post", "user", "comment", "banter_room"] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

// room_deactivated is valid only against a banter_room report (Decision
// Log #357); ReportDetailPage offers it only in that case.
export const REPORT_ACTIONS = [
  "content_removed",
  "warning_issued",
  "user_suspended",
  "dismissed",
  "room_deactivated",
] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

export const APPEAL_DECISIONS = ["upheld", "overturned"] as const;
export type AppealDecision = (typeof APPEAL_DECISIONS)[number];

// Mirrors services/api moderation.constants.ts's REPORT_SEVERITIES
// exactly. A plain string column, not a Prisma enum (same convention as
// status/actionTaken/appealStatus) — defaults to "medium" server-side
// when a reporter omits it.
export const REPORT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type ReportSeverity = (typeof REPORT_SEVERITIES)[number];

export const REPORT_SEVERITY_LABELS: Record<ReportSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

// The machine-readable `code` on the 403 thrown when a report concerning
// a minor is listed/actioned/appeal-reviewed by a non-child-safety-vetted
// admin, and when PATCH .../escalate is called by a non-vetted admin
// regardless of the target report's own concernsMinor value. Mirrors
// services/api moderation.constants.ts's CHILD_SAFETY_VETTING_REQUIRED_CODE.
export const CHILD_SAFETY_VETTING_REQUIRED_CODE = "child_safety_vetting_required";

// Recognises the one 403 shape that means "you are not a child-safety-
// vetted admin", distinct from every other 403/409 this module already
// surfaces verbatim (e.g. Decision Log #138's "may not review your own
// action" rejection). Used to render a dedicated restricted state rather
// than a generic inline error.
export function isChildSafetyVettingRequiredError(err: unknown): boolean {
  if (!(err instanceof AdminApiError) || err.status !== 403) return false;
  const body = err.body;
  return (
    !!body &&
    typeof body === "object" &&
    (body as { code?: unknown }).code === CHILD_SAFETY_VETTING_REQUIRED_CODE
  );
}

// Button copy, matching the original Figma-derived stub screen (node
// 5796:8635) verbatim -- also used to describe an already-recorded
// `actionTaken` value on Report Detail / Appeal Review's read-only views.
export const REPORT_ACTION_LABELS: Record<ReportAction, string> = {
  content_removed: "Remove Content",
  warning_issued: "Warn User",
  user_suspended: "Suspend User",
  dismissed: "Dismiss Report",
  room_deactivated: "Deactivate Room",
};

// The real Report row — services/api prisma/schema.prisma's `Report`
// model, over HTTP (Date fields are ISO strings, same convention every
// other apps/admin/apps/web api client uses).
export interface Report {
  id: string;
  // schema/report-severity-escalation-admin-vetting -- reporterId is now
  // OPTIONAL: a report submitted via the public, unauthenticated
  // POST /reports/public route (feat/public-report-submission) has no
  // User row behind it at all, only whatever contact info the
  // non-authenticated reporter gave.
  reporterId: string | null;
  reporterContactEmail: string | null;
  reporterContactName: string | null;
  targetType: string; // "post" | "user" | "comment" | "banter_room"
  targetId: string;
  reason: string;
  status: string; // "open" | "reviewed" | "actioned"
  createdAt: string;

  // Whether the reported content/behaviour concerns a minor — distinct
  // from severity. Gates listReports (silently filtered for a non-vetted
  // admin) and actionReport/decideAppeal (a real 403 on direct access).
  concernsMinor: boolean;
  // low | medium | high | critical — see REPORT_SEVERITIES above.
  severity: string;

  reviewedByAdminId: string | null;
  reviewedAt: string | null;
  actionTaken: string | null; // one of REPORT_ACTIONS, or null

  appealStatus: string | null; // null | "pending" | "upheld" | "overturned"
  appealReason: string | null;
  appealedAt: string | null;
  appealReviewedByAdminId: string | null;
  appealReviewedAt: string | null;

  // The escalation trail (PATCH .../escalate) — independent of
  // reviewedByAdminId/appealReviewedByAdminId; escalating is not the same
  // act as actioning or deciding an appeal, and may be recorded on a
  // report in any status. escalatedToAuthority is only ever true because
  // the ESCALATING ADMIN says so — this app never contacts anyone itself.
  escalatedAt: string | null;
  escalatedByAdminId: string | null;
  escalationNotes: string | null;
  escalatedToAuthority: boolean;
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

export interface EscalateReportInput {
  escalationNotes: string;
  escalatedToAuthority: boolean;
}

// PATCH /admin/moderation/reports/:id/escalate — restricted to
// child-safety-vetted admins, REGARDLESS of the target report's own
// concernsMinor value (see moderation.service.ts's escalateReport — a
// report can need escalating precisely because it wasn't flagged as
// concerning a minor at submission but turns out, on review, to be one).
// This endpoint records that a human has escalated the report — it does
// not itself notify or contact anyone. Deliberately callable more than
// once: escalate internally first (escalatedToAuthority: false), then
// call again once the admin has actually contacted an authority, each
// call overwriting the trail to reflect the MOST RECENT escalation
// action (no append-only history across cycles — see moderation/README.md's
// own disclosed limitation).
export function escalateReport(id: string, input: EscalateReportInput): Promise<Report> {
  return adminFetch<Report>(`/admin/moderation/reports/${id}/escalate`, {
    method: "PATCH",
    body: input,
  });
}

// GET /admin/moderation/reports/:id — the real single-resource fetch.
// There used to be no `GET /reports/:id` or `GET /admin/moderation/reports/:id`
// anywhere in services/api (confirmed by reading reports.controller.ts and
// admin-moderation.controller.ts directly — moderation/README.md's own
// endpoint table used to list only five routes), so a direct visit or
// refresh of Report Detail / Appeal Review (reached from
// ModerationQueuePage's "Review" link, which normally passes the row's
// already-fetched Report via router `state`) had no way to fetch one
// report by id. Both ReportDetailPage.tsx and AppealReviewPage.tsx now
// call this directly for that fallback — same guards as PATCH
// .../reports/:id: a non-existent id is a genuine 404, and a report where
// concernsMinor is true 403s (CHILD_SAFETY_VETTING_REQUIRED_CODE) for a
// caller who isn't child-safety-vetted — a "direct access" backstop on TOP
// of listReports' own queue-level filtering, not a replacement for it.
export function getReportById(id: string): Promise<Report> {
  return adminFetch<Report>(`/admin/moderation/reports/${id}`);
}
