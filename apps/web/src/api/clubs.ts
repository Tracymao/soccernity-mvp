// Clubs API client -- Build Plan Section 4.4 (club subset).
//
// Both GET /clubs and POST /clubs/:id/join are JwtAuthGuard-only
// (services/api/src/modules/clubs/clubs.controller.ts) -- every call here
// requires a real access token. There is no public/unauthenticated
// clubs-list route (see sprint-2/club-picker-ui's PR description for why
// that matters for where this client is used).
//
// Shape mirrors services/api/src/modules/clubs/clubs.service.ts's
// CLUB_SELECT / ClubPageResult / JoinState exactly.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export interface ClubSummary {
  id: string;
  name: string;
  league: string | null;
  country: string | null;
  logoUrl: string | null;
  memberCount: number;
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
