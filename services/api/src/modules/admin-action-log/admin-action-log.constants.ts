// feat/admin-action-log — plain, dot-namespaced action strings written by
// AdminActionLogService.record(). AdminActionLog.action is a plain
// Postgres String, not a Prisma/Postgres enum (same extensibility choice
// as Report.status/.actionTaken/.appealStatus — see
// moderation.constants.ts's own header comment), so there is no
// schema-level allow-list to enforce here. Grouped in one place, not
// inlined at each call site, so the full set of admin/moderator actions
// this codebase logs is visible without hunting through every module that
// writes one.
export const ADMIN_ACTION_LOG_ACTIONS = {
  REPORT_ACTIONED: 'report.actioned',
  REPORT_APPEAL_DECIDED: 'report.appeal_decided',
  REPORT_ESCALATED: 'report.escalated',
  ADMIN_CHILD_SAFETY_VETTING_UPDATED: 'admin_user.child_safety_vetting_updated',
  USER_STATUS_UPDATED: 'user.status_updated',
  // POST /admin/users/:id/incorrect-details-report/resolve (B-029, Decision
  // Log #372) -- support cleared a guardian's "report incorrect details"
  // flag, releasing the hold on approval. targetType 'user' (the minor).
  GUARDIAN_INCORRECT_DETAILS_RESOLVED: 'guardian.incorrect_details_resolved',
  // GET /admin/users/:id (B-109, Decision Log #398 D4) -- an admin's response
  // contained the user's DECRYPTED date of birth. One row per such response,
  // repeat reads included. targetType 'user'. No notes: the row records THAT
  // it was read, never what was read.
  USER_DOB_VIEWED: 'user.dob_viewed',
  // POST /admin/users/:id/dob-correction (B-103, Decision Log #390) -- support
  // corrected a user's date of birth. Notes carry the reason, old and new age
  // tier and what happened to the guardian request; never a DOB value.
  USER_DOB_CORRECTED: 'user.dob_corrected',
  // POST /admin/users/:id/username-revoke (B-033, Decision Log #398 D3) -- an
  // admin removed a user's username. Written in the SAME transaction as the
  // change. targetType 'user'. Notes carry the revoked handle, the 30-day hold
  // end and the REASON.
  USER_USERNAME_REVOKED: 'user.username_revoked',
  // Reserved, NOT yet wired to a real call site — no AdminUser
  // role-change endpoint exists anywhere in this codebase yet
  // (grep-confirmed; no branch/PR for one either, at the time this
  // constant was added). Kept here so whoever builds that endpoint has a
  // name to slot straight into AdminActionLogService.record() rather than
  // inventing an ad-hoc string at that point.
  ADMIN_ROLE_CHANGED: 'admin_user.role_changed',
  // POST /admin/staff (Decision Log #191) � a superadmin provisioned a
  // new AdminUser. Detail records role only, never the password.
  ADMIN_USER_CREATED: 'admin_user.created',
  // PATCH /admin/staff/:id/status (feat/admin-staff-status, Decision Log
  // #193) � a superadmin set the TARGET AdminUser's accountStatus
  // (active/deactivated). Mirrors USER_STATUS_UPDATED's naming for the
  // User-side equivalent.
  ADMIN_ACCOUNT_STATUS_UPDATED: 'admin_user.status_updated',
} as const;

export type AdminActionLogAction = (typeof ADMIN_ACTION_LOG_ACTIONS)[keyof typeof ADMIN_ACTION_LOG_ACTIONS];

// targetType values used above. AdminActionLog.targetId is a bare string,
// not an FK — the same reasoning as Report.targetId: a single log entry
// needs to point at whichever of several different tables (Report,
// AdminUser, User, ...) the action concerned, and one Prisma relation
// field can't express that. No schema-level allow-list to mirror here
// either, for the same reason.
export const ADMIN_ACTION_LOG_TARGET_TYPES = {
  REPORT: 'report',
  ADMIN_USER: 'admin_user',
  USER: 'user',
} as const;

export type AdminActionLogTargetType =
  (typeof ADMIN_ACTION_LOG_TARGET_TYPES)[keyof typeof ADMIN_ACTION_LOG_TARGET_TYPES];
