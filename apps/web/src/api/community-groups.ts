// Community Groups API client -- Build Plan Sprint 3, Decision Log #281.
//
// Backs the Community Groups screens (Figma "Community Groups -- 1..6",
// weZWWqggy9j13eX8bhFgs6, from sprint-3/community-groups-design). The full
// CommunityGroupsModule is merged in services/api
// (sprint-3/community-groups-backend, PR #241) -- every function here hits
// a real endpoint, none of this is sample data.
//
// Follows the api/*.ts convention (api/clubs.ts, api/grassroots.ts,
// api/banter.ts): a shared authedFetch wrapper, a typed
// CommunityGroupsApiError carrying `.status`, API_BASE_URL from
// VITE_API_BASE_URL, a Bearer access-token header on every call, cursor
// pagination.
//
// Guard notes worth knowing at the call site
// (community-groups.controller.ts):
//   - Every route is JwtAuthGuard -- there is no public/unauthenticated
//     Community Groups route.
//   - POST /community-groups, POST /community-groups/:id/join and
//     DELETE /community-groups/:id/join are additionally gated by
//     GuardianConsentGuard -- a restricted-pending minor gets a 403 on all
//     three (unlike Clubs, whose join/leave is JwtAuthGuard-only --
//     clubs.controller.ts's own comment explains why a ClubPage join isn't
//     covered by Section 5.7's "joining a Banter Room or Community Group"
//     clause the way THIS model literally is). The write helpers below
//     surface the server's own error message verbatim (via
//     errorMessageFrom) so the caller can tell a guardian-consent 403 apart
//     from any other failure -- see community-groups/errors.ts.
//   - POST /community-groups also 409s on a duplicate (normalized) name --
//     surfaced as the server's own "A Community Group with this name
//     already exists" message, not a generic failure.
//
// Response shapes mirror services/api/src/modules/community-groups/
// community-groups.service.ts's CommunityGroupView / JoinGroupState /
// CommunityGroupMemberView exactly.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

// GET /community-groups, GET /community-groups/:id, POST /community-groups.
// `joined` is a per-caller viewer-state boolean (Decision Log #154/#275
// pattern) -- present on both list and single-item responses even though
// the Browse cards render no Join button (Community Groups' own design:
// join lives only on the individual group page).
export interface CommunityGroup {
  id: string;
  name: string;
  city: string | null;
  positionPlayed: string | null;
  careerTrack: string | null;
  createdById: string;
  memberCount: number;
  createdAt: string;
  joined: boolean;
}

export interface CommunityGroupPage {
  items: CommunityGroup[];
  nextCursor: string | null;
}

// POST / DELETE /community-groups/:id/join. `joined` is a plain boolean
// (not a true-literal type), mirroring JoinClubResult -- one interface for
// both join and leave.
export interface JoinGroupResult {
  groupId: string;
  joined: boolean;
  memberCount: number;
}

// GET /community-groups/:id/members roster entry. { id, displayName } only
// -- no @handle (no such `User` column, Decision Log #58) and no
// per-caller `isFollowing` (unlike GET /posts/feed's author, Decision Log
// #153) -- same known-gap shape as api/clubs.ts's ClubMember.
export interface CommunityGroupMember {
  id: string;
  displayName: string;
}

export interface CommunityGroupMemberPage {
  items: CommunityGroupMember[];
  nextCursor: string | null;
}

// At least one of the three must be set (DTO-enforced server-side, mirrored
// client-side by CreateCommunityGroupPage's own "Group type" selector,
// which only ever submits exactly one).
export interface CreateCommunityGroupRequest {
  name: string;
  city?: string;
  positionPlayed?: string;
  careerTrack?: string;
}

export interface ListCommunityGroupsParams {
  cursor?: string;
  city?: string;
  positionPlayed?: string;
  careerTrack?: string;
}

export class CommunityGroupsApiError extends Error {
  readonly status?: number;

  constructor(message: string, options?: { status?: number }) {
    super(message);
    this.name = "CommunityGroupsApiError";
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
    throw new CommunityGroupsApiError("Couldn't reach the Soccernity server.");
  }
}

// Pull the server's own message off a NestJS error body ({ message } or
// { message: string[] }). Used by the write endpoints, where the exact
// text (a 403 "awaiting guardian consent" vs a 409 "already exists") is
// what tells the caller what happened. Same helper feed.ts / grassroots.ts
// use.
async function errorMessageFrom(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  if (body && typeof body.message === "string") return body.message;
  if (body && Array.isArray(body.message) && typeof body.message[0] === "string") return body.message[0];
  return fallback;
}

// POST /community-groups -- JwtAuthGuard + GuardianConsentGuard. 403 = a
// restricted-pending minor; 409 = a Community Group with this (normalized)
// name already exists.
export async function createCommunityGroup(
  accessToken: string,
  payload: CreateCommunityGroupRequest,
): Promise<CommunityGroup> {
  const response = await authedFetch("/community-groups", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new CommunityGroupsApiError(
      await errorMessageFrom(response, `Couldn't create that group (${response.status}).`),
      { status: response.status },
    );
  }
  return (await response.json()) as CommunityGroup;
}

