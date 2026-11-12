// Audit log client -- services/api `GET /admin/action-log` (backend/admin-action-log-read, PR #607; Decision Log #464,
// option B). EVERY admin role may call it. What comes back is decided entirely on the server: a superadmin reads
// every row, any other admin only the rows of their own actions, and rows about a minor or a guardian notice only
// reach a child-safety-vetted admin (left out of the query, so a page has no gap and nothing hints they exist).
// The client enforces no rule of its own.
//
// Shapes mirror admin-action-log-read.service.ts (dates are ISO strings over HTTP). Notes are returned exactly as
// stored.
import { adminFetch } from "./adminClient";

export interface ActionLogItem {
  id: string;
  createdAt: string;
  actor: { id: string; displayName: string };
  action: string;
  targetType: string;
  targetId: string;
  notes: string | null;
}

export interface ActionLogPage {
  items: ActionLogItem[];
  nextCursor: string | null;
}

export interface ActionLogQuery {
  cursor?: string;
  limit?: number;
  /** One of ACTION_KINDS. */
  action?: string;
  /** YYYY-MM-DD, inclusive. */
  from?: string;
  /** YYYY-MM-DD, inclusive (the server covers that whole UTC day). */
  to?: string;
  /** Superadmin only: another admin's id. For any other role the server answers 400 admin_action_log_admin_filter_not_allowed. */
  adminId?: string;
}

// GET /admin/action-log -- newest first, keyset cursor.
export function listActionLog(query: ActionLogQuery = {}): Promise<ActionLogPage> {
  const params = new URLSearchParams();
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  if (query.action) params.set("action", query.action);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.adminId) params.set("adminId", query.adminId);
  const qs = params.toString();
  return adminFetch<ActionLogPage>(`/admin/action-log${qs ? `?${qs}` : ""}`);
}

// The server's stable 400 codes (admin-action-log-read.constants.ts), read from the body, never the message.
export const ACTION_LOG_DATE_INVALID_CODE = "admin_action_log_date_invalid";
export const ACTION_LOG_RANGE_INVALID_CODE = "admin_action_log_range_invalid";

