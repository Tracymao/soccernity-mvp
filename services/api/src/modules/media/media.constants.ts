// Build Plan Section 4.8 (Admin Service) — Media library.
// 50MB per the Figma copy MediaUploadPage.tsx's own stub already carried
// ("Select up to 5 media files (each no larger than 50 MB)") — the "5
// files" half of that copy is a client-side selection convenience (see
// README.md's "Up to 5 files" section); this endpoint is single-file, so
// only the per-file size cap applies here.
export const MEDIA_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

// MediaAsset.type is a plain Postgres `String`, not a Prisma/Postgres
// enum — same extensibility choice already made for Article.status,
// Report.status, User.role, etc. Derived server-side from the uploaded
// file's own MIME type, never trusted from the client as a separate
// field.
export const MEDIA_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;
export type MediaAllowedMimeType = (typeof MEDIA_ALLOWED_MIME_TYPES)[number];

export type MediaType = 'image' | 'video';

// Section 5.5: every list endpoint is paginated. Same default 20 / max 50
// every other list endpoint in this codebase uses.
export const MEDIA_DEFAULT_PAGE_SIZE = 20;
export const MEDIA_MAX_PAGE_SIZE = 50;
