// Trending topics client -- Build Plan Section 4.7's GET /trending
// (services/api/src/modules/search/trending.controller.ts).
//
// Genuinely public -- NO Authorization header, same category as
// api/search.ts and api/blog.ts: TrendingController carries no guard at
// all. Shape mirrors trending.service.ts's TrendingHashtagResult /
// TrendingResult exactly.
//
// `tag` is stored lowercase WITHOUT the leading "#" (hashtag.util.ts) --
// callers add the "#" for display. `postCount` is the raw number of posts
// using the tag in the rolling window; `score` is the time-decayed sort
// key, meaningful only relative to the other items in the same response.
// There is no cursor: the endpoint's ordering is a snapshot score that
// reorders between calls, so `limit` (a plain top-N cut, max 50) is the
// only paging control.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export interface TrendingHashtag {
  tag: string;
  postCount: number;
  score: number;
}

export interface TrendingResult {
  items: TrendingHashtag[];
}

export class TrendingApiError extends Error {
  readonly status?: number;

  constructor(message: string, options?: { status?: number }) {
    super(message);
    this.name = "TrendingApiError";
    this.status = options?.status;
  }
}

export async function getTrending(limit?: number): Promise<TrendingResult> {
  const qs = limit !== undefined ? `?limit=${encodeURIComponent(String(limit))}` : "";
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/trending${qs}`);
  } catch {
    throw new TrendingApiError("Couldn't reach the Soccernity server.");
  }

  if (!response.ok) {
    throw new TrendingApiError(`Couldn't load trends (${response.status}).`, { status: response.status });
  }

  return (await response.json()) as TrendingResult;
}
