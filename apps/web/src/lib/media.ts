// v1 HEURISTIC, not real media typing: Post carries no media-type column (Post.mediaUrls is a bare list of
// URL strings). A URL is treated as a video iff its path ends in a common video file extension (query string
// and fragment ignored). Files uploaded through the W14 pipeline are stored with the extension of their
// detected type (.mp4, .webm, .mov), so this holds for everything a person can attach today.
// Feed posts no longer need it: their payload carries `media: [{ id, kind }]` (B-259) and the feed card reads
// the real kind from there. It stays for the shapes that still carry only URLs (contest entry lists, the
// final-week carousel, the video carousel).
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
