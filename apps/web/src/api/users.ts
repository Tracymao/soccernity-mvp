// Users API client -- Build Plan Section 4.2, following the api/*.ts
// convention established by api/clubs.ts (typed *ApiError class, Bearer
// header attachment for authenticated calls) rather than the older,
// POST-only lib/apiClient.ts/authApi.ts pattern -- see this PR's
// description for why (need authenticated GET support, which the older
// client doesn't have at all).
//
// Shape mirrors services/api/src/modules/users/users.service.ts's
// OWN_PROFILE_SELECT / OwnProfile exactly.
import type { GuardianConsentState, OnboardingNextStep } from "./auth";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export interface UserProfile {
  id: string;
  email: string;
  phone: string | null;
  displayName: string;
  // Optional handle (profile/username-column-and-display-convention).
  username: string | null;
  // What OTHER users see for this account: username, else displayName.
  publicName: string;
  dateOfBirth: string;
  isMinor: boolean;
  role: "fan" | "player" | "admin" | string;
  verificationStatus: string;
  createdAt: string;
  clubAffiliationId: string | null;
  // backend/team-organiser-flag -- set the moment POST /teams succeeds
  // (services/api's GrassrootsService.createTeam), read-only here -- there
  // is no code path in this app that writes it. Deliberately separate from
  // `role` above, which stays exactly as inert as it already is. Drives
  // the Grassroots create/manage-action visibility split (see
  // pages/grassroots/organiser.ts) -- browsing stays visible to every
  // logged-in user regardless of this flag.
  isTeamOrganiser: boolean;
  // Decision Log #74 -- the one club this user represents, or null. Written
  // only via setRepresentedClub below. `name` is included so the selector and
  // Leaderboard can show it without a second request.
  representedClub: { id: string; name: string } | null;
  // W5 / W6 (B-038, B-035, B-196): the owner's own profile content. `bio`,
  // `preferredClub` and `profileCountry` are null until filled in. `avatar` and
  // `cover` carry the review `status`: only the owner ever sees a `pending`
  // picture (nobody else can until the image check exists, #411 item 1).
  bio: string | null;
  // Free text, OWNER ONLY: no other user's response carries it (#411 item 3).
  preferredClub: string | null;
  // The OPTIONAL profile country, an ISO 3166-1 alpha-2 code (#403 item 17).
  // Never the safeguarding country, which no response returns.
  profileCountry: string | null;
  avatar: ProfileImage | null;
  cover: ProfileImage | null;
  // B-030 -- the server-computed onboarding state, the same three fields the
  // login/register response carries. Read fresh from Postgres on every call.
  profileComplete: boolean;
  guardianConsentStatus: GuardianConsentState;
  nextStep: OnboardingNextStep;
}

export type ProfileImageStatus = "pending" | "approved" | "rejected";

export interface ProfileImage {
  url: string;
  status: ProfileImageStatus;
  // Why a rejected picture was not approved, shown to its owner (#398 D2,
  // #412 item 2). The server does not send this yet (B-214 is not built), so
  // it is absent today and the page shows the rejection without a reason.
  reason?: string | null;
}

export interface RepresentedClubResult {
  representedClub: { id: string; name: string } | null;
}

// PATCH /users/:id's real, confirmed field allowlist (update-user.dto.ts)
// -- displayName, phone and username ONLY. Do not widen this without a matching
// services/api change; the backend's own ValidationPipe
// (whitelist: true, forbidNonWhitelisted: true) will 400 on anything else
// anyway, but this type keeps that constraint visible at the call site
// too.
export interface UpdateUserRequest {
  displayName?: string;
  phone?: string;
  // 3-30 chars, letters/digits/underscore, stored lowercase. The server
  // refuses `null` (a username can't be removed), so this never sends it.
  username?: string | null;
  // W5 (B-038): `null` or a blank string clears the field. bio <= 160 and
  // preferredClub <= 80 characters; both go through the sensitive-content
  // screen (a flagged value is a coded 422, see UsersApiError.flaggedFields).
  bio?: string | null;
  preferredClub?: string | null;
  // An ISO 3166-1 alpha-2 code from the full list, or null to clear.
  profileCountry?: string | null;
}

export interface FlaggedField {
  field: string;
  categories: string[];
}

// The code the server answers a flagged bio / preferred club with (422).
export const SENSITIVE_REPHRASE_CODE = "sensitive_content_rephrase_required";
// The only distinct answer a Block ever gives, and only to the blocker.
export const YOU_BLOCKED_THIS_USER_CODE = "you_blocked_this_user";

