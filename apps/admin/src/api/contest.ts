// Contest admin client -- services/api `/admin/contest/*`, as rebuilt by backend/w7-contest (B-091,
// Decision Log #381-#406; build register B-097). The Contest is NOT admin-judged: an admin creates a
// month (a "cycle") and edits it within the locking rules, and after that the month runs itself on the
// fixed Europe/London calendar. There are no judging, opening or crowning endpoints any more.
//
// Response shapes mirror services/api/src/modules/contest/contest.types.ts's `Admin*` interfaces. Date
// fields are ISO strings over HTTP even though the server type annotates them `Date`. Read that file,
// not this comment, if a shape changes.
//
// Every call goes through adminFetch (isolated admin auth path, ADMIN_JWT_SECRET, transparent
// 401 -> refresh, Decision Log #54).
import { adminFetch } from "./adminClient";

export type ContestPhase = "vacant" | "week_1" | "weeks_1_2" | "weeks_1_3" | "final_live" | "crowned";
export type ContestFinalOutcome = "pending" | "winners" | "no_winner" | "no_final";

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
  points: number;
}

/** ADMIN-ONLY settings. The minimum tally never reaches a user-facing response. */
export interface AdminContestSettings {
  minimumTally: number | null;
  weeklyPoints: [number, number, number];
  monthlyPoints: [number, number, number];
  followersExcludedWeek4: boolean;
  exposureTolerancePercent: number;
  exposureViewerDailyCap: number;
}

/** Which fields an edit may still change right now (spec section 4a). */
export interface AdminContestEditability {
  beforeLaunch: boolean;
  title: boolean;
  description: boolean;
  minimumTally: boolean;
  placementPoints: boolean;
  followersExcludedWeek4: boolean;
  exposureTolerancePercent: boolean;
  exposureViewerDailyCap: boolean;
  taskByWeek: Record<number, boolean>;
  watchLimitByWeek: Record<number, boolean>;
}

export interface AdminContestEntry {
  entryId: string;
  kind: "weekly" | "final";
  submittedAt: string;
  entrant: { userId: string; publicName: string };
  post: {
    id: string;
    contentText: string;
    mediaUrls: string[];
    createdAt: string;
    likeCount: number;
    commentCount: number;
  };
  qualified: boolean;
  phase1Tally: number | null;
  phase1Rank: number | null;
  voteCount: number;
  finalTally: number | null;
  finalRank: number | null;
  position: number | null;
}

export interface AdminContestRoundSummary {
  id: string;
  weekNumber: number;
  status: string;
  opensAt: string;
  closesAt: string;
  judgedAt: string | null;
  /** For an admin the task is never hidden (a future week's, and the final's). */
  task: string | null;
  entriesCloseAt: string | null;
  votesLockAt: string | null;
  viewWatchLimitSeconds: number | null;
  forfeited: boolean;
  forfeitReason: string | null;
  entryCount: number;
}

export interface AdminContestRoundDetail extends AdminContestRoundSummary {
  entries: AdminContestEntry[];
}

export interface AdminContestCycleDetail {
  cycle: ContestCycleSummary;
  settings: AdminContestSettings;
  editable: AdminContestEditability;
  phase: ContestPhase;
  calendarState: ContestCalendarState | null;
  rounds: AdminContestRoundDetail[];
  weeklyWinners: ContestWinnerSummary[];
  finalists: ContestFinalistSummary[];
  forfeitedWeeks: ContestForfeitedWeek[];
  finalRanking: ContestFinalRankingRow[] | null;
  monthlyStandings: ContestStandingSummary[];
  finalOutcome: ContestFinalOutcome | null;
}

// cycle / settings / editable null and arrays empty ONLY when no cycle has ever been created.
export interface AdminCurrentContest {
  cycle: ContestCycleSummary | null;
  settings: AdminContestSettings | null;
  editable: AdminContestEditability | null;
  phase: ContestPhase | null;
  calendarState: ContestCalendarState | null;
  rounds: AdminContestRoundDetail[];
  weeklyWinners: ContestWinnerSummary[];
  finalists: ContestFinalistSummary[];
  forfeitedWeeks: ContestForfeitedWeek[];
  finalRanking: ContestFinalRankingRow[] | null;
  monthlyStandings: ContestStandingSummary[];
  finalOutcome: ContestFinalOutcome | null;
}

