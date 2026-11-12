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
export const REPORT_TARGET_TYPES = [
  "post",
  "user",
  "comment",
  "banter_room",
  "grassroots_team",
  "fixture",
  // backend/b067-message-report: a message in a chat, reported by the person who received it.
  "message",
] as const;
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

// B-289 (Decision Log #483): Remove Content is a real soft removal now, and is offered for exactly these three
// target types. On any other target the server answers 400 with CONTENT_REMOVAL_NOT_APPLICABLE_CODE, so
// ReportDetailPage never offers it there (the page never decides anything else: the server is the authority).
export const CONTENT_REMOVABLE_TARGET_TYPES = ["post", "comment", "message"] as const;
export const CONTENT_REMOVAL_NOT_APPLICABLE_CODE = "content_removal_not_applicable";

export function canRemoveContent(targetType: string): boolean {
  return (CONTENT_REMOVABLE_TARGET_TYPES as readonly string[]).includes(targetType);
}

// B-291 (Decision Log #485): "Suspend User" really suspends the account behind the report, and is offered for exactly
// these four target types (a user, or the author / sender of a post, a comment or a message). On any other target the
// server answers 400 with USER_SUSPENSION_NOT_APPLICABLE_CODE. Mirrors services/api moderation.constants.ts's
// USER_SUSPENSION_TARGET_TYPES / isUserSuspensionTarget; the page never decides anything else, the server is the
// authority.
export const USER_SUSPENSION_TARGET_TYPES = ["user", "post", "comment", "message"] as const;
export const USER_SUSPENSION_NOT_APPLICABLE_CODE = "user_suspension_not_applicable";

export function isUserSuspensionTarget(targetType: string): boolean {
  return (USER_SUSPENSION_TARGET_TYPES as readonly string[]).includes(targetType);
}

// The actions the Take action row offers for a report of this target type.
export function actionsForTarget(targetType: string): ReportAction[] {
  return REPORT_ACTIONS.filter((action) => {
    if (action === "room_deactivated") return targetType === "banter_room";
    if (action === "content_removed") return canRemoveContent(targetType);
    if (action === "user_suspended") return isUserSuspensionTarget(targetType);
    return true;
  });
}

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

// B-284 (Decision Log #465): the reason category a report carries. Mirrors services/api
// moderation.constants.ts's REPORT_REASON_CATEGORIES and REPORT_REASON_CATEGORY_LABELS (the labels an admin
// reads). The one admin-side copy; reasonCategories.test.ts fails the build if it drifts from the backend list.
// Nothing here decides anything: the server returns `reasonCategory` (a key, or null for a report made before
// categories existed) and this only turns it into words.
export const REPORT_REASON_CATEGORIES = [
  "harassment_or_bullying",
  "hate_or_abusive_language",
  "threats_or_violence",
  "child_safety_concern",
  "sexual_or_inappropriate_content",
  "impersonation_or_fake_account",
  "spam_or_scam",
  "privacy_or_image_misuse",
  "other",
] as const;
export type ReportReasonCategory = (typeof REPORT_REASON_CATEGORIES)[number];

export const REPORT_REASON_CATEGORY_LABELS: Record<ReportReasonCategory, string> = {
  harassment_or_bullying: "Harassment or bullying",
  hate_or_abusive_language: "Hate or abusive language",
  threats_or_violence: "Threats or violence",
  child_safety_concern: "Child safety concern",
  sexual_or_inappropriate_content: "Sexual or inappropriate content",
  impersonation_or_fake_account: "Impersonation or fake account",
  spam_or_scam: "Spam or scam",
  privacy_or_image_misuse: "Privacy or image misuse",
  other: "Other",
};

export const REASON_CATEGORY_NOT_SET_LABEL = "Not categorised";

