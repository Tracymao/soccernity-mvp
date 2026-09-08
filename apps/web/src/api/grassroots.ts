// Grassroots Records Service client -- Build Plan Section 4.5.
//
// Backs the Grassroots Record-Keeping screens (Figma frames 1-11,
// Decision Log #253 / #261 / #265 / #266). The full GrassrootsModule is
// merged in services/api (sprint-5/grassroots-records-service +
// sprint-5/grassroots-opponent-name; Decision Log #254/#255/#256/#259/#260)
// -- this is not sample-data scaffolding, every function here hits a real
// endpoint.
//
// Follows the api/*.ts convention (api/clubs.ts, api/feed.ts): a shared
// authedFetch wrapper, a typed GrassrootsApiError carrying `.status` for
// 404 handling at the call site, API_BASE_URL from VITE_API_BASE_URL, a
// Bearer access-token header on every call, cursor-based pagination.
//
// Guard notes worth knowing at the call site
// (grassroots-teams.controller.ts / grassroots-fixtures.controller.ts):
//   - Every route is JwtAuthGuard -- there is NO public/unauthenticated
//     Grassroots route. GET /teams/:id is a "Public Team Page" in Figma
//     but is auth-gated in code (services/api README + Decision Log #269:
//     Grassroots GET endpoints stay JwtAuthGuard-only). A no-session
//     visit renders a "log in" prompt and never calls the API, same as
//     ClubsPage / ClubFanPage.
//   - POST /teams, POST /fixtures, POST /fixtures/:id/result and
//     PATCH /fixtures/:id/status are additionally gated by
//     GuardianConsentGuard -- a restricted-pending minor gets a 403 on
//     those four. They also 403 (ForbiddenException) when the caller is
//     not the relevant team's organiser (Decision Log #255). Both come
//     back as status 403 carrying the server's own message; the write
//     helpers below surface that message verbatim so the caller can tell
//     the two apart.
//   - POST /fixtures/:id/result is "first write is final": a second
//     submission for the same fixture is a 409, never an overwrite
//     (Result.fixtureId @unique, race-tested -- Decision Log #255).
//   - PATCH /fixtures/:id/status only allows scheduled->live and
//     live->full_time; every other transition is a 409 naming the current
//     and requested status (Decision Log #254).
//
// Response shapes mirror services/api/src/modules/grassroots/
// grassroots.service.ts's TEAM_SELECT / FIXTURE_SELECT / TeamPage /
// FixturePage exactly.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

// GrassrootsTeam.leagueType allow-list (grassroots.constants.ts:
// GRASSROOTS_LEAGUE_TYPES). Plain Postgres string, not an enum -- can grow
// without a migration, but the Figma segmented control is built against
// exactly these three.
export type GrassrootsLeagueType = "informal" | "school" | "academy";

// Fixture.status machine (grassroots.constants.ts: FIXTURE_STATUSES). A new
// fixture is always "scheduled".
export type FixtureStatus = "scheduled" | "live" | "full_time";

// The subset a client may target via PATCH /fixtures/:id/status
// (PATCHABLE_FIXTURE_STATUSES) -- "scheduled" is never a valid target.
export type PatchableFixtureStatus = "live" | "full_time";

// GET /teams, GET /teams/:id, POST /teams. No organiser PII -- only the
// opaque `createdById` (grassroots.service.ts TEAM_SELECT), so a client
// can tell whether the current user owns the team without leaking
// anything. `verified` is set by Soccernity, never self-service, and
// stays false until then.
export interface GrassrootsTeam {
  id: string;
  name: string;
  city: string;
  leagueType: GrassrootsLeagueType;
  createdById: string;
  verified: boolean;
}

// The minimal team shape embedded inside a fixture (FIXTURE_TEAM_SELECT).
export interface FixtureTeam {
  id: string;
  name: string;
  city: string;
  verified: boolean;
}

// The fixture's single Result row (RESULT_SELECT). scoreA/scoreB are the
// home (teamA) / away (teamB) scores. Won/Drew/Lost is derived
// client-side -- there is no stored outcome, points or standings model.
export interface FixtureResult {
  id: string;
  scoreA: number;
  scoreB: number;
  enteredById: string;
  enteredAt: string;
}