export interface AdminContestCycleListItem {
  cycle: ContestCycleSummary;
  settings: AdminContestSettings;
  phase: ContestPhase;
  calendarState: ContestCalendarState | null;
  rounds: AdminContestRoundSummary[]; // summaries: no per-entry `entries`
  weeklyWinners: ContestWinnerSummary[];
  monthlyStandings: ContestStandingSummary[];
  finalOutcome: ContestFinalOutcome | null;
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

// ---- writes (create and edit only) ----------------------------------------

export const CONTEST_TITLE_MAX_LENGTH = 80;
export const CONTEST_TASK_MAX_LENGTH = 2000;
export const CONTEST_DESCRIPTION_MAX_LENGTH = 5000;
export const WATCH_LIMIT_MIN_SECONDS = 3;
export const WATCH_LIMIT_MAX_SECONDS = 120;
export const EXPOSURE_RANGE_MIN = 1;
export const EXPOSURE_RANGE_MAX = 50;

export interface ContestWeekInput {
  weekNumber: 1 | 2 | 3;
  task: string;
  viewWatchLimitSeconds: number;
}

export interface PlacementPointsInput {
  weekly?: [number, number, number];
  monthly?: [number, number, number];
}

export interface CreateCycleInput {
  /** "YYYY-MM"; the month must not have started. */
  month: string;
  title: string;
  description?: string;
  weeks: ContestWeekInput[];
  finalTask?: string;
  /** REQUIRED, no default (spec section 4). */
  minimumTally: number;
  placementPoints?: PlacementPointsInput;
  followersExcludedWeek4?: boolean;
  exposureTolerancePercent?: number;
  exposureViewerDailyCap?: number;
}

export function createContestCycle(input: CreateCycleInput): Promise<AdminContestCycleDetail> {
  return adminFetch<AdminContestCycleDetail>("/admin/contest/cycles", { method: "POST", body: input });
}

export interface UpdateCycleInput {
  title?: string;
  description?: string;
  weeks?: { weekNumber: 1 | 2 | 3; task?: string; viewWatchLimitSeconds?: number }[];
  finalTask?: string;
  minimumTally?: number;
  placementPoints?: PlacementPointsInput;
  followersExcludedWeek4?: boolean;
  exposureTolerancePercent?: number;
  exposureViewerDailyCap?: number;
}

/** A field that is locked once the contest starts is a 409 `contest_field_locked`; dates are never editable. */
export function updateContestCycle(id: string, input: UpdateCycleInput): Promise<AdminContestCycleDetail> {
  return adminFetch<AdminContestCycleDetail>(`/admin/contest/cycles/${id}`, { method: "PATCH", body: input });
}

// ---- the Week-4 impression distribution (B-092, Decision Log #388, #405 item 7) ----------------

export type ExposureStatus = "within" | "above" | "below";

/**
 * One finalist's row. Aggregates only: the server never returns a viewer, an event or a day, so
 * nothing on the screen can identify who saw a video.
 */
export interface AdminExposureEntry {
  entryId: string;
  finalist: { userId: string; publicName: string };
  /** false: the author is no longer eligible, so the video is out of the rotation and out of the mean. */
  inRotation: boolean;
  impressions: number;
  /** Against the tolerance band around the mean; null when the video is not in the rotation. */
  status: ExposureStatus | null;
  /** Signed deviation from the mean, percent of the mean; null when the mean is 0 or not in rotation. */
  deviationPercent: number | null;
}

// GET /admin/contest/cycles/:id/exposure
export interface AdminExposureResponse {
  cycleId: string;
  title: string;
  monthKey: string | null;
  settings: { tolerancePercent: number; viewerDailyCap: number };
  /** true while the final week is live (reveal <= now < month end). */
  live: boolean;
  revealed: boolean;
  /** 'live': counted from the per-viewer rows; 'final_totals': the per-entry totals kept at the crown. */
  source: "live" | "final_totals";
  finalistCount: number;
  mean: number;
  lowerBound: number;
  upperBound: number;
  min: number;
  max: number;
  outsideTolerance: number;
  entries: AdminExposureEntry[];
}

export function getContestExposure(cycleId: string): Promise<AdminExposureResponse> {
  return adminFetch<AdminExposureResponse>(`/admin/contest/cycles/${cycleId}/exposure`);
}