/** The `code` the server put on a 400 body, if any. */
export function actionLogErrorCode(body: unknown): string | null {
  if (body && typeof body === "object" && "code" in body) {
    const code = (body as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// The action kinds the Action filter offers. There is no endpoint that lists them, so this is a copy of
// services/api ADMIN_ACTION_LOG_ACTIONS (the same per-side copy every api/*.ts file in this app keeps). An
// unknown action coming back from the server is shown as its raw key. The labels are this app's wording (Figma
// "Audit log" frames use "Report actioned", "Two-factor reset", ...).
// ---------------------------------------------------------------------------------------------------------------

export const ACTION_KINDS: { value: string; label: string }[] = [
  { value: "report.actioned", label: "Report actioned" },
  { value: "report.appeal_decided", label: "Appeal decided" },
  { value: "report.appeal_recorded", label: "Appeal recorded" },
  { value: "report.escalated", label: "Report escalated" },
  { value: "admin_user.child_safety_vetting_updated", label: "Child-safety vetting changed" },
  { value: "user.status_updated", label: "User status changed" },
  { value: "guardian.incorrect_details_resolved", label: "Incorrect-details report resolved" },
  { value: "user.dob_viewed", label: "Date of birth viewed" },
  { value: "user.dob_corrected", label: "Date of birth corrected" },
  { value: "user.username_revoked", label: "Username revoked" },
  { value: "user.username_review_decided", label: "Username review decided" },
  { value: "user.guardian_notices_withheld", label: "Guardian notices withheld" },
  { value: "user.guardian_notices_cleared", label: "Guardian notices restored" },
  { value: "user.guardian_notices_reviewed", label: "Guardian notices reviewed" },
  { value: "account_hold.bad_faith_placed", label: "Bad-faith hold placed" },
  { value: "account_hold.legal_hold_placed", label: "Legal hold placed" },
  { value: "account_hold.lifted", label: "Hold lifted" },
  { value: "contact_enquiry.handled", label: "Enquiry marked handled" },
  { value: "contact_enquiry.reopened", label: "Enquiry reopened" },
  { value: "contact_enquiry.escalated", label: "Enquiry escalated" },
  { value: "admin_user.role_changed", label: "Staff role changed" },
  { value: "admin_user.created", label: "Staff account created" },
  { value: "admin_user.status_updated", label: "Staff account status changed" },
  { value: "admin_user.two_factor_reset", label: "Two-factor reset" },
  { value: "contest_cycle.created", label: "Contest created" },
  { value: "contest_cycle.updated", label: "Contest edited" },
  { value: "media.approved", label: "Media approved" },
  { value: "media.rejected", label: "Media rejected" },
  { value: "admin.search_performed", label: "Search performed" },
];

// The actions the server never returns to an admin who is not child-safety vetted (guardian notices, date of
// birth, incorrect-details resolution). Used ONLY to leave them out of the Action dropdown for such an admin, so
// the list does not offer a kind that can never have rows. It filters nothing the server returns.
export const CHILD_SAFETY_ACTION_KINDS: readonly string[] = [
  "user.guardian_notices_withheld",
  "user.guardian_notices_cleared",
  "user.guardian_notices_reviewed",
  "user.dob_viewed",
  "user.dob_corrected",
  "guardian.incorrect_details_resolved",
];

export function actionLabel(action: string): string {
  return ACTION_KINDS.find((kind) => kind.value === action)?.label ?? action;
}

export const TARGET_TYPE_LABELS: Record<string, string> = {
  report: "Report",
  admin_user: "Staff",
  user: "User",
  contest_cycle: "Contest",
  post_media: "Media",
  profile_image: "Profile picture",
  contact_enquiry: "Contact enquiry",
  search: "Search",
};

export function targetTypeLabel(targetType: string): string {
  return TARGET_TYPE_LABELS[targetType] ?? targetType;
}

// A profile-picture decision (B-037) is stored as media.approved / media.rejected on target type "profile_image"
// with the PERSON's user id as the target and the kind in the notes: "avatar" or "cover" when approved,
// "avatar: <reason>" or "cover: <reason>" when rejected. These helpers only make that readable; they hide no row
// (the server decides which rows an admin gets).
export interface ProfileImageRowText {
  /** "Profile picture" or "Cover photo". */
  typeLabel: string;
  /** "Profile picture approved" / "Cover photo rejected". */
  actionText: string;
  /** The rejection reason, or null when there is none (an approval). */
  reason: string | null;
}

export function profileImageRowText(item: Pick<ActionLogItem, "action" | "notes">): ProfileImageRowText {
  const notes = item.notes ?? "";
  const kind = notes.startsWith("cover") ? "cover" : "avatar";
  const typeLabel = kind === "cover" ? "Cover photo" : "Profile picture";
  const colon = notes.indexOf(":");
  const reason = colon >= 0 && notes.slice(colon + 1).trim() ? notes.slice(colon + 1).trim() : null;
  const verb = item.action === "media.rejected" ? "rejected" : item.action === "media.approved" ? "approved" : null;
  return { typeLabel, actionText: verb ? `${typeLabel} ${verb}` : actionLabel(item.action), reason };
}

// Where a row's TARGET opens: the existing detail screen for it. A search row has no target to open, and an
// unknown target type is plain text.
export function targetPath(targetType: string, targetId: string): string | null {
  switch (targetType) {
    case "report":
      return `/moderation/reports/${targetId}`;
    case "admin_user":
      return `/settings/roles/edit/${targetId}`;
    case "contact_enquiry":
      return `/moderation/contact-enquiries/${targetId}`;
    case "post_media":
      return `/moderation/media/${targetId}`;
    case "user":
      return `/users/${targetId}`;
    case "profile_image":
      // B-037: a profile-picture decision is about a person; its targetId is their user id.
      return `/users/${targetId}`;
    case "contest_cycle":
      return `/contest/cycles/${targetId}`;
    default:
      return null;
  }
}
