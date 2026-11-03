// Build Plan Section 4.8 (Admin Service) + Section 8.4 (Moderation &
// appeals workflow). All four underlying string fields (Report.targetType,
// .status, .actionTaken, .appealStatus) are plain Postgres `String`s, not
// Prisma/Postgres enums — same extensibility choice already made for
// Guardian.relationship, User.role, GrassrootsTeam.leagueType, etc.

// Report.targetType — the schema comment lists `post | user | comment`.
// The enforced allow-list for POST /reports. 'banter_room' added by
// Decision Log #357: a Banter Room is reportable so a moderator can
// deactivate it via the same queue, with no separate admin route.
// 'grassroots_team' and 'fixture' added by the pre-publication
// sensitive-content screen (Russmedia obligation): a flagged-and-confirmed
// Grassroots submission is logged to this queue against the record it
// published (see GrassrootsService.logSensitiveContentReport), and the same
// two types are also user-reportable through POST /reports.
export const REPORT_TARGET_TYPES = ['post', 'user', 'comment', 'banter_room', 'grassroots_team', 'fixture'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

// backend/w7-contact-enquiry-admin-escalate (B-046 part B; Decision Log #444, #445). A Report whose target is a
// Contact Us enquiry an admin escalated. DELIBERATELY NOT in REPORT_TARGET_TYPES above: that list is what the
// public (POST /reports/public) and user (POST /reports) DTOs accept, and an 'enquiry' report may only be created
// by ContactEnquiryAdminService.escalate. It has no reported user (resolveReportedUserId returns null for it), so
// it can never produce a report-based account hold, a legal hold or a bad-faith hold (HoldService refuses both
// place routes with hold_not_applicable).
export const ENQUIRY_REPORT_TARGET_TYPE = 'enquiry';
// The `source` hint the admin queue and report detail carry for such a report (the key is ABSENT otherwise).
export const REPORT_SOURCE_CONTACT_ENQUIRY = 'contact_enquiry';

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

// backend/b284-report-reason-categories (Decision Log #465, B-284; founder decision 2026-11-03). The fixed list of
// reason categories a report carries. ADOPTED DEFAULTS, veto-able: the nine keys and the labels below were
// proposed by the build, not stated by the founder. Stored as a plain String in Report.reasonCategory (not a
// Prisma enum), like status and severity. A report made before this existed, a report made by the Grassroots
// sensitive-content screen and a report raised by escalating a contact enquiry carry NO category (null).
export const REPORT_REASON_CATEGORIES = [
  'harassment_or_bullying',
  'hate_or_abusive_language',
  'threats_or_violence',
  'child_safety_concern',
  'sexual_or_inappropriate_content',
  'impersonation_or_fake_account',
  'spam_or_scam',
  'privacy_or_image_misuse',
  'other',
] as const;
export type ReportReasonCategory = (typeof REPORT_REASON_CATEGORIES)[number];

// The labels as an admin reads them. ONE map, used by admin search to match a typed prefix ("harass" finds
// harassment_or_bullying). The admin app owns its own display copy; this exists so the search and the screen
// cannot drift in meaning. Keep each label's first word distinctive: search matches a case-insensitive PREFIX.
export const REPORT_REASON_CATEGORY_LABELS: Record<ReportReasonCategory, string> = {
  harassment_or_bullying: 'Harassment or bullying',
  hate_or_abusive_language: 'Hate or abusive language',
  threats_or_violence: 'Threats or violence',
  child_safety_concern: 'Child safety concern',
  sexual_or_inappropriate_content: 'Sexual or inappropriate content',
  impersonation_or_fake_account: 'Impersonation or fake account',
  spam_or_scam: 'Spam or scam',
  privacy_or_image_misuse: 'Privacy or image misuse',
  other: 'Other',
};

// Decision Log #466 (founder decision 2026-11-03): a report with this category is ALWAYS stored with
// concernsMinor = true (see report-concerns-minor.util.ts), so it is limited to child-safety-vetted admins.
export const CHILD_SAFETY_REASON_CATEGORY: ReportReasonCategory = 'child_safety_concern';

// The only category that REQUIRES a written description (Report.reason, 1 to 500 characters). For every other
// category the description is optional and is stored as the empty string when omitted, so every reader of
// Report.reason keeps getting a string.
export const REASON_REQUIRED_CATEGORY: ReportReasonCategory = 'other';

// 400 code: category 'other' with no (or only whitespace) description. A missing or unknown category is rejected
// by the DTO (global ValidationPipe, a code-less 400), like every other DTO field in this module.
export const REPORT_REASON_REQUIRED_CODE = 'report_reason_required';

// The 403 code thrown when a report concerning a minor (Report.concernsMinor)
// is listed/actioned/appeal-reviewed by an AdminUser whose childSafetyVetted
// flag is not true, and when PATCH /admin/moderation/reports/:id/escalate is
// called by a non-vetted admin regardless of the target report's own
// concernsMinor value. A distinct, machine-readable `code` (not just a
// generic 403 message) — same pattern GUARDIAN_CONSENT_PENDING_CODE
// already established in guardian-consent.guard.ts.
export const CHILD_SAFETY_VETTING_REQUIRED_CODE = 'child_safety_vetting_required';

// The 403 code thrown by POST /reports/:id/appeal once the appeal window (REPORT_APPEAL_WINDOW_DAYS, see
// account-hold.config.ts) has lapsed (backend/w6-hold-rule-extension, B-044, Decision Log #376).
export const APPEAL_WINDOW_CLOSED_CODE = 'appeal_window_closed';

// Section 5.5: every list endpoint is paginated. Same default 20 / max 50
// every other list endpoint in this codebase uses.
export const MODERATION_DEFAULT_PAGE_SIZE = 20;
export const MODERATION_MAX_PAGE_SIZE = 50;
