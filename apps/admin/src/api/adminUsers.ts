// Admin Users client — services/api `/admin/users*` (Build Plan Section
// 4.8, built by sprint-5/admin-users-dashboard-backend). Wires
// UsersPage.tsx to it — see that PR's README
// (services/api/src/modules/admin-users/README.md) for the full guard/
// schema reasoning; response shapes mirror admin-users.service.ts's
// `UserListItem`/`UpdateUserStatusResult` exactly.
//
// Every call goes through adminFetch (isolated admin auth path,
// ADMIN_JWT_SECRET, transparent 401→refresh — adminClient.ts /
// Decision Log #54). Every route here requires `moderator` or
// `superadmin` — an `editor` token gets a real 403 (AdminRolesGuard),
// mirroring api/moderation.ts's own precedent, not api/adminContent.ts's
// ('editor', 'superadmin').
import { adminFetch } from "./adminClient";

// Mirrors services/api admin-users.constants.ts exactly (apps/admin
// can't import from services/api — this codebase's usual per-side copy,
// the same convention api/moderation.ts/api/adminContent.ts already
// follow for their own constants).
export const ADMIN_USER_WRITE_STATUSES = ["active", "suspended"] as const;
export type AdminUserWriteStatus = (typeof ADMIN_USER_WRITE_STATUSES)[number];

export const ADMIN_USER_ACTIONS = [...ADMIN_USER_WRITE_STATUSES, "deleted"] as const;
export type AdminUserAction = (typeof ADMIN_USER_ACTIONS)[number];

export const ADMIN_USER_FILTER_STATUSES = ["active", "deactivated", "pending_deletion", "suspended"] as const;
export type AdminUserFilterStatus = (typeof ADMIN_USER_FILTER_STATUSES)[number];

// The real User row, list-shaped — services/api's own USER_LIST_SELECT
// (admin-users.service.ts). Admins see the real displayName AND the
// optional username (profile/username-column-and-display-convention) --
// the admin console is not an "other user" surface, so no publicName.
export interface AdminUserListItem {
  id: string;
  displayName: string;
  username: string | null;
  email: string;
  accountStatus: string; // one of ADMIN_USER_FILTER_STATUSES
  createdAt: string;
}

export interface AdminUserListPage {
  items: AdminUserListItem[];
  nextCursor: string | null;
}

export type UpdateUserStatusResult = { deleted: true; id: string } | { deleted: false; user: AdminUserListItem };

// GET /admin/users — keyset-paginated, one optional exact-match `status`
// filter (any of the four real accountStatus values — broader than what
// updateUserStatus below may WRITE).
export function listUsers(
  query: { status?: AdminUserFilterStatus; cursor?: string; limit?: number } = {},
): Promise<AdminUserListPage> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return adminFetch<AdminUserListPage>(`/admin/users${qs ? `?${qs}` : ""}`);
}

// PATCH /admin/users/:id — exactly one action per call. `active`/
// `suspended` return `{ deleted: false, user }`; `deleted` returns
// `{ deleted: true, id }` (the row is genuinely gone — nothing left to
// return but its id). Never `deactivated`/`pending_deletion` — those are
// self-service-only states this route cannot write (a real 400 if sent;
// see admin-users.constants.ts's own comment on the codebase side).
export function updateUserStatus(id: string, status: AdminUserAction): Promise<UpdateUserStatusResult> {
  return adminFetch<UpdateUserStatusResult>(`/admin/users/${id}`, { method: "PATCH", body: { status } });
}

// --- B-109 / B-103: single-user read and audited date-of-birth correction ---
//
// Mirrors services/api's admin-user-detail.service.ts (`AdminUserDetail`) and
// admin-user-dob-correction.service.ts (`DobCorrectionResult`).
//
// AUDIT SIDE EFFECT YOU MUST KNOW ABOUT: GET /admin/users/:id decrypts the
// date of birth server-side and writes a `user.dob_viewed` audit row for EVERY
// response that contains one, with no way to ask for the record without it.
// So every call to getUserDetail() below is an audited DOB read, whether or not
// the screen shows the date. Call it only when a screen needs the record.
export type AdminAgeTier = "under_13" | "under_16" | "under_18" | "adult";

export interface AdminUserDetail {
  id: string;
  email: string;
  displayName: string;
  username: string | null;
  role: string;
  accountStatus: string;
  verificationStatus: string;
  isMinor: boolean;
  isUnder16: boolean;
  /** 'YYYY-MM-DD'; null only for an anonymised account. */
  dateOfBirth: string | null;
  ageTier: AdminAgeTier | null;
  createdAt: string;
  pendingDeletionAt: string | null;
  guardian: {
    name: string;
    email: string;
    relationship: string;
    consentStatus: string;
    incorrectDetailsReportedAt: string | null;
  } | null;
}

