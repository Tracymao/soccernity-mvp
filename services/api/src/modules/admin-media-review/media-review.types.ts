// backend/w15-media-review-queue + backend/b037-profile-image-review (B-037). The shapes the moderator queue returns.
import { PostMediaReviewSource } from '../post-media/post-media-review.constants';

export type MediaReviewItemType = 'post_media' | 'profile_avatar' | 'profile_cover';

export interface MediaReviewItem {
  /**
   * Post and contest media: a UUID. A profile picture: "<avatar|cover>:<userId>:<file>" -- the kind, the person and
   * the stored FILE it names (see profile-image-item-id.ts).
   */
  id: string;
  /** What this item is. The screens branch on this, not on the shape of the id. */
  type: MediaReviewItemType;
  kind: string;
  contentType: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  /** 'pending' (undecided) | 'approved' | 'rejected'. An approved item with reportCount > 0 is waiting for a decision. */
  status: string;
  awaitingDecision: boolean;
  /** Why the item is (or was) in the queue: the automatic check and/or user reports. */
  sources: PostMediaReviewSource[];
  /** Open reports; 0 once decided. A count only, never who. */
  reportCount: number;
  /** True once the report threshold hid it from everyone but its author. */
  hiddenPendingReview: boolean;
  /** What reporters wrote (optional free text, newest first, at most 20). Never who wrote it. */
  reportReasons: string[];
  /** The automatic check's category labels (e.g. "Suggestive"); empty when the check never ran. */
  checkLabels: string[];
  uploader: { id: string; publicName: string };
  postId: string | null;
  /** When the file was stored. null only for a profile picture uploaded before B-037 (age unknown, listed as the oldest). */
  uploadedAt: Date | null;
  /** Seconds since the file was uploaded (confirmed). null when uploadedAt is. */
  ageSeconds: number | null;
  enteredQueueAt: Date | null;
  decidedAt: Date | null;
  decisionSource: string | null;
  rejectionReason: string | null;
  /** A short-lived link to the file; null if storage is unavailable. */
  viewUrl: string | null;
  viewUrlExpiresAt: Date | null;
}

export interface MediaReviewPage {
  items: MediaReviewItem[];
  nextCursor: string | null;
}
