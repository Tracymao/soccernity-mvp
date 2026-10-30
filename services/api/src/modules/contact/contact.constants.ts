// backend/w7-contact-us-enquiry (B-046; Decision Log #440, #444, founder decisions 2026-10-30).

// The six options of the Figma "Contact Category Dropdown" (6130:14653 desktop / 6130:14664 mobile), in the
// order the dropdown draws them. The stored value is the key; the label is what the support email shows.
export const CONTACT_CATEGORIES = [
  'technical_issues',
  'editorial_complaints',
  'data',
  'livescores_issues',
  'suggestions',
  'enquiries_feedback',
] as const;

export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

export const CONTACT_CATEGORY_LABELS: Record<ContactCategory, string> = {
  technical_issues: 'Technical issues',
  editorial_complaints: 'Editorial complaints',
  data: 'Data',
  livescores_issues: 'Livescores issues',
  suggestions: 'Suggestions',
  enquiries_feedback: 'Enquiries / feedback',
};

export const CONTACT_ENQUIRY_STATUSES = ['new', 'handled'] as const;

// Field limits. NOT invented: the Contact Us frames draw no character counter (read from the live Figma frame
// 6113:14053 -- Name, Email, "Choose a category", Email Subject and the message box, no counter anywhere).
//   message  500  = CreatePublicReportDto.reason (the public route this one is modelled on)
//   name     200  = ChangeGuardianEmailDto's guardian name, the one free-text name field with a stated limit
//   email    254  = the same DTO's email limit (the RFC 5321 maximum)
//   subject  200  = no precedent for a subject line exists; the name limit was reused. Veto-able.
export const CONTACT_NAME_MAX_LENGTH = 200;
export const CONTACT_EMAIL_MAX_LENGTH = 254;
export const CONTACT_SUBJECT_MAX_LENGTH = 200;
export const CONTACT_MESSAGE_MAX_LENGTH = 500;

// Defaults for the configuration below; each is read through ConfigService, falling back here.
export const DEFAULT_SUPPORT_INBOX_EMAIL = 'support@soccernity.com';
// Decision Log #440 (the founder's own decision): 12 months from the LAST message in the enquiry.
export const DEFAULT_CONTACT_ENQUIRY_RETENTION_MONTHS = 12;
// Founder decisions 2026-10-30: 3 submissions per email address per hour.
export const DEFAULT_CONTACT_EMAIL_RATE_LIMIT_MAX = 3;
export const DEFAULT_CONTACT_EMAIL_RATE_LIMIT_WINDOW_MS = 60 * 60_000;

// At most this many enquiries are deleted per retention run (the B-043 purge's discipline); the rest wait
// for the next run.
export const CONTACT_RETENTION_MAX_PER_RUN = 200;

export const CONTACT_EMAIL_RATE_LIMITED_CODE = 'contact_email_rate_limited';
// Same plain register as the media-report limit message: no number, no hint about who or why.
export const CONTACT_EMAIL_RATE_LIMITED_MESSAGE =
  'Each email address can send a limited number of messages in an hour. You can send another later.';

// ---- Admin inbox (part B; Decision Log #444, #445) ----
// Section 5.5 defaults, as every other list endpoint.
export const CONTACT_ENQUIRY_ADMIN_DEFAULT_PAGE_SIZE = 20;
export const CONTACT_ENQUIRY_ADMIN_MAX_PAGE_SIZE = 50;
// The escalated Report's reason holds category, subject and message in one text, capped at the bound the
// other report routes use (CreateReportDto.reason: 500). The full message stays on the linked enquiry.
export const CONTACT_ENQUIRY_REPORT_REASON_MAX_LENGTH = 500;
export const CONTACT_ENQUIRY_ESCALATED_CODE = 'contact_enquiry_already_escalated';
export const CONTACT_ENQUIRY_ESCALATION_REASON_INVALID_CODE = 'escalation_reason_invalid';
