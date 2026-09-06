// Contest client — services/api/src/modules/contest (sprint-2/contest-data-model-backend,
// Decision Log #218). None of these routes are in Build Plan Section 4 (which has no
// Contest lines) — they are genuine additions the founder authorised for the Contest
// mechanic (Decision Log #61/#70/#71/#188).
//
// Follows the api/*.ts convention (own fetch wrapper, own typed *ApiError, Bearer auth,
// API_BASE_URL from VITE_API_BASE_URL). Response shapes mirror
// services/api/src/modules/contest/contest.types.ts exactly, with Date fields typed as
// the ISO strings they serialise to over JSON.
//
// Guard notes worth knowing at the call site:
//   - GET /contest/current is JwtAuthGuard-only (login required, not consent-gated —
//     Decision Log #129, everything Leaderboard-adjacent is login-gated).
//   - POST /contest/entries is JwtAuthGuard + GuardianConsentGuard, so a
//     restricted-pending minor gets a 403 (surfaced as ContestApiError status 403 —
//     the caller links to /guardian-consent). It also 409s for: no active cycle, no
//     open round right now, already entered this round, or that post already entered.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

// contest.types.ts ContestPhase — the derived weekly-progression state (never stored).
export type ContestPhase =
  | "vacant"
  | "week_1"
  | "weeks_1_2"
  | "weeks_1_3"
  | "final_live"
  | "crowned";

export interface ContestCycleSummary {
  id: string;
  title: string;
  status: string;
  startsAt: string;
  endsAt: string;
  finalOpenedAt: string | null;
  crownedAt: string | null;
}

export interface ContestRoundSummary {
  id: string;
  weekNumber: number;
  status: string;
  opensAt: string;
  closesAt: string;
  judgedAt: string | null;
}

export interface ContestWinnerSummary {
  weekNumber: number;
  position: number;
  userId: string;
  displayName: string;
  entryId: string;
  postId: string;
}

export interface ContestStandingSummary {
  position: number;
  userId: string;
  displayName: string;
}

// GET /contest/current
export interface CurrentContestResponse {
  cycle: ContestCycleSummary | null;
  phase: ContestPhase | null;
  // Decision Log #188: true iff a "Create a Post — For Contest" submission would
  // succeed right now (cycle 'active' AND a round open within its window). This is the
  // exact condition the Create Post mode-tab row's visibility is bound to
  // (Decision Log #148).
  isAcceptingEntries: boolean;
  activeRound: ContestRoundSummary | null;
  rounds: ContestRoundSummary[];
  weeklyWinners: ContestWinnerSummary[];
  monthlyStandings: ContestStandingSummary[];
  // The caller's own entry in the currently-open round, if any — so the composer can
  // show a "you've already entered this week" state instead of a submit form.
  callerEntry: { roundId: string; weekNumber: number; postId: string } | null;
}

// GET /contest/cycles/:id
export interface ContestCycleDetailResponse {
  cycle: ContestCycleSummary;
  phase: ContestPhase;
  rounds: ContestRoundSummary[];
  weeklyWinners: ContestWinnerSummary[];
  monthlyStandings: ContestStandingSummary[];
}

// POST /contest/entries — 201 response.
export interface SubmittedContestEntry {
  id: string;
  cycleId: string;
  roundId: string;
  weekNumber: number;
  postId: string;
  submittedAt: string;
}

export class ContestApiError extends Error {
  readonly status?: number;

  constructor(message: string, options?: { status?: number }) {
    super(message);
    this.name = "ContestApiError";
    this.status = options?.status;
  }
}

async function authedFetch(path: string, accessToken: string, init?: { method?: string; body?: string }): Promise<Response> {
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
    throw new ContestApiError("Couldn't reach the Soccernity server.");
  }
}

async function errorMessageFrom(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  if (body && typeof body.message === "string") return body.message;
  if (body && Array.isArray(body.message) && typeof body.message[0] === "string") return body.message[0];
  return fallback;
}

// GET /contest/current — the single call the Create Post "For Contest" mode-tab and the
// Leaderboard Contest tab both read.
export async function getCurrentContest(accessToken: string): Promise<CurrentContestResponse> {
  const response = await authedFetch("/contest/current", accessToken);
  if (!response.ok) {
    throw new ContestApiError(`Couldn't load the contest (${response.status}).`, { status: response.status });
  }
  return (await response.json()) as CurrentContestResponse;
}

// GET /contest/cycles/:id — one cycle in full, for a "past months" view.
export async function getContestCycle(accessToken: string, cycleId: string): Promise<ContestCycleDetailResponse> {
  const response = await authedFetch(`/contest/cycles/${cycleId}`, accessToken);
  if (!response.ok) {
    throw new ContestApiError(`Couldn't load that contest (${response.status}).`, { status: response.status });
  }
  return (await response.json()) as ContestCycleDetailResponse;
}

// POST /contest/entries — submit an already-created Post as this week's contest entry.
// The composer creates the Post via POST /posts FIRST, then passes its id here, so
// POST /posts stays the single post-creation path (its own GuardianConsentGuard /
// validation / notification wiring is not duplicated).
export async function submitContestEntry(accessToken: string, postId: string): Promise<SubmittedContestEntry> {
  const response = await authedFetch("/contest/entries", accessToken, {
    method: "POST",
    body: JSON.stringify({ postId }),
  });
  if (!response.ok) {
    throw new ContestApiError(
      await errorMessageFrom(response, `Couldn't submit that contest entry (${response.status}).`),
      { status: response.status },
    );
  }
  return (await response.json()) as SubmittedContestEntry;
}
