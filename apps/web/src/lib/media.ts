// v1 HEURISTIC, not real media typing: Post carries no media-type column (Post.mediaUrls is a bare list of
// URL strings). A URL is treated as a video iff its path ends in a common video file extension (query string
// and fragment ignored). Files uploaded through the W14 pipeline are stored with the extension of their
// detected type (.mp4, .webm, .mov), so this holds for everything a person can attach today; revisit once
// posts carry a real media type.
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v", ".ogv"];

export function isVideoUrl(url: string): boolean {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url.split(/[?#]/)[0];
  }
  const lower = path.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// First video URL on a post, or null when it carries none.
export function firstVideoUrl(mediaUrls: string[]): string | null {
  return mediaUrls.find(isVideoUrl) ?? null;
}

// The id of the upload behind a post's media URL (B-240, FC10).
//
// The post payload carries only `mediaUrls` (plain strings), not the media ids, and the two routes a
// person needs them for -- GET /media/uploads/:id (the author's own status and rejection reason) and
// POST /media/:id/report -- take the id. The W14 pipeline stores every processed file at
//   post-media/<uploaderId>/<uploadId>.<ext>
// (services/api post-media README, "Confirm, step by step"), so the upload id is the last path
// segment without its extension. That is a dependency on the key layout, kept in this one function:
// a URL that does not end in a UUID gives null and the caller simply shows no media controls.
// The clean fix is an additive `media: [{ id, kind }]` on the post payload (flagged in the PR).
const MEDIA_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function mediaIdFromUrl(url: string): string | null {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url.split(/[?#]/)[0];
  }
  const last = path.split("/").filter(Boolean).pop() ?? "";
  const stem = last.includes(".") ? last.slice(0, last.lastIndexOf(".")) : last;
  return MEDIA_ID_PATTERN.test(stem) ? stem.toLowerCase() : null;
}