// null / missing -> "Not categorised" (an older report, a Grassroots sensitive-content report, a report made from a
// contact enquiry). A key this app does not know (the server added one) is shown as it came, never guessed at.
export function reasonCategoryLabel(category: string | null | undefined): string {
  if (category === null || category === undefined || category === "") return REASON_CATEGORY_NOT_SET_LABEL;
  return (REPORT_REASON_CATEGORY_LABELS as Record<string, string>)[category] ?? category;
}

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
// The stable `code` of a 4xx from the admin API, when it sent one. Errors are told apart by this, never by the
// server's message text.
export function errorCodeOf(err: unknown): string | undefined {
  if (!(err instanceof AdminApiError)) return undefined;
  const body = err.body;
  if (body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string") {
    return (body as { code: string }).code;
  }
  return undefined;
}

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

// What a recorded action reads as in a read-only row ("Action taken"), as opposed to the button that records it.
export const REPORT_ACTION_TAKEN_LABELS: Record<ReportAction, string> = {
  content_removed: "Content removed",
  warning_issued: "Warning issued",
  user_suspended: "User suspended",
  dismissed: "Dismissed",
  room_deactivated: "Room deactivated",
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
  targetType: string; // "post" | "user" | "comment" | "banter_room" | "grassroots_team" | "fixture" | "message"
  targetId: string;
  // B-284: one of REPORT_REASON_CATEGORIES, or null for a report that carries none.
  reasonCategory: string | null;
  // The reporter's free-text description. Optional on a new report (the empty string when omitted).
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
  // B-292 (Decision Log #485 (f), #492): true when staff recorded the appeal on the reported person's behalf (a
  // suspended person cannot sign in). The server sets it on every report row it returns; absent on an older server.
  appealRecordedByStaff?: boolean;
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

  // B-045 (Decision Log #398 D1, #403 item 8): the report's ACTIVE case-level
  // holds. Present ONLY on the single-report read (GET .../reports/:id); the
  // list rows and a PATCH response do not carry it, so a screen reached from
  // the queue fetches the report once to learn whether a hold is active.
  holds?: HoldView[];

  // B-046 part B: a report made by escalating a Contact Us enquiry carries `source:
  // "contact_enquiry"` (the key is absent on every other report). Its single-report read also
  // carries the enquiry it came from (null if that enquiry has gone). Such a report has no reported
  // user, so no hold can exist on it.
  source?: "contact_enquiry";
  contactEnquiry?: ReportContactEnquiry | null;

  // backend/b067-message-report: on the single-report read of a "message" report, the reported message itself
  // (and nothing else of the conversation). null if the row is gone; absent on the queue rows and on every
  // other kind of report.
  reportedMessage?: ReportedMessage | null;
  // B-286: on the same read, the messages the reporter added as context, oldest first (empty when none).
  // Absent on the queue rows and on every other kind of report.
  contextMessages?: ReportContextMessage[];
  // B-293 (Decision Log #486): true when the reported sender or any participant of the chat is under 18 and the
  // admin is not child-safety vetted. The server then returns no context messages and no original text of an edited
  // message; this only says why. Present only on the single-report read of a message report.
  contextHidden?: boolean;
}

// The one message behind a "message" report (services/api ReportedMessageView). contentText is what is
// stored NOW; originalContentText is the text as first sent (null unless the sender edited it);
// deletedForEveryone is true when the sender deleted it for both people (the text is kept for review). The
// server returns no time for the deletion.
export interface ReportedMessage {
  id: string;
  sentAt: string;
  sender: { publicName: string };
  contentText: string;
  originalContentText: string | null;
  editedAt: string | null;
  deletedForEveryone: boolean;
  // B-289: when a moderator removed the message (null = not removed). The text above is still returned in full.
  removedByModerationAt?: string | null;
}

// One message the reporter added as context to a message report (services/api ReportContextMessageView).
// Same fields as ReportedMessage, plus whether the reporter themselves sent it; no conversation id, recipient or
// sender id.
export interface ReportContextMessage extends ReportedMessage {
  sentByReporter: boolean;
}

// The enquiry behind an "enquiry" report (services/api ReportContactEnquiryView). Name and email are
// what the sender typed.
export interface ReportContactEnquiry {
  id: string;
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
  userId: string | null;
}

