// Users API client -- Build Plan Section 4.2, following the api/*.ts
// convention established by api/clubs.ts (typed *ApiError class, Bearer
// header attachment for authenticated calls) rather than the older,
// POST-only lib/apiClient.ts/authApi.ts pattern -- see this PR's
// description for why (need authenticated GET support, which the older
// client doesn't have at all).
//
// Shape mirrors services/api/src/modules/users/users.service.ts's
// OWN_PROFILE_SELECT / OwnProfile exactly.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export interface UserProfile {
  id: string;
  email: string;
  phone: string | null;
  displayName: string;
  dateOfBirth: string;
  isMinor: boolean;
  role: "fan" | "player" | "admin" | string;
  verificationStatus: string;
  createdAt: string;
  clubAffiliationId: string | null;
}

// PATCH /users/:id's real, confirmed field allowlist (update-user.dto.ts)
// -- displayName and phone ONLY. Do not widen this without a matching
// services/api change; the backend's own ValidationPipe
// (whitelist: true, forbidNonWhitelisted: true) will 400 on anything else
// anyway, but this type keeps that constraint visible at the call site
// too.
export interface UpdateUserRequest {
  displayName?: string;
  phone?: string;
}

export interface FollowUserSummary {
  id: string;
  displayName: string;
}

export interface FollowPage {
  items: FollowUserSummary[];
  nextCursor: string | null;
}

export class UsersApiError extends Error {
  readonly status?: number;

  constructor(message: string, options?: { status?: number }) {
    super(message);
    this.name = "UsersApiError";
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
    throw new UsersApiError("Couldn't reach the Soccernity server.");
  }
}

export async function getUser(accessToken: string, userId: string): Promise<UserProfile> {
  const response = await authedFetch(`/users/${userId}`, accessToken);
  if (!response.ok) {
    throw new UsersApiError(`Couldn't load that profile (${response.status}).`, { status: response.status });
  }
  return (await response.json()) as UserProfile;
}

export async function updateUser(
  accessToken: string,
  userId: string,
  payload: UpdateUserRequest,
): Promise<UserProfile> {
  const response = await authedFetch(`/users/${userId}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let message = `Couldn't save those changes (${response.status}).`;
    const body = await response.json().catch(() => null);
    if (body && typeof body.message === "string") message = body.message;
    throw new UsersApiError(message, { status: response.status });
  }
  return (await response.json()) as UserProfile;
}

export async function getFollowers(
  accessToken: string,
  userId: string,
  cursor?: string,
): Promise<FollowPage> {
  const url = new URL(`${API_BASE_URL}/users/${userId}/followers`);
  if (cursor) url.searchParams.set("cursor", cursor);
  const response = await authedFetch(url.pathname + url.search, accessToken);
  if (!response.ok) {
    throw new UsersApiError(`Couldn't load followers (${response.status}).`, { status: response.status });
  }
  return (await response.json()) as FollowPage;
}

export async function getFollowing(
  accessToken: string,
  userId: string,
  cursor?: string,
): Promise<FollowPage> {
  const url = new URL(`${API_BASE_URL}/users/${userId}/following`);
  if (cursor) url.searchParams.set("cursor", cursor);
  const response = await authedFetch(url.pathname + url.search, accessToken);
  if (!response.ok) {
    throw new UsersApiError(`Couldn't load following (${response.status}).`, { status: response.status });
  }
  return (await response.json()) as FollowPage;
}

// POST /users/:id/follow -- JwtAuthGuard only. Idempotent (following
// someone you already follow still returns { following: true }). 400 if
// :id is the caller's own id; 404 if :id isn't a real, visible user.
// Lives here rather than in api/feed.ts because it's a User Service
// endpoint (Section 4.2) -- api/feed.ts is Section 4.3 only.
export async function followUser(accessToken: string, userId: string): Promise<{ following: boolean }> {
  const response = await authedFetch(`/users/${userId}/follow`, accessToken, { method: "POST" });
  if (!response.ok) {
    throw new UsersApiError(`Couldn't follow that user (${response.status}).`, { status: response.status });
  }
  return (await response.json()) as { following: boolean };
}

// DELETE /users/:id/follow -- JwtAuthGuard only. Idempotent (unfollowing
// someone you don't follow still succeeds with { following: false }).
export async function unfollowUser(accessToken: string, userId: string): Promise<{ following: boolean }> {
  const response = await authedFetch(`/users/${userId}/follow`, accessToken, { method: "DELETE" });
  if (!response.ok) {
    throw new UsersApiError(`Couldn't unfollow that user (${response.status}).`, { status: response.status });
  }
  return (await response.json()) as { following: boolean };
}
