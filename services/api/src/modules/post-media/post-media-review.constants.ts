// backend/w15-media-review-queue (B-037; Decision Log #419 items 4 and 6). Names shared by the automatic
// check, the moderator decisions and the notification reader.

// Notification.type values. payloadRefId = the PostMedia id. Neither copies the rejection reason: it lives on
// the media row and the uploader reads it from GET /media/uploads/:id (the profile_image_rejected pattern).
export const POST_MEDIA_APPROVED_NOTIFICATION_TYPE = 'post_media_approved';
export const POST_MEDIA_REJECTED_NOTIFICATION_TYPE = 'post_media_rejected';

export const POST_MEDIA_NOTIFICATION_TYPES = [
  POST_MEDIA_APPROVED_NOTIFICATION_TYPE,
  POST_MEDIA_REJECTED_NOTIFICATION_TYPE,
] as const;

export type PostMediaReviewSource = 'auto_check' | 'user_report';
export const POST_MEDIA_REVIEW_SOURCES: readonly PostMediaReviewSource[] = ['auto_check', 'user_report'];

// A rejection reason is moderator-written text the uploader reads. Same bound as profile images (B-214).
export const POST_MEDIA_REJECTION_REASON_MAX_LENGTH = 300;
