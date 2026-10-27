// backend/w12-points (B-093; Decision Log #384; docs/contest-spec.md section 9c).
// What a viewer must do before a view QUALIFIES, as pure functions. Two independent rules apply to
// one viewing session:
//
//   BASELINE (everyday points, outside any contest)
//     photo       at least 3 seconds on screen
//     text-only   at least 3 seconds visible
//     video       the full length if shorter than 60 seconds, otherwise 60 seconds watched
//
//   CONTEST tally (views counted for the contestant; weeks 1-3 only, "views are not counted in the final")
//     video       min(video length, the contest's weekly view-qualifying limit L in seconds)
//     photo       at least 5 seconds on the image
//     text-only   NOT STATED by the spec. DEFAULT: treated like a photo (5 seconds). OPEN.

export type PostMediaKind = 'video' | 'photo' | 'text';

export const BASELINE_IMAGE_OR_TEXT_SECONDS = 3;
export const BASELINE_VIDEO_MAX_REQUIRED_SECONDS = 60;
export const CONTEST_IMAGE_SECONDS = 5;

// A claimed video length is client-reported and the server has no way to read a file at an arbitrary
// URL, so it can only be bounded. A view never qualifies in under this many seconds whatever length is
// claimed: it stops a claimed "0.5 second video" from earning a point from a single beat.
export const MIN_REQUIRED_SECONDS = 1;

// v1 HEURISTIC, the same one apps/web/src/lib/media.ts uses and for the same reason: Post.mediaUrls is a
// bare list of URL strings with no media type. A URL is a video iff its path ends in a common video
// extension (query string and fragment ignored). An extensionless or signed URL is not recognised, and
// so is treated as a photo (the shorter, 3-5 second rule) -- a known limit, listed in the report.
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v', '.ogv'];

function isVideoUrl(url: string): boolean {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url.split(/[?#]/)[0];
  }
  const lower = path.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** A post's media kind, decided by the SERVER from the post, never by the client. */
export function classifyPostMedia(mediaUrls: readonly string[]): PostMediaKind {
  if (mediaUrls.some(isVideoUrl)) return 'video';
  return mediaUrls.length > 0 ? 'photo' : 'text';
}

/** Seconds of active viewing for the BASELINE view point (spec 9c, "Baseline" table). */
export function baselineRequiredSeconds(kind: PostMediaKind, claimedDurationSeconds: number | undefined): number {
  if (kind !== 'video') return BASELINE_IMAGE_OR_TEXT_SECONDS;
  // Shorter than 60 seconds: the full length. Otherwise (or if no length was claimed): 60 seconds.
  const length = claimedDurationSeconds ?? BASELINE_VIDEO_MAX_REQUIRED_SECONDS;
  return Math.max(MIN_REQUIRED_SECONDS, Math.min(length, BASELINE_VIDEO_MAX_REQUIRED_SECONDS));
}

/** Seconds of active viewing for the CONTEST view (spec 9c, "Contest and competition tallies"). */
export function contestRequiredSeconds(
  kind: PostMediaKind,
  claimedDurationSeconds: number | undefined,
  weeklyLimitSeconds: number,
): number {
  if (kind !== 'video') return CONTEST_IMAGE_SECONDS;
  const length = claimedDurationSeconds ?? weeklyLimitSeconds;
  return Math.max(MIN_REQUIRED_SECONDS, Math.min(length, weeklyLimitSeconds));
}
