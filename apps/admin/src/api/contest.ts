// Contest admin console client — services/api `/admin/contest/*`
// (Decision Log #218/#219 for the data model, #241 for the read surface,
// #243 for this frontend wiring).
//
// Response shapes mirror
// services/api/src/modules/contest/contest.types.ts's `Admin*` interfaces
// exactly. Date fields are ISO strings over HTTP even though the server
// type annotates them `Date` — typed `string` here, same as apps/web's
// api clients do. Read that file, not this comment, if a shape changes.
//
// Every call goes through adminFetch (isolated admin auth path, ADMIN_JWT_SECRET,
// transparent 401→refresh — adminClient.ts / Decision Log #54).
import { adminFetch } from "./adminClient";

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
  status: string; // "active" | "final" | "completed"
  startsAt: string;
  endsAt: string;
  finalOpenedAt: string | null;
  crownedAt: string | null;
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

export interface AdminContestEntry {
  entryId: string;
  submittedAt: string;
  entrant: { userId: string; displayName: string };
  post: {
    id: string;
    contentText: string;
    mediaUrls: string[];
    createdAt: string;
    likeCount: number;
    commentCount: number;
  };
  position: number | null;
}

export interface AdminContestRoundSummary {
  id: string;
  weekNumber: number;
  status: string; // "open" | "judged"
  opensAt: string;
  closesAt: string;
  judgedAt: string | null;
  entryCount: number;
}

export interface AdminContestRoundDetail extends AdminContestRoundSummary {
  entries: AdminContestEntry[];
}

export interface AdminContestCycleDetail {
  cycle: ContestCycleSummary;
  phase: ContestPhase;
  rounds: AdminContestRoundDetail[];
  weeklyWinners: ContestWinnerSummary[];
  monthlyStandings: ContestStandingSummary[];
}

export interface AdminCurrentContest {
  // cycle / phase null + arrays empty ONLY when no cycle has ever been created.
  cycle: ContestCycleSummary | null;
  phase: ContestPhase | null;
  rounds: AdminContestRoundDetail[];
  weeklyWinners: ContestWinnerSummary[];
  monthlyStandings: ContestStandingSummary[];
}

export interface AdminContestCycleListItem {
  cycle: ContestCycleSummary;
  phase: ContestPhase;
  rounds: AdminContestRoundSummary[]; // NOTE: summary — no per-entry `entries`
  weeklyWinners: ContestWinnerSummary[];
  monthlyStandings: ContestStandingSummary[];
}

export interface AdminContestCycleList {
  items: AdminContestCycleListItem[];
}

// ---- reads ---------------------------------------------------------------

export function getCurrentContest(): Promise<AdminCurrentContest> {
  return adminFetch<AdminCurrentContest>("/admin/contest/current");
}

export function getContestCycle(id: string): Promise<AdminContestCycleDetail> {
  return adminFetch<AdminContestCycleDetail>(`/admin/contest/cycles/${id}`);
}

export function listContestCycles(): Promise<AdminContestCycleList> {
  return adminFetch<AdminContestCycleList>("/admin/contest/cycles");
}

// ---- writes -------------------------------------------------------------

export interface CreateCycleRoundInput {
  weekNumber: 1 | 2 | 3;
  opensAt: string;
  closesAt: string;
}

export interface CreateCycleInput {
  title: string;
  startsAt: string;
  endsAt: string;
  // Omit entirely → server auto-generates three consecutive 7-day rounds.
  rounds?: CreateCycleRoundInput[];
}

export function createContestCycle(input: CreateCycleInput): Promise<AdminContestCycleDetail> {
  return adminFetch<AdminContestCycleDetail>("/admin/contest/cycles", {
    method: "POST",
    body: input,
  });
}

export interface RoundWinnerInput {
  entryId: string;
  position: 1 | 2 | 3;
}

// `winners` MAY be empty (a "thin week" — the round still closes).
export function judgeContestRound(
  cycleId: string,
  week: number,
  winners: RoundWinnerInput[],
): Promise<AdminContestCycleDetail> {
  return adminFetch<AdminContestCycleDetail>(
    `/admin/contest/cycles/${cycleId}/rounds/${week}/results`,
    { method: "POST", body: { winners } },
  );
}

export function openContestFinal(cycleId: string): Promise<AdminContestCycleDetail> {
  return adminFetch<AdminContestCycleDetail>(
    `/admin/contest/cycles/${cycleId}/final/open`,
    { method: "POST" },
  );
}

export interface CrownStandingInput {
  userId: string;
  position: 1 | 2 | 3;
}

// Each `userId` must be a weekly winner of this cycle; min 1, max 6.
export function crownContestCycle(
  cycleId: string,
  standings: CrownStandingInput[],
): Promise<AdminContestCycleDetail> {
  return adminFetch<AdminContestCycleDetail>(`/admin/contest/cycles/${cycleId}/crown`, {
    method: "POST",
    body: { standings },
  });
}