// GET /fixtures/:id, GET /teams/:id/fixtures, POST /fixtures,
// POST /fixtures/:id/result, PATCH /fixtures/:id/status (FIXTURE_SELECT).
//
// The away side is exactly one of: `teamB` (a registered team),
// `opponentName` (free-text, e.g. "Riverside FC"), or neither (fully-TBD).
// The API returns the raw `opponentName: string | null` -- the "Opponent
// TBC" display string for the neither-set case is OWNED HERE, not
// returned by the server (Decision Log #260 / #261). See opponentLabel().
export interface Fixture {
  id: string;
  teamAId: string;
  teamBId: string | null;
  opponentName: string | null;
  scheduledAt: string;
  venue: string | null;
  status: FixtureStatus;
  teamA: FixtureTeam;
  teamB: FixtureTeam | null;
  result: FixtureResult | null;
}

export interface TeamPage {
  items: GrassrootsTeam[];
  nextCursor: string | null;
}

export interface FixturePage {
  items: Fixture[];
  nextCursor: string | null;
}

export interface CreateTeamRequest {
  name: string;
  city: string;
  leagueType: GrassrootsLeagueType;
}

// POST /fixtures. `teamAId` is the team scheduling the fixture (the caller
// must be its organiser). Away side: supply `teamBId` XOR `opponentName`,
// or neither -- supplying both is a 400 (grassroots.service.ts). The Figma
// form splits date + kick-off time; the client combines them into one ISO
// `scheduledAt`.
export interface CreateFixtureRequest {
  teamAId: string;
  teamBId?: string;
  opponentName?: string;
  scheduledAt: string;
  venue?: string;
}

export interface LogResultRequest {
  scoreA: number;
  scoreB: number;
}

export class GrassrootsApiError extends Error {
  readonly status?: number;

  constructor(message: string, options?: { status?: number }) {
    super(message);
    this.name = "GrassrootsApiError";
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
    throw new GrassrootsApiError("Couldn't reach the Soccernity server.");
  }
}

// Pull the server's own message off a NestJS error body ({ message } or
// { message: string[] }). Used by the write endpoints, where the exact
// text (a 403 "you may only manage..." vs a 409 "already been recorded")
// is what tells the caller what happened. Same helper feed.ts uses.
async function errorMessageFrom(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  if (body && typeof body.message === "string") return body.message;
  if (body && Array.isArray(body.message) && typeof body.message[0] === "string") return body.message[0];
  return fallback;
}

// ---------- Teams ----------

// POST /teams -- JwtAuthGuard + GuardianConsentGuard. A 403 means the
// caller is a restricted-pending minor.
export async function createTeam(accessToken: string, payload: CreateTeamRequest): Promise<GrassrootsTeam> {
  const response = await authedFetch("/teams", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new GrassrootsApiError(
      await errorMessageFrom(response, `Couldn't register that team (${response.status}).`),
      { status: response.status },
    );
  }
  return (await response.json()) as GrassrootsTeam;
}

// GET /teams?city= -- keyset-paginated alphabetically by name; `city` is a
// server-side exact-match equality filter (NOT a fuzzy search -- Section
// 4.5 defines no team-name text search).
export async function listTeams(accessToken: string, opts?: { city?: string; cursor?: string }): Promise<TeamPage> {
  const url = new URL(`${API_BASE_URL}/teams`);
  if (opts?.city) url.searchParams.set("city", opts.city);
  if (opts?.cursor) url.searchParams.set("cursor", opts.cursor);

  const response = await authedFetch(url.pathname + url.search, accessToken);
  if (!response.ok) {
    throw new GrassrootsApiError(`Couldn't load teams (${response.status}).`, { status: response.status });
  }
  return (await response.json()) as TeamPage;
}

// GET /teams/:id -- a single team. A missing team is a real 404 from the
// server, surfaced here as a GrassrootsApiError with status 404 (not a
// distinct type -- the caller inspects `.status` to render "team not
// found" vs a generic error, same as ClubFanPage).
export async function getTeamById(accessToken: string, teamId: string): Promise<GrassrootsTeam> {
  const response = await authedFetch(`/teams/${teamId}`, accessToken);
  if (!response.ok) {
    throw new GrassrootsApiError(`Couldn't load that team (${response.status}).`, { status: response.status });
  }
  return (await response.json()) as GrassrootsTeam;
}

