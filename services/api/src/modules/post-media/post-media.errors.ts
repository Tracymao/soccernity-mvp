import { HttpException } from '@nestjs/common';

// backend/w14-post-media-pipeline. A coded HTTP error, the same { statusCode, error, code, message } body
// shape the contest and consent guards use, so a client can branch on `code` and show `message`.

const STATUS_NAMES: Record<number, string> = {
  400: 'Bad Request',
  404: 'Not Found',
  409: 'Conflict',
  429: 'Too Many Requests',
  503: 'Service Unavailable',
};

export function postMediaError(status: number, code: string, message: string): HttpException {
  return new HttpException({ statusCode: status, error: STATUS_NAMES[status] ?? 'Error', code, message }, status);
}

export const POST_MEDIA_CODES = {
  fileTooLarge: 'file_too_large',
  unsupportedFile: 'unsupported_file',
  videoTooLong: 'video_too_long',
  uploadNotReceived: 'upload_not_received',
  uploadInProgress: 'upload_in_progress',
  uploadRateLimited: 'upload_rate_limited',
  mediaNotAttachable: 'media_not_attachable',
  tooManyVideos: 'too_many_videos',
  finalEntryNeedsVideo: 'final_entry_needs_one_video',
  mediaInContestEntry: 'media_in_contest_entry',
} as const;

export const UPLOADS_UNAVAILABLE_MESSAGE = "Uploads aren't available right now. Please try again later.";
