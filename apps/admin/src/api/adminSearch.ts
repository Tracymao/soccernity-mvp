// Admin search client -- services/api `GET /admin/search?q=` (B-114, Decision Log #463, built by
// backend/b114-admin-search). Any authenticated admin may call it; WHICH groups come back depends on the
// caller's role, decided entirely on the server. A group the role cannot open is ABSENT from `groups` (the key
// does not exist); a group with no match is present and empty. The client never works out a role rule.
//
// Shapes mirror services/api admin-search.service.ts exactly (dates are ISO strings over HTTP). Nothing that
// the server does not return is read: there is no per-group count and no total. Every hit carries `matchedOn`,
// a stable KEY for the field the text matched (the label is this app's, in SearchPage.tsx), added by
// backend/b114-search-fields-report-search (Decision Log #464). Report hits have NO reason field: no reason
// category exists in the data model, so the frames' REASON column is not built.
import { adminFetch } from "./adminClient";

export interface SearchGroup<T> {
  items: T[];
  /** More matches exist than the per-group cap; the extra row is never returned. */
  truncated: boolean;
}

export type UserMatchedOn = "user_id" | "email" | "username";
export type ReportMatchedOn =
  | "report_id"
  | "report_reference"
  | "reporter_user_id"
  | "target_user_id"
  | "target_username";
export type ContactEnquiryMatchedOn = "email" | "subject";
export type ArticleMatchedOn = "title";
export type StaffMatchedOn = "email" | "name";
export type MediaMatchedOn = "item_id";

export interface SearchUserHit {
  matchedOn: UserMatchedOn;
  id: string;
  displayName: string;
  username: string | null;
  email: string;
  accountStatus: string;
  createdAt: string;
}

export interface SearchReportHit {
  matchedOn: ReportMatchedOn;
  id: string;
  targetType: string;
  targetId: string;
  status: string;
  severity: string;
  concernsMinor: boolean;
  createdAt: string;
  /** "contact_enquiry" for a report made from a Contact Us enquiry, otherwise null. */
  source: string | null;
}

export interface SearchContactEnquiryHit {
  matchedOn: ContactEnquiryMatchedOn;
  id: string;
  name: string;
  email: string;
  category: string;
  subject: string;
  status: string;
  createdAt: string;
  lastMessageAt: string;
  handledAt: string | null;
  handledByAdminId: string | null;
  submitter: "signed_in" | "guest";
  hasEscalation: boolean;
}

export interface SearchArticleHit {
  matchedOn: ArticleMatchedOn;
  id: string;
  title: string;
  status: string;
  category: { id: string; name: string } | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface SearchStaffHit {
  matchedOn: StaffMatchedOn;
  id: string;
  email: string;
  fullName: string;
  role: string;
  accountStatus: string;
  /** Whether the admin has an authenticator app set up. Derived on the server; no secret or code is returned. */
  twoFactorEnabled: boolean;
}

export type MediaReviewSource = "auto_check" | "user_report";

export interface SearchMediaHit {
  matchedOn: MediaMatchedOn;
  id: string;
  kind: string;
  status: string;
  reportCount: number;
  createdAt: string;
  /** Why the item is in the queue: the automatic check and/or user reports. */
  sources: MediaReviewSource[];
  /** The uploader's PUBLIC name only (never an email or a real name). */
  uploader: { id: string; publicName: string };
}

export interface AdminSearchResult {
  groups: {
    users?: SearchGroup<SearchUserHit>;
    reports?: SearchGroup<SearchReportHit>;
    contactEnquiries?: SearchGroup<SearchContactEnquiryHit>;
    articles?: SearchGroup<SearchArticleHit>;
    staff?: SearchGroup<SearchStaffHit>;
    media?: SearchGroup<SearchMediaHit>;
  };
}

// The server's order of groups (the brief's order, and the order the frames draw).
export const SEARCH_GROUP_ORDER = ["users", "reports", "contactEnquiries", "articles", "staff", "media"] as const;
export type SearchGroupKey = (typeof SEARCH_GROUP_ORDER)[number];

// The server's stable 400 codes (admin-search.constants.ts). Read from the response body; the message text is
// never matched.
export const ADMIN_SEARCH_QUERY_TOO_SHORT_CODE = "admin_search_query_too_short";
export const ADMIN_SEARCH_QUERY_TOO_LONG_CODE = "admin_search_query_too_long";
export const ADMIN_SEARCH_QUERY_INVALID_CODE = "admin_search_query_invalid";

// Mirrors services/api ADMIN_SEARCH_MIN_LENGTH: a query shorter than this (after trimming) is not sent. The
// server enforces it too and answers admin_search_query_too_short; this copy only avoids a pointless request
// and lets the "Keep typing" banner name the number, which the server does not return.
export const ADMIN_SEARCH_MIN_LENGTH = 3;

// GET /admin/search?q= -- `q` is sent trimmed.
export function adminSearch(q: string): Promise<AdminSearchResult> {
  const params = new URLSearchParams({ q: q.trim() });
  return adminFetch<AdminSearchResult>(`/admin/search?${params.toString()}`);
}

/** The `code` the server put on a 400 body, if any. */
export function searchErrorCode(body: unknown): string | null {
  if (body && typeof body === "object" && "code" in body) {
    const code = (body as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}
