// Contest client -- services/api/src/modules/contest, as rebuilt by backend/w7-contest (B-091,
// Decision Log #381-#406). The Contest is no longer admin-judged: a month runs itself on the
// Europe/London calendar (docs/contest-spec.md). This file mirrors
// services/api/src/modules/contest/contest.types.ts, with Date fields typed as the ISO strings they
// serialise to over JSON.
//
// What a person sees, and what they never see:
//   - The MINIMUM TALLY and the placement-point settings are ADMIN-only (apps/admin's client). No
//     type here carries them.
//   - The vote count is live while voting is open. Views, impression counts and Phase 1 tallies are
//     never returned to users.
//
// Guard notes worth knowing at the call site (GuardianConsentGuard / EmailVerifiedGuard /
// ProfileCompleteGuard, Decision Log #370, #369):
//   - Every read is login-only (JwtAuthGuard).
//   - POST /contest/entries and POST /contest/final-entry need a confirmed-consent, verified, profile-
//     complete account; PUT (cast) also needs a verified email, DELETE (retract) does not. A refusal is
//     a coded 403 (see `code`), shown with the server's own message.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

// The derived coarse phase (never stored). The finer, clock-driven answer is `calendarState`.
export type ContestPhase = "vacant" | "week_1" | "weeks_1_2" | "weeks_1_3" | "final_live" | "crowned";

export type ContestFinalOutcome = "pending" | "winners" | "no_winner" | "no_final";

// contest-schedule.util.ts ContestCalendarState, dates as ISO strings.
export type ContestCalendarState =
  | { kind: "upcoming"; opensAt: string }
  | { kind: "week_entries"; weekNumber: 1 | 2 | 3; entriesCloseAt: string }
  | { kind: "week_voting"; weekNumber: 1 | 2 | 3; locksAt: string }
  | { kind: "week_forfeited"; weekNumber: 1 | 2 | 3; locksAt: string }
  | {
      kind: "between_weeks";
      afterWeek: 1 | 2 | 3;
      nextWeek: 2 | 3 | 4;
      nextOpensAt: string;
      result: "winners" | "forfeited";
    }
  | { kind: "final_upload"; opensAt: string; revealsAt: string }
  | { kind: "final_live"; revealedAt: string; endsAt: string }
  | { kind: "no_final" }
  | { kind: "completed"; endedAt: string };

export interface ContestCycleSummary {
  id: string;
  title: string;
  description: string | null;
  /** "YYYY-MM"; null for a legacy admin-judged cycle. */
  monthKey: string | null;
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
  /** The (exclusive) end of the round's last window: the vote lock (weeks 1-3) or the reveal (week 4). */
  closesAt: string;
  judgedAt: string | null;
  /**
   * The week's task text. null until the week has opened, and for the final it is shown only in the
   * uploading and live-ranking states (Decision Log #403 item 10).
   */
  task: string | null;
  entriesCloseAt: string | null;
  votesLockAt: string | null;
  viewWatchLimitSeconds: number | null;
  forfeited: boolean;
  forfeitReason: string | null;
}

export interface ContestWinnerSummary {
  weekNumber: number;
  position: number;
  userId: string;
  publicName: string;
  entryId: string;
  postId: string;
}

export interface ContestStandingSummary {
  position: number;
  userId: string;
  publicName: string;
}

export interface ContestFinalistSummary {
  userId: string;
  publicName: string;
}

export interface ContestForfeitedWeek {
  weekNumber: number;
  reason: string;
}

export interface ContestFinalRankingRow {
  rank: number;
  entryId: string;
  postId: string;
  userId: string;
  publicName: string;
  /** Likes + comments counted. */
  points: number;
}

// GET /contest/current
export interface CurrentContestResponse {
  cycle: ContestCycleSummary | null;
  phase: ContestPhase | null;
  calendarState: ContestCalendarState | null;
  /** True iff SOME account could submit an entry right now. Whether THIS caller may is `callerCanEnter`. */
  isAcceptingEntries: boolean;
  activeRound: ContestRoundSummary | null;
  rounds: ContestRoundSummary[];
  weeklyWinners: ContestWinnerSummary[];
  finalists: ContestFinalistSummary[];
  /** Forfeited weeks, oldest first (the Contest-page pop-ups). */
  forfeitedWeeks: ContestForfeitedWeek[];
  finalRanking: ContestFinalRankingRow[] | null;
  monthlyStandings: ContestStandingSummary[];
  finalOutcome: ContestFinalOutcome | null;
  callerEntry: { roundId: string; weekNumber: number; postId: string } | null;
  callerFinalEntry: { entryId: string; postId: string; submittedAt: string } | null;
  callerIsFinalist: boolean;
  callerCanEnter: boolean;
  callerVote: { roundId: string; entryId: string } | null;
}

// GET /contest/cycles/:id
export interface ContestCycleDetailResponse {
  cycle: ContestCycleSummary;
  phase: ContestPhase;
  calendarState: ContestCalendarState | null;
  rounds: ContestRoundSummary[];
  weeklyWinners: ContestWinnerSummary[];
  finalists: ContestFinalistSummary[];
  forfeitedWeeks: ContestForfeitedWeek[];
  finalRanking: ContestFinalRankingRow[] | null;
  monthlyStandings: ContestStandingSummary[];
  finalOutcome: ContestFinalOutcome | null;
}

