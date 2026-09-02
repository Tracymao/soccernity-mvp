// Feed Service client -- Build Plan Section 4.3.
//
// Follows the api/*.ts convention established by api/clubs.ts and
// api/users.ts: an own fetch wrapper, an own typed *ApiError class, an
// API_BASE_URL constant reading VITE_API_BASE_URL (falling back to
// services/api's default local port), a Bearer access-token auth header
// on every call, and cursor-based pagination on the list endpoints.
//
// Every route here requires a real access token -- there is no
// public/unauthenticated feed route (see feed.controller.ts). Guard
// notes worth knowing at the call site:
//   - POST /posts and POST /posts/:id/comments are additionally gated by
//     GuardianConsentGuard, so a restricted-pending minor gets a 403 on
//     those two specific actions (createPost / addComment surface that as
//     FeedApiError with status 403 -- the caller decides how to present
//     it, e.g. a link to /guardian-consent).
//   - like/unlike, save/unsave, and GET /posts/feed are JwtAuthGuard-only.
//
// Response shapes mirror services/api/src/modules/feed/feed.service.ts's
// POST_SELECT / COMMENT_SELECT / LikeState / SaveState / FeedPage /
// CommentPage exactly.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export interface FeedPostAuthor {
  id: string;
  displayName: string;
}

export interface FeedPost {
  id: string;
  authorId: string;
  author: FeedPostAuthor;
  contentText: string;
  mediaUrls: string[];
  clubPageId: string | null;
  banterRoomId: string | null;
  likeCount: number;
  commentCount: number;
  createdAt: string;
}

export interface FeedPage {
  items: FeedPost[];
  nextCursor: string | null;
}

export interface FeedComment {
  id: string;
  postId: string;
  authorId: string;
  author: FeedPostAuthor;
  contentText: string;
  createdAt: string;
}

export interface CommentPage {
  items: FeedComment[];
  nextCursor: string | null;
}

// POST /posts/:id/like and DELETE /posts/:id/like both return this.
// `liked` is the resulting state; `likeCount` is the fresh server count.
export interface LikeState {
  postId: string;
  liked: boolean;
  likeCount: number;
}

// POST /posts/:id/save and DELETE /posts/:id/save both return this.
export interface SaveState {
  postId: string;
  saved: boolean;
}

// CreatePostDto's real, confirmed allowlist (create-post.dto.ts):
// contentText (1-3000 chars, required), mediaUrls (optional, max 10, each
// a valid URL), clubPageId / banterRoomId (optional, mutually exclusive).
// The web composer only sends contentText today -- there is no media
// upload endpoint anywhere in Section 4 yet, so mediaUrls is typed here
// for completeness but not populated by the current UI (see
// CommunityPage's composer and this PR's report).
export interface CreatePostRequest {
  contentText: string;
  mediaUrls?: string[];
  clubPageId?: string;
  banterRoomId?: string;
}

export class FeedApiError extends Error {
  readonly status?: number;

  constructor(message: string, options?: { status?: number }) {
    super(message);
    this.name = "FeedApiError";
    this.status = options?.status;
  }
}

interface AuthedFetchInit {
  method?: string;
  body?: string;
}

async function authedFetch(path: string, accessToken: string, init?: AuthedFetchInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method: init?.method,
      body: init?.body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch {
    throw new FeedApiError("Couldn't reach the Soccernity server.");
  }
}

async function errorMessageFrom(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  if (body && typeof body.message === "string") return body.message;
  if (body && Array.isArray(body.message) && typeof body.message[0] === "string") return body.message[0];
  return fallback;
}

// GET /posts/feed -- the caller's own posts plus posts by users they
// follow, most-recent-first, keyset-paginated (default 20 / max 50).
export async function getFeed(accessToken: string, cursor?: string): Promise<FeedPage> {
  const url = new URL(`${API_BASE_URL}/posts/feed`);
  if (cursor) url.searchParams.set("cursor", cursor);
  const response = await authedFetch(url.pathname + url.search, accessToken);
  if (!response.ok) {
    throw new FeedApiError(`Couldn't load your feed (${response.status}).`, { status: response.status });
  }
  return (await response.json()) as FeedPage;
}

// POST /posts -- JwtAuthGuard + GuardianConsentGuard. A 403 here means the
// caller is a restricted-pending minor.
export async function createPost(accessToken: string, payload: CreatePostRequest): Promise<FeedPost> {
  const response = await authedFetch("/posts", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new FeedApiError(
      await errorMessageFrom(response, `Couldn't publish that post (${response.status}).`),
      { status: response.status },
    );
  }
  return (await response.json()) as FeedPost;
}

// POST /posts/:id/like -- idempotent toggle-on (200 even if already liked).
export async function likePost(accessToken: string, postId: string): Promise<LikeState> {
  const response = await authedFetch(`/posts/${postId}/like`, accessToken, { method: "POST" });
  if (!response.ok) {
    throw new FeedApiError(`Couldn't like that post (${response.status}).`, { status: response.status });
  }
  return (await response.json()) as LikeState;
}

// DELETE /posts/:id/like -- idempotent toggle-off (200 even if not liked).
export async function unlikePost(accessToken: string, postId: string): Promise<LikeState> {
  const response = await authedFetch(`/posts/${postId}/like`, accessToken, { method: "DELETE" });
  if (!response.ok) {
    throw new FeedApiError(`Couldn't remove that like (${response.status}).`, { status: response.status });
  }
  return (await response.json()) as LikeState;
}

// POST /posts/:id/save -- idempotent toggle-on.
export async function savePost(accessToken: string, postId: string): Promise<SaveState> {
  const response = await authedFetch(`/posts/${postId}/save`, accessToken, { method: "POST" });
  if (!response.ok) {
    throw new FeedApiError(`Couldn't save that post (${response.status}).`, { status: response.status });
  }
  return (await response.json()) as SaveState;
}

// DELETE /posts/:id/save -- idempotent toggle-off.
export async function unsavePost(accessToken: string, postId: string): Promise<SaveState> {
  const response = await authedFetch(`/posts/${postId}/save`, accessToken, { method: "DELETE" });
  if (!response.ok) {
    throw new FeedApiError(`Couldn't unsave that post (${response.status}).`, { status: response.status });
  }
  return (await response.json()) as SaveState;
}

// GET /posts/:id/comments -- oldest-first, keyset-paginated.
export async function getComments(accessToken: string, postId: string, cursor?: string): Promise<CommentPage> {
  const url = new URL(`${API_BASE_URL}/posts/${postId}/comments`);
  if (cursor) url.searchParams.set("cursor", cursor);
  const response = await authedFetch(url.pathname + url.search, accessToken);
  if (!response.ok) {
    throw new FeedApiError(`Couldn't load comments (${response.status}).`, { status: response.status });
  }
  return (await response.json()) as CommentPage;
}

// POST /posts/:id/comments -- JwtAuthGuard + GuardianConsentGuard. A 403
// here means the caller is a restricted-pending minor.
export async function addComment(accessToken: string, postId: string, contentText: string): Promise<FeedComment> {
  const response = await authedFetch(`/posts/${postId}/comments`, accessToken, {
    method: "POST",
    body: JSON.stringify({ contentText }),
  });
  if (!response.ok) {
    throw new FeedApiError(
      await errorMessageFrom(response, `Couldn't add that comment (${response.status}).`),
      { status: response.status },
    );
  }
  return (await response.json()) as FeedComment;
}