// One account hold as the hold routes return it (services/api
// moderation-holds.service.ts HoldView). No reason is ever returned.
export interface HoldView {
  id: string;
  userId: string;
  type: string; // "legal_hold" | "bad_faith"
  reportId: string | null;
  placedBy: string;
  placedAt: string;
  expiresAt: string | null;
  liftedAt: string | null;
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

// B-292 (Decision Log #485 (f), #492): the reason bound for a recorded appeal (services/api AppealReportDto: 1 to
// 500 characters). Stable codes of the refusals the dialog tells apart, never by message text.
export const APPEAL_REASON_MAX_LENGTH = 500;
export const APPEAL_WINDOW_CLOSED_CODE = "appeal_window_closed";
export const STAFF_APPEAL_NOT_APPLICABLE_CODE = "staff_appeal_not_applicable";
export const REPORTED_ACCOUNT_UNAVAILABLE_CODE = "reported_account_unavailable";
export const APPEAL_RECORDER_CANNOT_DECIDE_CODE = "appeal_recorder_cannot_decide";

// POST /admin/moderation/reports/:id/appeal -- staff record an appeal on the reported person's behalf. Only for a
// report whose action was user_suspended and that has no appeal yet, and only inside the appeal window (403
// appeal_window_closed, with the server's own message). Same vetting gate as acting on the report (403
// child_safety_vetting_required). Returns the updated report (appealStatus "pending", appealRecordedByStaff true).
export function recordAppeal(id: string, reason: string): Promise<Report> {
  return adminFetch<Report>(`/admin/moderation/reports/${id}/appeal`, {
    method: "POST",
    body: { reason },
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

// The reason bound the hold routes enforce (services/api HoldReasonDto): 10 to
// 500 characters, trimmed server-side.
export const HOLD_REASON_MIN_LENGTH = 10;
export const HOLD_REASON_MAX_LENGTH = 500;

// POST /admin/moderation/reports/:id/holds/bad-faith -- holds the REPORTER's
// account in full for the bad-faith period. Moderator / superadmin; a report
// that concerns a minor also needs a child-safety-vetted admin (the same 403
// code actionReport gives). Notifies nobody. Coded 409s (reporter_has_no_account,
// account_already_deleted, hold_already_active) come back as AdminApiError with
// the server's own message.
export function placeBadFaithHold(reportId: string, reason: string): Promise<{ holds: HoldView[] }> {
  return adminFetch<{ holds: HoldView[] }>(`/admin/moderation/reports/${reportId}/holds/bad-faith`, {
    method: "POST",
    body: { reason },
  });
}

// POST /admin/moderation/reports/:id/holds/legal -- holds every party of the
// report that has an account (reporter and reported). Same guards as above.
export function placeLegalHold(reportId: string, reason: string): Promise<{ holds: HoldView[] }> {
  return adminFetch<{ holds: HoldView[] }>(`/admin/moderation/reports/${reportId}/holds/legal`, {
    method: "POST",
    body: { reason },
  });
}

// PATCH /admin/moderation/holds/:holdId/lift -- lifts ONE hold (one account's), either
// type. Needs a reason of 10 to 500 characters (Decision Log #403 item 8). Moderator /
// superadmin; a hold on a report that concerns a minor also needs a child-safety-vetted
// admin (the same 403 code as above). Notifies nobody. Coded 404 hold_not_found and 409
// hold_already_lifted / hold_expired come back as AdminApiError with the server's message.
export function liftHold(holdId: string, reason: string): Promise<{ hold: HoldView }> {
  return adminFetch<{ hold: HoldView }>(`/admin/moderation/holds/${holdId}/lift`, {
    method: "PATCH",
    body: { reason },
  });
}

// B-289 (Decision Log #483): has a moderator removed the content this report is about? For a message the
// single-report read says so itself (`reportedMessage.removedByModerationAt`). A post or comment report carries
// no such field, so it is read from the report's own decision: an actioned `content_removed` (an overturned
// appeal clears `actionTaken` and reopens the report, so a restored item stops reading as removed).
export function isContentRemoved(
  report: Pick<Report, "targetType" | "status" | "actionTaken" | "reportedMessage">,
): boolean {
  if (report.targetType === "message" && report.reportedMessage) {
    return Boolean(report.reportedMessage.removedByModerationAt);
  }
  if (!canRemoveContent(report.targetType)) return false;
  return report.status === "actioned" && report.actionTaken === "content_removed";
}
