// Search & Discovery client -- Build Plan Section 4.7's GET /search
// (services/api/src/modules/search/), the endpoint that closes Decision
// Log #139's parked people-search need.
//
// Genuinely public -- NO Authorization header, same category as
// api/blog.ts (GET /articles, GET /categories): SearchController carries
// no guard at all (search.controller.ts's own header comment). Follows
// blog.ts's plain-fetch convention rather than clubs.ts/grassroots.ts's
// authedFetch, since there is no access token to attach.
//
// Response shapes mirror services/api/src/modules/search/search.service.ts's
// SearchUserResult / SearchClubResult / SearchPostResult / SearchResultPage /
// SearchAllResult exactly. `q` is required (2-100 chars, trimmed
// server-side -- see that file's own normalizeQuery comment); a query
// under 2 characters after trimming is a 400 there, so callers here debounce
// and skip the call rather than let every keystroke round-trip a guaranteed
// failure.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export type SearchScope = "users" | "clubs" | "posts";

// Narrow, safe-to-expose field set -- id + displayName only, never
// isMinor, and no @handle/username column exists anywhere on User
// (Decision Log #58) to search on or return either (search.service.ts's
// own SEARCH_USER_SELECT comment).
export interface SearchUserResult {
  id: string;
  displayName: string;
}

// Same field set GET /clubs itself returns, minus the per-caller `joined`
// boolean (Decision Log #154) -- GET /search carries no auth, so there is
// no calling user to compute that against.
export interface SearchClubResult {
  id: string;
  name: string;
  league: string | null;
  country: string | null;
  logoUrl: string | null;
  memberCount: number;
}

export interface SearchPostResult {
  id: string;
  contentText: string;
  author: SearchUserResult;
  createdAt: string;
  likeCount: number;
  commentCount: number;
}

export interface SearchResultPage<T> {
  items: T[];
  nextCursor: string | null;
}

// GET /search's response shape when `scope` is omitted -- all three
// result types, each independently keyset-paginated (its own
// `nextCursor`). To page further into just one group, switch to a scoped
// call using that group's own `nextCursor` (see `search()`'s overloads
// below).
export interface SearchAllResult {
  users: SearchResultPage<SearchUserResult>;
  clubs: SearchResultPage<SearchClubResult>;
  posts: SearchResultPage<SearchPostResult>;
}

export class SearchApiError extends Error {
  readonly status?: number;

  constructor(message: string, options?: { status?: number }) {
    super(message);
    this.name = "SearchApiError";
    this.status = options?.status;
  }
}

async function get<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`);
  } catch {
    throw new SearchApiError("Couldn't reach the Soccernity server.");
  }

  if (!response.ok) {
    // A 400 here (e.g. a too-short `q`, or a cursor with no scope --
    // SearchQueryDto / SearchService.search's own cross-field checks)
    // carries a real, useful server message -- surfaced verbatim rather
    // than a generic fallback, the same "write endpoint" choice
    // grassroots.ts's own header comment documents for its guard 403s,
    // applied here to a validation 400 instead.
    const body = await response.json().catch(() => null);
    const message =
      body && typeof body.message === "string"
        ? body.message
        : body && Array.isArray(body.message) && typeof body.message[0] === "string"
          ? body.message[0]
          : `Couldn't search (${response.status}).`;
    throw new SearchApiError(message, { status: response.status });
  }

  return (await response.json()) as T;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

// GET /search?q= -- `scope` omitted, all three groups at once. Mirrors
// SearchService.search's own no-`scope` branch. Deliberately NOT an
// overloaded single `search()` function (unlike this file's earlier
// draft) -- no api/*.ts client in this codebase uses TS overloads, and
// vi.mocked()'s type inference over an overloaded function resolves to
// the wrong signature at test call sites. Four plain functions instead,
// mirroring search.service.ts's own search() dispatcher +
// searchUsers/searchClubs/searchPosts methods 1:1.
export function searchAll(q: string): Promise<SearchAllResult> {
  const qs = buildQuery({ q });
  return get(`/search${qs}`);
}

// GET /search?q=&scope=users&cursor=&limit= -- a single opaque cursor
// cannot disambiguate which of the three differently-ordered lists it
// continues (SearchQueryDto's own header comment), so paging further into
// one group always means a scoped call like this one, using that group's
// own `nextCursor`.
export function searchUsers(q: string, cursor?: string, limit?: number): Promise<SearchResultPage<SearchUserResult>> {
  const qs = buildQuery({ q, scope: "users", cursor, limit });
  return get(`/search${qs}`);
}

export function searchClubs(q: string, cursor?: string, limit?: number): Promise<SearchResultPage<SearchClubResult>> {
  const qs = buildQuery({ q, scope: "clubs", cursor, limit });
  return get(`/search${qs}`);
}

export function searchPosts(q: string, cursor?: string, limit?: number): Promise<SearchResultPage<SearchPostResult>> {
  const qs = buildQuery({ q, scope: "posts", cursor, limit });
  return get(`/search${qs}`);
}
