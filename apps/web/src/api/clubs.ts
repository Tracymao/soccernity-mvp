// Clubs API client -- Build Plan Section 4.4 (club subset).
//
// Every route is JwtAuthGuard-only
// (services/api/src/modules/clubs/clubs.controller.ts) -- every call here
// requires a real access token. There is no public/unauthenticated
// clubs route (see sprint-2/club-picker-ui's PR description for why that
// matters for where this client is used).
//
// Shape mirrors services/api/src/modules/clubs/clubs.service.ts's
// ClubSummaryWithViewerState / ClubPageResult / JoinState / ClubMemberPage
// exactly. GET /clubs/:id/feed (sprint-2/club-fan-page-backend) delegates
// server-side to FeedService.getClubFeed, so its response is the exact
// FeedPage shape api/feed.ts already models -- imported from there rather
// than redeclared.
import type { FeedPage } from "./feed";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export interface ClubSummary {
  id: string;
  name: string;
  league: string | null;
  country: string | null;
  logoUrl: string | null;
  memberCount: number;
  // Per-calling-user viewer state (Decision Log #154, services/api PR
  // #138). `true` iff the caller is already a member of this club.
  // Returned by GET /clubs and GET /clubs/:id. POST/DELETE
  // /clubs/:id/join's JoinClubResult carries its own `joined` separately
  // (that's the action result, unrelated to this list-response field).
  joined: boolean;
}

export interface ClubPageResult {
  items: ClubSummary[];
  nextCursor: string | null;
}

export interface JoinClubResult {
  clubId: string;
  joined: boolean;
  memberCount: number;
}

// GET /clubs/:id/members roster entry. Mirrors services/api
// clubs.service.ts's ClubMember exactly: { id, displayName } only. There
// is NO @handle / avatar field (no such `User` column -- Decision Log
// #58; the Figma roster's "@handle" text is decorative), and NO
// per-caller `isFollowing` flag (unlike GET /posts/feed's author, which
// carries one -- Decision Log #153). The roster server-side already
// excludes restricted-pending minors and deactivated accounts
// (Decision Log #217/#221), so the visible list can be shorter than the
// club's memberCount.
export interface ClubMember {
  id: string;
  displayName: string;
}

export interface ClubMemberPage {
  items: ClubMember[];
  nextCursor: string | null;
}

export class ClubsApiError extends Error {
  readonly status?: number;

  constructor(message: string, options?: { status?: number }) {
    super(message);
    this.name = "ClubsApiError";
    this.status = options?.status;
  }
}

export async function listClubs(accessToken: string, cursor?: string): Promise<ClubPageResult> {
  const url = new URL(`${API_BASE_URL}/clubs`);
  if (cursor) url.searchParams.set("cursor", cursor);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new ClubsApiError("Couldn't reach the Soccernity server.");
  }

  if (!response.ok) {
    throw new ClubsApiError(`Couldn't load clubs (${response.status}).`, { status: response.status });
  }

  return (await response.json()) as ClubPageResult;
}

// GET /clubs/:id -- a single club, same ClubSummary shape as the list
// entries (services/api clubs.service.ts's getClubById). A missing club is
// a real 404 from the server; surfaced here as a ClubsApiError with
// status 404, deliberately NOT a distinct error type -- the caller
// (ClubFanPage.tsx) decides whether to render "club not found" vs a
// generic load error by inspecting `.status`.
export async function getClubById(accessToken: string, clubId: string): Promise<ClubSummary> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/clubs/${clubId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new ClubsApiError("Couldn't reach the Soccernity server.");
  }

  if (!response.ok) {
    throw new ClubsApiError(`Couldn't load that club (${response.status}).`, { status: response.status });
  }

  return (await response.json()) as ClubSummary;
}

// GET /clubs/:id/feed -- the club fan-page feed: every Post whose
// clubPageId matches, newest-first, keyset-paginated (default 20 / max
// 50). NOT the same as GET /posts/feed (that one is the caller's own
// posts + follows and never reads clubPageId) -- but the server delegates
// to FeedService, so the response shape is identical: a FeedPage with the
// per-caller isLiked / isSaved / author.isFollowing viewer state
// (Decision Log #153). JwtAuthGuard-only; a non-existent :id is a 404.
export async function getClubFeed(
  accessToken: string,
  clubId: string,
  cursor?: string,
): Promise<FeedPage> {
  const url = new URL(`${API_BASE_URL}/clubs/${clubId}/feed`);
  if (cursor) url.searchParams.set("cursor", cursor);

  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new ClubsApiError("Couldn't reach the Soccernity server.");
  }

  if (!response.ok) {
    throw new ClubsApiError(`Couldn't load this club's feed (${response.status}).`, { status: response.status });
  }

  return (await response.json()) as FeedPage;
}

// GET /clubs/:id/members -- the club roster, paginated alphabetically by
// displayName. JwtAuthGuard-only; a non-existent :id is a 404.
export async function getClubMembers(
  accessToken: string,
  clubId: string,
  cursor?: string,
): Promise<ClubMemberPage> {
  const url = new URL(`${API_BASE_URL}/clubs/${clubId}/members`);
  if (cursor) url.searchParams.set("cursor", cursor);

  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new ClubsApiError("Couldn't reach the Soccernity server.");
  }

  if (!response.ok) {
    throw new ClubsApiError(`Couldn't load this club's members (${response.status}).`, { status: response.status });
  }

  return (await response.json()) as ClubMemberPage;
}

export async function joinClub(accessToken: string, clubId: string): Promise<JoinClubResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/clubs/${clubId}/join`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new ClubsApiError("Couldn't reach the Soccernity server.");
  }

  if (!response.ok) {
    throw new ClubsApiError(`Couldn't join that club (${response.status}).`, { status: response.status });
  }

  return (await response.json()) as JoinClubResult;
}

// DELETE /clubs/:id/join -- the mirror of joinClub. Same method-only
// difference the backend uses (POST/DELETE on the same path,
// clubs.controller.ts), same JoinClubResult return (its `joined: boolean`
// is deliberately not a literal-true type -- clubs.service.ts's own
// comment -- so one shape serves both directions). Idempotent server-side:
// leaving a club you're not in is a 200, not a 404.
export async function leaveClub(accessToken: string, clubId: string): Promise<JoinClubResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/clubs/${clubId}/join`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new ClubsApiError("Couldn't reach the Soccernity server.");
  }

  if (!response.ok) {
    throw new ClubsApiError(`Couldn't leave that club (${response.status}).`, { status: response.status });
  }

  return (await response.json()) as JoinClubResult;
}
