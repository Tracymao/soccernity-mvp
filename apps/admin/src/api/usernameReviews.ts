// Username reviews admin client (B-139 part (c); Decision Log #467) -- services/api `/admin/username-reviews*`,
// built by backend/b139-username-review (PR #626, modules/username-review). Moderator or superadmin only: an
// `editor` token gets a real 403 on both routes.
//
// Response shapes mirror services/api admin-username-reviews.service.ts (UsernameReviewListItem,
// UsernameReviewDecisionResult). Dates are ISO strings over HTTP. The list item carries NO decision reason, no
// "decided by" and no "decided on" (the reason goes to the audit record only), and nothing about what the person
// has done since the removal, so the screens draw none of those.
//
// There is no GET /admin/username-reviews/:id. The detail screen is reached through a router `state` handoff from
// the list; `findUsernameReviewById` is the bounded fallback for a direct visit or a refresh (the same workaround
// api/adminStaff.ts's findStaffById uses for the same missing route).
//
// Callers branch on the error CODE, never on the English message (errorCode below).
import { adminFetch, AdminApiError } from "./adminClient";

// Mirrors services/api username-review.constants.ts.
export const USERNAME_REVIEW_STATUSES = ["pending", "reinstated", "declined"] as const;
export type UsernameReviewStatus = (typeof USERNAME_REVIEW_STATUSES)[number];

export type UsernameReviewDecision = "reinstate" | "decline";

/** The reason on a decision: 10 to 500 characters, judged after trimming (the server's rule). */
export const USERNAME_REVIEW_REASON_MIN_LENGTH = 10;
export const USERNAME_REVIEW_REASON_MAX_LENGTH = 500;

export const USERNAME_REVIEW_NOT_FOUND_CODE = "username_review_not_found"; // 404: missing, or a request this admin may not see
export const USERNAME_REVIEW_OWN_REVOCATION_CODE = "username_review_own_revocation"; // 403
export const USERNAME_REVIEW_NOT_PENDING_CODE = "username_review_not_pending"; // 409
export const USERNAME_REVIEW_USER_HAS_USERNAME_CODE = "username_review_user_has_username"; // 409
export const USERNAME_REVIEW_HANDLE_UNAVAILABLE_CODE = "username_review_handle_unavailable"; // 409
export const USERNAME_REVIEW_USER_UNAVAILABLE_CODE = "username_review_user_unavailable"; // 409
export const USERNAME_REVIEW_REASON_INVALID_CODE = "username_review_reason_invalid"; // 400

export interface UsernameReviewListItem {
  id: string;
  status: string; // "pending" | "reinstated" | "declined"
  createdAt: string;
  /** The person's optional message (free text, at most 500 characters). */
  message: string | null;
  /** The handle that was removed. */
  removedUsername: string;
  revokedAt: string;
  userId: string;
  /** The person's display name. Never a date of birth, email or phone. */
  userDisplayName: string;
  /** Who removed it, by name; null when the server cannot tell (old rows). */
  revokedBy: { displayName: string } | null;
}

export interface UsernameReviewPage {
  items: UsernameReviewListItem[];
  nextCursor: string | null;
}

export interface UsernameReviewDecisionResult {
  id: string;
  status: "reinstated" | "declined";
  decidedAt: string;
}

/** The `code` the API put on an error body, or null. */
export function errorCode(err: unknown): string | null {
  if (!(err instanceof AdminApiError)) return null;
  const body = err.body;
  if (body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string") {
    return (body as { code: string }).code;
  }
  return null;
}

// GET /admin/username-reviews -- newest first, keyset cursor, default 20 / max 50. `status` is an optional exact
// filter. The revoking admin's own requests, and a minor's request for an admin who is not child-safety vetted,
// are simply absent from the answer (the server decides; the client applies no rule).
export function listUsernameReviews(
  query: { status?: UsernameReviewStatus; cursor?: string; limit?: number } = {},
): Promise<UsernameReviewPage> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return adminFetch<UsernameReviewPage>(`/admin/username-reviews${qs ? `?${qs}` : ""}`);
}

// POST /admin/username-reviews/:id/decide -- final. The reason is internal (audit record only).
export function decideUsernameReview(
  id: string,
  input: { decision: UsernameReviewDecision; reason: string },
): Promise<UsernameReviewDecisionResult> {
  return adminFetch<UsernameReviewDecisionResult>(`/admin/username-reviews/${encodeURIComponent(id)}/decide`, {
    method: "POST",
    body: input,
  });
}

const FIND_BY_ID_MAX_PAGES = 5;

// Fallback for a direct visit or a page refresh (no router state): re-lists unfiltered and searches client-side,
// bounded to a few pages. null = not found within the bound, which also covers a request that was reinstated (the
// server deletes it) and one this admin may not see.
export async function findUsernameReviewById(id: string): Promise<UsernameReviewListItem | null> {
  let cursor: string | undefined;
  for (let page = 0; page < FIND_BY_ID_MAX_PAGES; page += 1) {
    const result = await listUsernameReviews({ cursor, limit: 50 });
    const found = result.items.find((item) => item.id === id);
    if (found) return found;
    if (!result.nextCursor) return null;
    cursor = result.nextCursor;
  }
  return null;
}
