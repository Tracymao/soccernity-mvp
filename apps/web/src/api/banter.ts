// Banter Rooms client -- Build Plan Section 4.4 (the /banter-rooms half).
//
// Backs BanterPage.tsx / BanterRoomPage.tsx. The full BanterModule is
// merged in services/api (sprint-3/banter-rooms-backend; Decision Log
// #275/#276) -- this is not sample-data scaffolding (see
// pages/banter/banterData.ts's own header comment for what's still
// illustrative: Trending News, Fixtures, Suggested -- none of that is a
// Banter Room concern), every function here hits a real endpoint.
//
// Follows the api/*.ts convention (api/clubs.ts, api/grassroots.ts): a
// shared authedFetch wrapper, a typed BanterApiError carrying `.status`
// for 404 handling at the call site, API_BASE_URL from
// VITE_API_BASE_URL, a Bearer access-token header on every call,
// cursor-based pagination.
//
// Guard notes worth knowing at the call site (banter.controller.ts):
//   - GET /banter-rooms, GET /banter-rooms/search, GET /banter-rooms/mine,
//     GET /banter-rooms/:id and GET /banter-rooms/:id/posts are all
//     JwtAuthGuard only.
//   - POST /banter-rooms, POST/DELETE /banter-rooms/:id/join and POST
//     /banter-rooms/:id/posts are ADDITIONALLY gated by
//     GuardianConsentGuard -- a restricted-pending minor gets a 403 on
//     those. The write helpers below surface the server's own message
//     verbatim so the caller can tell a 403 (consent) from a 403
//     (not-a-member, on posting) apart.
//   - POST /banter-rooms/:id/posts requires room MEMBERSHIP -- a
//     non-member gets a 403 ("You must join this Banter Room before
//     posting in it").
//
// Response shapes mirror services/api/src/modules/banter/banter.service.ts's
// ROOM_SELECT / BanterRoomView / BanterRoomPage exactly.
import type { FeedPage, CreatedPost } from "./feed";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

// BanterRoom.scopeType allow-list (banter.constants.ts: BANTER_ROOM_SCOPE_TYPES).
export type BanterRoomScopeType = "club" | "league" | "country" | "topic";

// GET /banter-rooms, GET /banter-rooms/search, GET /banter-rooms/mine,
// GET /banter-rooms/:id, POST /banter-rooms (ROOM_SELECT). `createdBy` is
// an opaque id (no organiser PII) so a client can tell whether the caller
// created the room. `joined` is per-caller, computed server-side
// (Decision Log #154 pattern) -- never derived client-side.
export interface BanterRoom {
  id: string;
  name: string;
  scopeType: BanterRoomScopeType;
  createdBy: string;
  memberCount: number;
  joined: boolean;
}

export interface BanterRoomPage {
  items: BanterRoom[];
  nextCursor: string | null;
}

export interface CreateBanterRoomRequest {
  name: string;
  scopeType: BanterRoomScopeType;
}

// POST/DELETE /banter-rooms/:id/join.
export interface JoinRoomState {
  roomId: string;
  joined: boolean;
  memberCount: number;
}

export class BanterApiError extends Error {
  readonly status?: number;

  constructor(message: string, options?: { status?: number }) {
    super(message);
    this.name = "BanterApiError";
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
    throw new BanterApiError("Couldn't reach the Soccernity server.");
  }
}

// Pull the server's own message off a NestJS error body ({ message } or
// { message: string[] }). Same helper feed.ts / grassroots.ts use.
async function errorMessageFrom(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  if (body && typeof body.message === "string") return body.message;
  if (body && Array.isArray(body.message) && typeof body.message[0] === "string") return body.message[0];
  return fallback;
}

// POST /banter-rooms -- JwtAuthGuard + GuardianConsentGuard. A 403 means
// the caller is a restricted-pending minor. The creator is auto-joined
// server-side (BanterService.createRoom), so the returned room already
// has `joined: true`.
export async function createRoom(accessToken: string, payload: CreateBanterRoomRequest): Promise<BanterRoom> {
  const response = await authedFetch("/banter-rooms", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new BanterApiError(
      await errorMessageFrom(response, `Couldn't create that room (${response.status}).`),
      { status: response.status },
    );
  }
  return (await response.json()) as BanterRoom;
}

// GET /banter-rooms -- optional `scopeType` exact-match filter, optional
// `q` case-insensitive substring match on `name` (real server-side search
// -- Section 4.4's own GET /banter-rooms/search?q= shares this same
// filter mechanism, see searchRooms below). Keyset-paginated.
export async function listRooms(
  accessToken: string,
  opts?: { scopeType?: BanterRoomScopeType; q?: string; cursor?: string },
): Promise<BanterRoomPage> {
  const url = new URL(`${API_BASE_URL}/banter-rooms`);
  if (opts?.scopeType) url.searchParams.set("scopeType", opts.scopeType);
  if (opts?.q) url.searchParams.set("q", opts.q);
  if (opts?.cursor) url.searchParams.set("cursor", opts.cursor);

  const response = await authedFetch(url.pathname + url.search, accessToken);
  if (!response.ok) {
    throw new BanterApiError(`Couldn't load rooms (${response.status}).`, { status: response.status });
  }
  return (await response.json()) as BanterRoomPage;
}