export interface ContestEntryView {
  entryId: string;
  roundId: string;
  weekNumber: number;
  kind: "weekly" | "final";
  entrant: { userId: string; publicName: string };
  post: {
    id: string;
    contentText: string;
    mediaUrls: string[];
    createdAt: string;
    likeCount: number;
    commentCount: number;
  };
  submittedAt: string;
  qualified: boolean;
  phase1Rank: number | null;
  /** Live while voting is open, frozen once decided; null before Phase 2. */
  voteCount: number | null;
  votedByCaller: boolean;
  position: number | null;
  pinned: boolean;
}

// GET /contest/rounds/:roundId/entries
export interface ContestRoundEntriesResponse {
  round: ContestRoundSummary;
  calendarState: ContestCalendarState | null;
  items: ContestEntryView[];
  nextCursor: string | null;
  callerVote: string | null;
}

// PUT / DELETE /contest/entries/:entryId/vote
export interface ContestVoteState {
  roundId: string;
  entryId: string;
  voted: boolean;
  voteCount: number;
  callerVote: string | null;
}

// POST /contest/entries -- 201.
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
  /** The server's machine-readable code (contest_voting_closed, contest_already_voted, contest_final_locked, ...). */
  readonly code?: string;

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message);
    this.name = "ContestApiError";
    this.status = options?.status;
    this.code = options?.code;
  }
}

async function authedFetch(
  path: string,
  accessToken: string,
  init?: { method?: string; body?: string },
): Promise<Response> {
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

async function failure(response: Response, fallback: string): Promise<ContestApiError> {
  const body = await response.json().catch(() => null);
  let message = fallback;
  if (body && typeof body.message === "string") message = body.message;
  else if (body && Array.isArray(body.message) && typeof body.message[0] === "string") message = body.message[0];
  return new ContestApiError(message, {
    status: response.status,
    code: body && typeof body.code === "string" ? body.code : undefined,
  });
}

// GET /contest/current -- the single call the Contest page, the Voting page, the Leaderboard Contest
// tab and the Create Post "Contest" tab all read.
export async function getCurrentContest(accessToken: string): Promise<CurrentContestResponse> {
  const response = await authedFetch("/contest/current", accessToken);
  if (!response.ok) throw await failure(response, `Couldn't load the contest (${response.status}).`);
  return (await response.json()) as CurrentContestResponse;
}

// GET /contest/cycles/:id -- one cycle in full, for a "past months" view.
export async function getContestCycle(accessToken: string, cycleId: string): Promise<ContestCycleDetailResponse> {
  const response = await authedFetch(`/contest/cycles/${cycleId}`, accessToken);
  if (!response.ok) throw await failure(response, `Couldn't load that contest (${response.status}).`);
  return (await response.json()) as ContestCycleDetailResponse;
}

// GET /contest/rounds/:roundId/entries -- while Phase 1 is open every entry (newest first); afterwards
// the qualified entries (best Phase 1 rank first, or by position once decided). Keyset-paginated.
export async function getRoundEntries(
  accessToken: string,
  roundId: string,
  cursor?: string,
): Promise<ContestRoundEntriesResponse> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const response = await authedFetch(`/contest/rounds/${roundId}/entries${qs}`, accessToken);
  if (!response.ok) throw await failure(response, `Couldn't load the entries (${response.status}).`);
  return (await response.json()) as ContestRoundEntriesResponse;
}

// PUT /contest/entries/:entryId/vote -- the ONE vote of this round. A second entry while one is held
// is a 409 `contest_already_voted` with the server's own "un-vote first" message.
export async function castVote(accessToken: string, entryId: string): Promise<ContestVoteState> {
  const response = await authedFetch(`/contest/entries/${entryId}/vote`, accessToken, { method: "PUT" });
  if (!response.ok) throw await failure(response, `Couldn't record your vote (${response.status}).`);
  return (await response.json()) as ContestVoteState;
}

// DELETE /contest/entries/:entryId/vote -- idempotent.
export async function retractVote(accessToken: string, entryId: string): Promise<ContestVoteState> {
  const response = await authedFetch(`/contest/entries/${entryId}/vote`, accessToken, { method: "DELETE" });
  if (!response.ok) throw await failure(response, `Couldn't remove your vote (${response.status}).`);
  return (await response.json()) as ContestVoteState;
}

// POST /contest/entries -- submit an already-created Post as this week's entry (weeks 1-3). The
// composer creates the Post via POST /posts FIRST, so POST /posts stays the single post-creation path.
export async function submitContestEntry(accessToken: string, postId: string): Promise<SubmittedContestEntry> {
  const response = await authedFetch("/contest/entries", accessToken, {
    method: "POST",
    body: JSON.stringify({ postId }),
  });
  if (!response.ok) throw await failure(response, `Couldn't submit that contest entry (${response.status}).`);
  return (await response.json()) as SubmittedContestEntry;
}

// POST /contest/final-entry -- a finalist's week-4 entry. Unlike weekly entries this CREATES the post
// itself (hidden from everyone but its owner until the reveal at 00:00 on day 25), and needs at least
// one media URL: no upload endpoint exists for posts, so the composer asks for a link.
export interface SubmitFinalEntryInput {
  contentText: string;
  mediaUrls: string[];
}

export async function submitFinalEntry(accessToken: string, input: SubmitFinalEntryInput): Promise<SubmittedContestEntry> {
  const response = await authedFetch("/contest/final-entry", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await failure(response, `Couldn't submit your final entry (${response.status}).`);
  return (await response.json()) as SubmittedContestEntry;
}