export interface FollowUserSummary {
  id: string;
  publicName: string;
}

export interface FollowPage {
  items: FollowUserSummary[];
  nextCursor: string | null;
}

export class UsersApiError extends Error {
  readonly status?: number;
  // The server's machine-readable error code when it sends one, e.g.
  // `username_not_allowed`, `username_change_cooldown`, `username_required`
  // (B-133). The user-readable `message` is already the server's own text.
  readonly code?: string;
  // Present on the sensitive-content 422: which request field(s) were flagged.
  // Field NAMES and categories only; the server never echoes the text.
  readonly flaggedFields?: FlaggedField[];

  constructor(message: string, options?: { status?: number; code?: string; flaggedFields?: FlaggedField[] }) {
    super(message);
    this.name = "UsersApiError";
    this.status = options?.status;
    this.code = options?.code;
    this.flaggedFields = options?.flaggedFields;
  }
}

interface AuthedFetchInit {
  method?: string;
  signal?: AbortSignal;
  // A JSON string, or a FormData for a file upload (the browser then sets the
  // multipart Content-Type with its boundary, so it must not be set here).
  body?: string | FormData;
}

/** Builds a UsersApiError from a non-OK response, keeping the server's own message and code. */
async function apiErrorFrom(response: Response, fallback: string): Promise<UsersApiError> {
  const body = await response.json().catch(() => null);
  let message = fallback;
  if (body && typeof body.message === "string") message = body.message;
  else if (body && Array.isArray(body.message) && typeof body.message[0] === "string") message = body.message[0];
  return new UsersApiError(message, {
    status: response.status,
    code: body && typeof body.code === "string" ? body.code : undefined,
    flaggedFields: body && Array.isArray(body.flaggedFields) ? (body.flaggedFields as FlaggedField[]) : undefined,
  });
}

