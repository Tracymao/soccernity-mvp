// Build Plan Section 4.8 (Admin Service) + Section 8.4 (Moderation &
// appeals workflow). All four underlying string fields (Report.targetType,
// .status, .actionTaken, .appealStatus) are plain Postgres `String`s, not
// Prisma/Postgres enums — same extensibility choice already made for
// Guardian.relationship, User.role, GrassrootsTeam.leagueType, etc.

// Report.targetType — the schema comment lists `post | user | comment`.
// The enforced allow-list for POST /reports. 'banter_room' added by
// Decision Log #357: a Banter Room is reportable so a moderator can
// deactivate it via the same queue, with no separate admin route.
export const REPORT_TARGET_TYPES = ['post', 'user', 'comment', 'banter_room'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

// The outcome an admin/moderator may record via
// PATCH /admin/moderation/reports/:id. Maps onto Report's own pre-existing
// three-value `status` enum (see moderation.service.ts's actionReport):
// 'dismissed' -> status 'reviewed', anything else -> status 'actioned'.
// Recording one of these does NOT itself enforce it — see README.md's
// disclosed-limitation section.
export const REPORT_ACTIONS = [
  'content_removed',
  'warning_issued',
  'user_suspended',
  'dismissed',
  'room_deactivated',
] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

// room_deactivated is valid ONLY for a banter_room target (Decision Log
// #357) — it is the one action that writes BanterRoom.status. Recording it
// against a post/user/comment would leave a misleading audit row, so
// ModerationService rejects that combination with 400.
export const ROOM_DEACTIVATED_ACTION = 'room_deactivated';

// The second-reviewer's decision on an appeal
// (PATCH /admin/moderation/reports/:id/appeal). Decision Log #138: the
// reviewing admin must be a DIFFERENT admin/moderator than the one who
// actioned the original report — enforced in ModerationService, not just
// documented here.
export const APPEAL_DECISIONS = ['upheld', 'overturned'] as const;
export type AppealDecision = (typeof APPEAL_DECISIONS)[number];

// schema/report-severity-escalation-admin-vetting — Report.severity's own
// schema comment ("low | medium | high | critical... defaults 'medium'").
// Accepted on submission by BOTH POST /reports and POST /reports/public;
// an omitted value defaults to 'medium' at the service layer (matching,
// not just relying on, the column's own DB-level default — see
// ModerationService.createReport/createPublicReport).
export const REPORT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type ReportSeverity = (typeof REPORT_SEVERITIES)[number];
export const DEFAULT_REPORT_SEVERITY: ReportSeverity = 'medium';

// The 403 code thrown when a report concerning a minor (Report.concernsMinor)
// is listed/actioned/appeal-reviewed by an AdminUser whose childSafetyVetted
// flag is not true, and when PATCH /admin/moderation/reports/:id/escalate is
// called by a non-vetted admin regardless of the target report's own
// concernsMinor value. A distinct, machine-readable `code` (not just a
// generic 403 message) — same pattern GUARDIAN_CONSENT_PENDING_CODE
// already established in guardian-consent.guard.ts.
export const CHILD_SAFETY_VETTING_REQUIRED_CODE = 'child_safety_vetting_required';

// Section 5.5: every list endpoint is paginated. Same default 20 / max 50
// every other list endpoint in this codebase uses.
export const MODERATION_DEFAULT_PAGE_SIZE = 20;
export const MODERATION_MAX_PAGE_SIZE = 50;