// GET /community-groups -- keyset-paginated newest-first. city /
// positionPlayed / careerTrack are optional, combinable, server-side
// EXACT-MATCH equality filters (community-groups.service.ts) -- NOT a
// fuzzy/partial search. There is no name-search query param at all; a
// name search is a client-side filter over the loaded page (see
// CommunityGroupsPage.tsx), the same discipline ClubsPage.tsx already
// applies for the identical reason.
export async function listCommunityGroups(
  accessToken: string,
  params?: ListCommunityGroupsParams,
): Promise<CommunityGroupPage> {
  const url = new URL(`${API_BASE_URL}/community-groups`);
  if (params?.cursor) url.searchParams.set("cursor", params.cursor);
  if (params?.city) url.searchParams.set("city", params.city);
  if (params?.positionPlayed) url.searchParams.set("positionPlayed", params.positionPlayed);
  if (params?.careerTrack) url.searchParams.set("careerTrack", params.careerTrack);

  const response = await authedFetch(url.pathname + url.search, accessToken);
  if (!response.ok) {
    throw new CommunityGroupsApiError(`Couldn't load groups (${response.status}).`, { status: response.status });
  }
  return (await response.json()) as CommunityGroupPage;
}

// GET /community-groups/:id -- a single group. A missing group is a real
// 404 from the server, surfaced here as a CommunityGroupsApiError with
// status 404 (not a distinct type -- the caller inspects `.status`, same
// as ClubFanPage / GrassrootsTeamPage).
export async function getCommunityGroupById(accessToken: string, groupId: string): Promise<CommunityGroup> {
  const response = await authedFetch(`/community-groups/${groupId}`, accessToken);
  if (!response.ok) {
    throw new CommunityGroupsApiError(`Couldn't load that group (${response.status}).`, {
      status: response.status,
    });
  }
  return (await response.json()) as CommunityGroup;
}

// GET /community-groups/:id/members -- the roster, keyset-paginated
// alphabetically by displayName. 404 if the group itself is missing.
export async function getCommunityGroupMembers(
  accessToken: string,
  groupId: string,
  cursor?: string,
): Promise<CommunityGroupMemberPage> {
  const url = new URL(`${API_BASE_URL}/community-groups/${groupId}/members`);
  if (cursor) url.searchParams.set("cursor", cursor);

  const response = await authedFetch(url.pathname + url.search, accessToken);
  if (!response.ok) {
    throw new CommunityGroupsApiError(`Couldn't load this group's members (${response.status}).`, {
      status: response.status,
    });
  }
  return (await response.json()) as CommunityGroupMemberPage;
}

// POST /community-groups/:id/join -- JwtAuthGuard + GuardianConsentGuard.
// Idempotent server-side (already a member -> 200, memberCount untouched).
export async function joinCommunityGroup(accessToken: string, groupId: string): Promise<JoinGroupResult> {
  const response = await authedFetch(`/community-groups/${groupId}/join`, accessToken, { method: "POST" });
  if (!response.ok) {
    throw new CommunityGroupsApiError(
      await errorMessageFrom(response, `Couldn't join that group (${response.status}).`),
      { status: response.status },
    );
  }
  return (await response.json()) as JoinGroupResult;
}

// DELETE /community-groups/:id/join -- the mirror of joinCommunityGroup.
// Idempotent server-side: leaving a group you're not in is a 200, not a
// 404.
export async function leaveCommunityGroup(accessToken: string, groupId: string): Promise<JoinGroupResult> {
  const response = await authedFetch(`/community-groups/${groupId}/join`, accessToken, { method: "DELETE" });
  if (!response.ok) {
    throw new CommunityGroupsApiError(
      await errorMessageFrom(response, `Couldn't leave that group (${response.status}).`),
      { status: response.status },
    );
  }
  return (await response.json()) as JoinGroupResult;
}

// ---------- display helpers ----------

// Community Groups' "grouping dimension" model -- Decision Log #281: a
// group is designed to describe itself by exactly ONE of the three
// dimensions (the Create form's "Group type" selector enforces this
// client-side; the backend DTO itself accepts "at least one", not "exactly
// one"). This type backs both CreateCommunityGroupPage's selector and the
// dimension-badge rendering below.
export type GroupDimension = "city" | "positionPlayed" | "careerTrack";

export const DIMENSION_LABELS: Record<GroupDimension, string> = {
  city: "City",
  positionPlayed: "Position",
  careerTrack: "Career track",
};

// One "Dimension Badge" per non-null field a group actually carries (the
// Figma cards/group-page show exactly one, since a group is designed to
// set only one dimension in practice -- but the backend allows more than
// one to be set, so this renders whatever is genuinely present rather than
// assuming there's exactly one).
export function dimensionBadges(group: CommunityGroup): string[] {
  const badges: string[] = [];
  if (group.city) badges.push(`City · ${group.city}`);
  if (group.positionPlayed) badges.push(`Position · ${group.positionPlayed}`);
  if (group.careerTrack) badges.push(`Career track · ${group.careerTrack}`);
  return badges;
}
