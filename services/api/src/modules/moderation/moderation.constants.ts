// Build Plan Section 4.8 (Admin Service) + Section 8.4 (Moderation &
// appeals workflow). All four underlying string fields (Report.targetType,
// .status, .actionTaken, .appealStatus) are plain Postgres `String`s, not
// Prisma/Postgres enums — same extensibility choice already made for
// Guardian.relationship, User.role, GrassrootsTeam.leagueType, etc.

// Report.targetType — the schema comment lists `post | user | comment`.
// The enforced allow-list for POST /reports.
export const REPORT_TARGET_TYPES = ['post', 'user', 'comment'] as const;
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
] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

// The second-reviewer's decision on an appeal
// (PATCH /admin/moderation/reports/:id/appeal). Decision Log #138: the
// reviewing admin must be a DIFFERENT admin/moderator than the one who
// actioned the original report — enforced in ModerationService, not just
// documented here.
export const APPEAL_DECISIONS = ['upheld', 'overturned'] as const;
export type AppealDecision = (typeof APPEAL_DECISIONS)[number];

// Section 5.5: every list endpoint is paginated. Same default 20 / max 50
// every other list endpoint in this codebase uses.
export const MODERATION_DEFAULT_PAGE_SIZE = 20;
export const MODERATION_MAX_PAGE_SIZE = 50;
