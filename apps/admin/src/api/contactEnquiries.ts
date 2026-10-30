// Contact Us enquiries admin client -- services/api `/admin/contact-enquiries*` (B-046 part B, Decision
// Log #444 / #445, built by backend/w7-contact-enquiry-admin-escalate). Moderator or superadmin only: an
// `editor` token gets a real 403 (AdminRolesGuard), like every moderation route.
//
// Response shapes mirror services/api contact-enquiry-admin.service.ts's ContactEnquiryListItem /
// ContactEnquiryDetail / EscalationResult exactly (dates are ISO strings over HTTP). The list carries NO
// message text and no total count: the Figma tab's "(3)" count has nothing to read from.
import { adminFetch } from "./adminClient";
import type { ReportSeverity } from "./moderation";

// Mirrors services/api contact.constants.ts (apps/admin cannot import from services/api -- this codebase's
// usual per-side copy).
export const CONTACT_CATEGORIES = [
  "technical_issues",
  "editorial_complaints",
  "data",
  "suggestions",
  "enquiries",
  "feedback",
] as const;
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

// The wording the Contact Us dropdown and the admin frames draw (the six of the Contact Category Dropdown).
export const CONTACT_CATEGORY_LABELS: Record<ContactCategory, string> = {
  technical_issues: "Technical issues",
  editorial_complaints: "Editorial Complaints",
  data: "Data",
  suggestions: "Suggestions",
  enquiries: "Enquiries",
  feedback: "Feedback",
};

export function contactCategoryLabel(category: string): string {
  return CONTACT_CATEGORY_LABELS[category as ContactCategory] ?? category;
}

export const CONTACT_ENQUIRY_STATUSES = ["new", "handled"] as const;
export type ContactEnquiryStatus = (typeof CONTACT_ENQUIRY_STATUSES)[number];

export interface ContactEnquiryListItem {
  id: string;
  name: string;
  email: string;
  category: string;
  subject: string;
  status: string; // "new" | "handled"
  createdAt: string;
  lastMessageAt: string;
  handledAt: string | null;
  handledByAdminId: string | null;
  submitter: "signed_in" | "guest";
  hasEscalation: boolean;
}

export interface ContactEnquiryDetail extends ContactEnquiryListItem {
  message: string;
  userId: string | null;
  escalatedReportId: string | null;
}

export interface ContactEnquiryListPage {
  items: ContactEnquiryListItem[];
  nextCursor: string | null;
}

// GET /admin/contact-enquiries -- newest first, keyset cursor, default 20 / max 50. `status` and `category`
// are optional exact filters; anything outside the lists is a 400.
export function listContactEnquiries(
  query: { status?: ContactEnquiryStatus; category?: ContactCategory; cursor?: string; limit?: number } = {},
): Promise<ContactEnquiryListPage> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.category) params.set("category", query.category);
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return adminFetch<ContactEnquiryListPage>(`/admin/contact-enquiries${qs ? `?${qs}` : ""}`);
}

// GET /admin/contact-enquiries/:id -- the list fields plus the message. A real 404 if unknown.
export function getContactEnquiry(id: string): Promise<ContactEnquiryDetail> {
  return adminFetch<ContactEnquiryDetail>(`/admin/contact-enquiries/${id}`);
}

// PATCH /admin/contact-enquiries/:id/handled -- `true` marks handled, `false` reopens. Idempotent.
export function setContactEnquiryHandled(id: string, handled: boolean): Promise<ContactEnquiryDetail> {
  return adminFetch<ContactEnquiryDetail>(`/admin/contact-enquiries/${id}/handled`, {
    method: "PATCH",
    body: { handled },
  });
}

export interface EscalateEnquiryInput {
  severity: ReportSeverity;
  concernsMinor: boolean;
  /** 10 to 500 characters, trimmed; goes to the audit record, not to the Report. */
  reason: string;
}

export interface EscalationResult {
  enquiry: ContactEnquiryDetail;
  report: { id: string; status: string; severity: string; concernsMinor: boolean };
}

// POST /admin/contact-enquiries/:id/escalate -- creates a Report (targetType "enquiry") linked to the
// enquiry. A 403 with code child_safety_vetting_required comes back only when `concernsMinor` is true and
// the admin is not child-safety vetted; a 409 contact_enquiry_already_escalated if it was escalated already.
export function escalateContactEnquiry(id: string, input: EscalateEnquiryInput): Promise<EscalationResult> {
  return adminFetch<EscalationResult>(`/admin/contact-enquiries/${id}/escalate`, {
    method: "POST",
    body: input,
  });
}
