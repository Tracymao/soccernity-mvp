// Clubs API client -- Build Plan Section 4.4 (club subset).
//
// Both GET /clubs and POST /clubs/:id/join are JwtAuthGuard-only
// (services/api/src/modules/clubs/clubs.controller.ts) -- every call here
// requires a real access token. There is no public/unauthenticated
// clubs-list route (see sprint-2/club-picker-ui's PR description for why
// that matters for where this client is used).
//
// Shape mirrors services/api/src/modules/clubs/clubs.service.ts's
// ClubSummaryWithViewerState / ClubPageResult / JoinState exactly.
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