export function getUserDetail(id: string): Promise<AdminUserDetail> {
  return adminFetch<AdminUserDetail>(`/admin/users/${id}`);
}

// --- B-129: User Detail without the date of birth ---
//
// GET /admin/users/:id/summary (services/api admin-user-detail.service.ts,
// `AdminUserSummary`). It never selects the date of birth, so it writes no
// `user.dob_viewed` audit row. The User Detail screen reads THIS; only the
// date-of-birth correction form reads getUserDetail() above.
export interface AdminUserSummary {
  id: string;
  email: string;
  displayName: string;
  username: string | null;
  role: string;
  accountStatus: string;
  verificationStatus: string;
  isMinor: boolean;
  isUnder16: boolean;
  createdAt: string;
  pendingDeletionAt: string | null;
  safeguardingCountry: {
    declared: string | null;
    derived: string | null;
    method: string | null;
    derivedAt: string | null;
  };
  guardian: {
    name: string;
    email: string;
    relationship: string;
    consentStatus: string;
    consentDeclineSource: string | null;
    consentTimestamp: string | null;
    consentTokenExpiresAt: string;
    incorrectDetailsReportedAt: string | null;
    cardVerificationRequired: boolean;
    cardVerifiedAt: string | null;
    consentVerificationMethod: string | null;
  } | null;
  usernameRevocations: Array<{ username: string; revokedAt: string; heldUntil: string }>;
}

export function getUserSummary(id: string): Promise<AdminUserSummary> {
  return adminFetch<AdminUserSummary>(`/admin/users/${id}/summary`);
}

// --- B-033: audited username revoke ---
//
// POST /admin/users/:id/username-revoke. `reason` is required (10-500
// characters) and goes to the audit log only. 409 when the user has no
// username, was anonymised, or the handle changed mid-request; 404 for an
// unknown user.
export interface UsernameRevokeResult {
  userId: string;
  revokedUsername: string;
  /** ISO timestamp: until when nobody can take the handle. */
  heldUntil: string;
}

export function revokeUsername(id: string, reason: string): Promise<UsernameRevokeResult> {
  return adminFetch<UsernameRevokeResult>(`/admin/users/${id}/username-revoke`, { method: "POST", body: { reason } });
}

// --- B-029 / B-120: guardians' incorrect-details reports ---
//
// GET /admin/users/incorrect-details-reports: oldest first, capped by the
// server (`truncated` is true when more open reports exist than `items`
// holds). Carries no date of birth. POST .../incorrect-details-report/resolve
// takes no body; 404 means there is no open report for that user (already
// resolved, usually by another admin), an expected outcome.
export interface IncorrectDetailsReport {
  userId: string;
  minorDisplayName: string;
  minorAccountStatus: string;
  guardianName: string;
  guardianEmail: string;
  consentStatus: string;
  /** ISO timestamp. */
  reportedAt: string;
}

export interface IncorrectDetailsReportList {
  items: IncorrectDetailsReport[];
  truncated: boolean;
}

export function listIncorrectDetailsReports(): Promise<IncorrectDetailsReportList> {
  return adminFetch<IncorrectDetailsReportList>("/admin/users/incorrect-details-reports");
}

export function resolveIncorrectDetailsReport(userId: string): Promise<{ resolved: true }> {
  return adminFetch<{ resolved: true }>(`/admin/users/${userId}/incorrect-details-report/resolve`, { method: "POST" });
}

export const GUARDIAN_RELATIONSHIPS = ["Parent", "Legal Guardian", "Grandparent", "Other"] as const;
export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIPS)[number];

export interface CorrectDobRequest {
  /** 'YYYY-MM-DD'. */
  dateOfBirth: string;
  /** 10-500 characters, stored verbatim in the audit log -- must not contain a date of birth. */
  reason: string;
  /** Only when an adult account is corrected to a minor and no guardian is on file. */
  guardian?: { name: string; email: string; relationship: GuardianRelationship };
}

export type DobCorrectionGuardianOutcome =
  | "unchanged"
  | "cancelled"
  | "restarted"
  | "created"
  | "kept_confirmed"
  | "skipped_pending_deletion";

export interface DobCorrectionResult {
  userId: string;
  ageTierBefore: AdminAgeTier;
  ageTierAfter: AdminAgeTier;
  guardianRequest: DobCorrectionGuardianOutcome;
  declineCounterReset: boolean;
  incorrectDetailsFlagCleared: boolean;
}

// The response deliberately echoes neither date.
export function correctDateOfBirth(id: string, payload: CorrectDobRequest): Promise<DobCorrectionResult> {
  return adminFetch<DobCorrectionResult>(`/admin/users/${id}/dob-correction`, { method: "POST", body: payload });
}
