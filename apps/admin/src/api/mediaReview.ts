// Media review queue client — services/api `/admin/media-review*` (B-037, W15; Decision Log #419 item 4).
// Wires MediaReviewQueuePage.tsx / MediaReviewItemPage.tsx (FC10, B-240). Shapes mirror
// services/api/src/modules/admin-media-review/admin-media-review.service.ts exactly.
//
// Every call goes through adminFetch (isolated admin auth path, transparent 401 -> refresh). Every route
// needs `moderator` or `superadmin`; an `editor` token gets a real 403. What the queue holds: pictures and
// videos the automatic check was unsure about (or never ran for), and approved files users reported.
// Nothing a moderator receives contains an email, a real name or a reporter.
import { AdminApiError, adminFetch } from "./adminClient";

export type MediaReviewSource = "auto_check" | "user_report";
export type MediaReviewStatusFilter = "pending" | "approved" | "rejected";

export interface MediaReviewItem {
  id: string;
  kind: "image" | "video" | string;
  contentType: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  /** 'pending' | 'approved' | 'rejected'. An approved item with reportCount > 0 is waiting for a decision. */
  status: string;
  awaitingDecision: boolean;
  sources: MediaReviewSource[];
  reportCount: number;
  hiddenPendingReview: boolean;
  checkLabels: string[];
  uploader: { id: string; publicName: string };
  postId: string | null;
  uploadedAt: string;
  ageSeconds: number;
  enteredQueueAt: string | null;
  decidedAt: string | null;
  decisionSource: string | null;
  rejectionReason: string | null;
  /** A 5-minute signed link to the file; null if storage is unavailable. */
  viewUrl: string | null;
  viewUrlExpiresAt: string | null;
}

export interface MediaReviewPage {
  items: MediaReviewItem[];
  nextCursor: string | null;
}

export interface MediaReviewStats {
  windowDays: number;
  from: string;
  to: string;
  autoApproved: number;
  autoRejected: number;
  sentToReview: number;
  reported: number;
  decidedByModerator: number;
}

export interface MediaDecisionResult {
  id: string;
  /** 'approved' | 'kept' | 'rejected' */
  outcome: string;
  [key: string]: unknown;
}

export const MEDIA_REVIEW_ALREADY_DECIDED = "already_decided";
export const MEDIA_REVIEW_REJECT_REASON_MAX = 300;

export function listMediaReview(
  query: { status?: MediaReviewStatusFilter; source?: MediaReviewSource; order?: "newest" | "oldest"; cursor?: string; limit?: number } = {},
): Promise<MediaReviewPage> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.source) params.set("source", query.source);
  if (query.order) params.set("order", query.order);
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return adminFetch<MediaReviewPage>(`/admin/media-review${qs ? `?${qs}` : ""}`);
}

export function getMediaReviewStats(days = 7): Promise<MediaReviewStats> {
  return adminFetch<MediaReviewStats>(`/admin/media-review/stats?days=${days}`);
}

export function getMediaReviewItem(id: string): Promise<MediaReviewItem> {
  return adminFetch<MediaReviewItem>(`/admin/media-review/${id}`);
}

export function approveMedia(id: string): Promise<MediaDecisionResult> {
  return adminFetch<MediaDecisionResult>(`/admin/media-review/${id}/approve`, { method: "POST" });
}

export function rejectMedia(id: string, reason: string): Promise<MediaDecisionResult> {
  return adminFetch<MediaDecisionResult>(`/admin/media-review/${id}/reject`, {
    method: "POST",
    body: { reason },
  });
}

/** True when a decision was refused because someone already decided (409 already_decided). */
export function isAlreadyDecided(err: unknown): boolean {
  if (!(err instanceof AdminApiError) || err.status !== 409) return false;
  const body = err.body as { code?: unknown } | null | undefined;
  return body?.code === MEDIA_REVIEW_ALREADY_DECIDED;
}
