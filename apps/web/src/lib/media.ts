// v1 HEURISTIC, not real media typing: the codebase has no media-type
// column on Post and no upload endpoint (Post.mediaUrls is a bare list of
// URL strings), and PostCard renders every entry as a plain link -- there
// is no existing image-vs-video distinction anywhere. A URL is treated as a
// video iff its path ends in a common video file extension (query string
// and fragment ignored). Extensionless / signed / CDN URLs that don't end
// in one of these will not be recognised as video; revisit once posts carry
// a real media type.
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