// GET /teams/:id/fixtures -- every fixture the team is in (as teamA or
// teamB), keyset-paginated newest-scheduled-first, each with status +
// result. 404 if the team itself is missing.
export async function getTeamFixtures(
  accessToken: string,
  teamId: string,
  cursor?: string,
): Promise<FixturePage> {
  const url = new URL(`${API_BASE_URL}/teams/${teamId}/fixtures`);
  if (cursor) url.searchParams.set("cursor", cursor);

  const response = await authedFetch(url.pathname + url.search, accessToken);
  if (!response.ok) {
    throw new GrassrootsApiError(`Couldn't load this team's fixtures (${response.status}).`, {
      status: response.status,
    });
  }
  return (await response.json()) as FixturePage;
}

// ---------- Fixtures ----------

// POST /fixtures -- JwtAuthGuard + GuardianConsentGuard. 403 =
// restricted-pending minor OR not the organiser of `teamAId` (the server
// message tells them apart). 400 = both `teamBId` and `opponentName`
// supplied. 404 = a referenced team doesn't exist.
export async function createFixture(accessToken: string, payload: CreateFixtureRequest): Promise<Fixture> {
  const response = await authedFetch("/fixtures", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new GrassrootsApiError(
      await errorMessageFrom(response, `Couldn't schedule that fixture (${response.status}).`),
      { status: response.status },
    );
  }
  return (await response.json()) as Fixture;
}

// GET /fixtures/:id -- one fixture with status, both teams (minimal
// shape), and the result if present. 404 if missing.
export async function getFixtureById(accessToken: string, fixtureId: string): Promise<Fixture> {
  const response = await authedFetch(`/fixtures/${fixtureId}`, accessToken);
  if (!response.ok) {
    throw new GrassrootsApiError(`Couldn't load that fixture (${response.status}).`, { status: response.status });
  }
  return (await response.json()) as Fixture;
}

// POST /fixtures/:id/result -- JwtAuthGuard + GuardianConsentGuard.
// "First write is final": a 409 here means a result was already recorded
// for this fixture and cannot be changed -- an EXPECTED, explained
// outcome, not a generic failure (Decision Log #255). 403 = not a
// manager of either team, or a restricted-pending minor. On success the
// fixture moves to "full_time".
export async function logResult(
  accessToken: string,
  fixtureId: string,
  payload: LogResultRequest,
): Promise<Fixture> {
  const response = await authedFetch(`/fixtures/${fixtureId}/result`, accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new GrassrootsApiError(
      await errorMessageFrom(response, `Couldn't record that result (${response.status}).`),
      { status: response.status },
    );
  }
  return (await response.json()) as Fixture;
}

// PATCH /fixtures/:id/status -- JwtAuthGuard + GuardianConsentGuard. Only
// scheduled->live and live->full_time are legal; every other transition
// is a 409 naming the current and requested status (Decision Log #254) --
// surfaced verbatim, not swallowed by a disabled button. 403 = not a
// manager of either team, or a restricted-pending minor.
export async function updateFixtureStatus(
  accessToken: string,
  fixtureId: string,
  status: PatchableFixtureStatus,
): Promise<Fixture> {
  const response = await authedFetch(`/fixtures/${fixtureId}/status`, accessToken, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    throw new GrassrootsApiError(
      await errorMessageFrom(response, `Couldn't update the fixture status (${response.status}).`),
      { status: response.status },
    );
  }
  return (await response.json()) as Fixture;
}

// ---------- display helpers (shared by the read + organiser screens) ----------

// GrassrootsTeam.leagueType -> the Figma label ("Informal team" /
// "School team" / "Academy team"). Frames 9-11 use the first two verbatim.
export function leagueTypeLabel(leagueType: GrassrootsLeagueType): string {
  switch (leagueType) {
    case "informal":
      return "Informal team";
    case "school":
      return "School team";
    case "academy":
      return "Academy team";
  }
}

// The away-opponent label for a fixture row (Decision Log #260 / #261):
// a registered team's name, else the free-text `opponentName`, else the
// literal "Opponent TBC" -- the display fallback the API never returns.
export function opponentLabel(fixture: Fixture, viewingTeamId: string): string {
  // If the viewing team is the away side (teamB), the "opponent" is teamA.
  if (fixture.teamBId === viewingTeamId) return fixture.teamA.name;
  return fixture.teamB?.name ?? fixture.opponentName ?? "Opponent TBC";
}