// GET /banter-rooms/search?q= -- Section 4.4's literal search route.
// Shares the exact same filter mechanism as listRooms (BanterService
// backs both with one method) -- kept as a separate client function only
// because it's the named endpoint the search box maps to.
export async function searchRooms(
  accessToken: string,
  q: string,
  cursor?: string,
): Promise<BanterRoomPage> {
  const url = new URL(`${API_BASE_URL}/banter-rooms/search`);
  url.searchParams.set("q", q);
  if (cursor) url.searchParams.set("cursor", cursor);

  const response = await authedFetch(url.pathname + url.search, accessToken);
  if (!response.ok) {
    throw new BanterApiError(`Couldn't search rooms (${response.status}).`, { status: response.status });
  }
  return (await response.json()) as BanterRoomPage;
}

// GET /banter-rooms/mine -- "My Bants" (Build Plan Section 6, Sprint 3).
// Every item's `joined` is a hard `true` (the room list is defined as
// "rooms the caller is a member of").
export async function getMyRooms(accessToken: string, cursor?: string): Promise<BanterRoomPage> {
  const url = new URL(`${API_BASE_URL}/banter-rooms/mine`);
  if (cursor) url.searchParams.set("cursor", cursor);

  const response = await authedFetch(url.pathname + url.search, accessToken);
  if (!response.ok) {
    throw new BanterApiError(`Couldn't load your rooms (${response.status}).`, { status: response.status });
  }
  return (await response.json()) as BanterRoomPage;
}

// GET /banter-rooms/:id -- a single room. A missing room is a real 404
// from the server, surfaced here as a BanterApiError with status 404
// (the caller inspects `.status`, same as ClubFanPage/GrassrootsTeamPage).
export async function getRoomById(accessToken: string, roomId: string): Promise<BanterRoom> {
  const response = await authedFetch(`/banter-rooms/${roomId}`, accessToken);
  if (!response.ok) {
    throw new BanterApiError(`Couldn't load that room (${response.status}).`, { status: response.status });
  }
  return (await response.json()) as BanterRoom;
}

// POST /banter-rooms/:id/join -- JwtAuthGuard + GuardianConsentGuard.
// Idempotent (already a member -> 200, unchanged memberCount).
export async function joinRoom(accessToken: string, roomId: string): Promise<JoinRoomState> {
  const response = await authedFetch(`/banter-rooms/${roomId}/join`, accessToken, { method: "POST" });
  if (!response.ok) {
    throw new BanterApiError(
      await errorMessageFrom(response, `Couldn't join that room (${response.status}).`),
      { status: response.status },
    );
  }
  return (await response.json()) as JoinRoomState;
}

// DELETE /banter-rooms/:id/join -- JwtAuthGuard + GuardianConsentGuard.
// Idempotent (not a member -> 200, unchanged memberCount).
export async function leaveRoom(accessToken: string, roomId: string): Promise<JoinRoomState> {
  const response = await authedFetch(`/banter-rooms/${roomId}/join`, accessToken, { method: "DELETE" });
  if (!response.ok) {
    throw new BanterApiError(
      await errorMessageFrom(response, `Couldn't leave that room (${response.status}).`),
      { status: response.status },
    );
  }
  return (await response.json()) as JoinRoomState;
}

// POST /banter-rooms/:id/posts -- JwtAuthGuard + GuardianConsentGuard +
// room membership (403 if not a member -- "You must join this Banter
// Room before posting in it"). Delegates server-side to
// FeedService.createPost, so the response is a plain FeedPost (no
// per-caller viewer-state fields -- Decision Log #153's exact "a post you
// just created" case, same as api/feed.ts's createPost/CreatedPost).
export interface CreateBanterPostRequest {
  contentText: string;
  mediaUrls?: string[];
}

export async function postToRoom(
  accessToken: string,
  roomId: string,
  payload: CreateBanterPostRequest,
): Promise<CreatedPost> {
  const response = await authedFetch(`/banter-rooms/${roomId}/posts`, accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new BanterApiError(
      await errorMessageFrom(response, `Couldn't post in that room (${response.status}).`),
      { status: response.status },
    );
  }
  return (await response.json()) as CreatedPost;
}

// GET /banter-rooms/:id/posts -- the room feed. Identical FeedPage /
// FeedPostWithViewerState shape to GET /posts/feed / GET /clubs/:id/feed
// (BanterController delegates to FeedService.getBanterRoomFeed
// server-side, the exact same cross-module-DI pattern
// GET /clubs/:id/feed uses) -- reuse api/feed.ts's own FeedPage type
// rather than redeclaring it here, matching api/clubs.ts's getClubFeed.
export async function getRoomFeed(accessToken: string, roomId: string, cursor?: string): Promise<FeedPage> {
  const url = new URL(`${API_BASE_URL}/banter-rooms/${roomId}/posts`);
  if (cursor) url.searchParams.set("cursor", cursor);

  const response = await authedFetch(url.pathname + url.search, accessToken);
  if (!response.ok) {
    throw new BanterApiError(`Couldn't load this room's posts (${response.status}).`, {
      status: response.status,
    });
  }
  return (await response.json()) as FeedPage;
}