async function authedFetch(path: string, accessToken: string, init?: AuthedFetchInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method: init?.method,
      body: init?.body,
      signal: init?.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(typeof init?.body === "string" ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch (error) {
    // A caller-initiated abort (the Cancel button on an upload) is not a network failure.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
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
    throw await apiErrorFrom(response, `Couldn't save those changes (${response.status}).`);
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

// GET /users/suggested?limit= -- JwtAuthGuard only (users.controller.ts).
// Returns { items: [{ id, displayName }] } -- the caller's own account,
// anyone they already follow, non-active accounts and restricted-pending
// minors are excluded server-side. No cursor (a small fixed top-N panel,
// `limit` max 50), no @handle/avatar (no such `User` column, Decision Log
// #58).
export interface SuggestedUsersResult {
  items: FollowUserSummary[];
}

export async function getSuggestedUsers(accessToken: string, limit?: number): Promise<SuggestedUsersResult> {
  const qs = limit !== undefined ? `?limit=${encodeURIComponent(String(limit))}` : "";
  const response = await authedFetch(`/users/suggested${qs}`, accessToken);
  if (!response.ok) {
    throw new UsersApiError(`Couldn't load suggestions (${response.status}).`, { status: response.status });
  }
  return (await response.json()) as SuggestedUsersResult;
}

// POST /users/:id/follow -- JwtAuthGuard only. Idempotent (following
// someone you already follow still returns { following: true }). 400 if
// :id is the caller's own id; 404 if :id isn't a real, visible user.
// Lives here rather than in api/feed.ts because it's a User Service
// endpoint (Section 4.2) -- api/feed.ts is Section 4.3 only.
export async function followUser(accessToken: string, userId: string): Promise<{ following: boolean }> {
  const response = await authedFetch(`/users/${userId}/follow`, accessToken, { method: "POST" });
  if (!response.ok) {
    throw await apiErrorFrom(response, `Couldn't follow that user (${response.status}).`);
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

// PATCH /users/:id/represented-club (Decision Log #74) — the one club this
// user represents for Leaderboard points/By-club scope. `clubId: null`
// unrepresents. The server rejects any club the caller hasn't joined
// (400), so the client only ever offers joined clubs.
export async function setRepresentedClub(
  accessToken: string,
  userId: string,
  clubId: string | null,
): Promise<RepresentedClubResult> {
  const response = await authedFetch(`/users/${userId}/represented-club`, accessToken, {
    method: "PATCH",
    body: JSON.stringify({ clubId }),
  });
  if (!response.ok) {
    let message = `Couldn't update your represented club (${response.status}).`;
    const body = await response.json().catch(() => null);
    if (body && typeof body.message === "string") message = body.message;
    throw new UsersApiError(message, { status: response.status });
  }
  return (await response.json()) as RepresentedClubResult;
}

// --- Profile pictures (W5 B-035 avatar, W6 B-196 cover) ---------------------
// POST /users/:id/avatar and /cover take a multipart `file` (JPEG, PNG or WebP,
// at most 5 MB, magic bytes checked); DELETE removes it. Both answer
// `{ avatar }` / `{ cover }` with the new state, `null` after a delete. A new
// upload is `pending`: invisible to everyone but its owner until the image
// check and review queue exist (#411 item 1, B-036, B-037). With no object
// store configured the server answers 503 and writes nothing.
export const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ProfileImageKind = "avatar" | "cover";

export async function uploadProfileImage(
  accessToken: string,
  userId: string,
  kind: ProfileImageKind,
  file: Blob,
  filename = "upload",
  signal?: AbortSignal,
): Promise<ProfileImage | null> {
  const form = new FormData();
  form.append("file", file, filename);
  const response = await authedFetch(`/users/${userId}/${kind}`, accessToken, { method: "POST", body: form, signal });
  if (!response.ok) {
    throw await apiErrorFrom(response, `Couldn't upload that picture (${response.status}).`);
  }
  const body = (await response.json()) as { avatar?: ProfileImage | null; cover?: ProfileImage | null };
  return (kind === "avatar" ? body.avatar : body.cover) ?? null;
}

export async function deleteProfileImage(
  accessToken: string,
  userId: string,
  kind: ProfileImageKind,
): Promise<void> {
  const response = await authedFetch(`/users/${userId}/${kind}`, accessToken, { method: "DELETE" });
  if (!response.ok) {
    throw await apiErrorFrom(response, `Couldn't remove that picture (${response.status}).`);
  }
}

// --- Another user's profile (W5 B-082) --------------------------------------
// GET /users/:id/public-profile. Any signed-in viewer. The same plain 404 comes
// back for a missing profile, a restricted-pending minor, a non-active account
// and a viewer who has been BLOCKED by the owner, so the page can never tell
// them apart (#404 item 11, #406 item 12). `avatarUrl` / `coverUrl` are
// approved pictures only, so they are null today.
export interface PublicProfile {
  id: string;
  publicName: string;
  guardianContact: { label: "Guardian contact"; email: string } | null;
  bio: string | null;
  // The optional profile country (ISO alpha-2), present only if the person
  // filled it in. Never the safeguarding country.
  country: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  isFollowing: boolean;
  // True when the VIEWER has blocked this user (the only block state a viewer can see).
  viewerHasBlocked: boolean;
}

export async function getPublicProfile(accessToken: string, userId: string): Promise<PublicProfile> {
  const response = await authedFetch(`/users/${userId}/public-profile`, accessToken);
  if (!response.ok) {
    throw await apiErrorFrom(response, `Couldn't load that profile (${response.status}).`);
  }
  return (await response.json()) as PublicProfile;
}

// --- Block (W5 B-039, W6 B-197) ---------------------------------------------
// Authentication only: a restricted-pending or unverified account can still
// block someone. Block hides content both ways and stops follows and messages
// in both directions; the blocked person is never told. Unblocking does NOT
// restore the follows the block removed (#402 item 4).
export interface BlockedUserEntry {
  id: string;
  publicName: string;
  // The blocker's own note, never shown to anyone else. No date is returned.
  reason: string | null;
}

export interface BlockedUserPage {
  items: BlockedUserEntry[];
  nextCursor: string | null;
}

export async function blockUser(accessToken: string, userId: string, reason?: string): Promise<void> {
  const trimmed = reason?.trim();
  const response = await authedFetch(`/users/${userId}/block`, accessToken, {
    method: "POST",
    body: JSON.stringify(trimmed ? { reason: trimmed } : {}),
  });
  if (!response.ok) {
    throw await apiErrorFrom(response, `Couldn't block that user (${response.status}).`);
  }
}

export async function unblockUser(accessToken: string, userId: string): Promise<void> {
  const response = await authedFetch(`/users/${userId}/block`, accessToken, { method: "DELETE" });
  if (!response.ok) {
    throw await apiErrorFrom(response, `Couldn't unblock that user (${response.status}).`);
  }
}

export async function getBlockedUsers(
  accessToken: string,
  myUserId: string,
  cursor?: string,
): Promise<BlockedUserPage> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const response = await authedFetch(`/users/${myUserId}/blocks${qs}`, accessToken);
  if (!response.ok) {
    throw await apiErrorFrom(response, `Couldn't load your blocked users (${response.status}).`);
  }
  return (await response.json()) as BlockedUserPage;
}
