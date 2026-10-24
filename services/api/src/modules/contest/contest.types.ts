import { ContestCalendarState } from './contest-schedule.util';

// backend/w7-contest (B-091). Response shapes of the self-running Contest.
//
// Two audiences, one rule: the MINIMUM TALLY is admin-only and never leaves an admin type (spec
// section 10, Decision Log #400 E8). Nothing in the "user" types below carries it, and neither do
// the placement-point values (those are shown in the admin form and on the winners only as awarded
// points, not as a setting).
//
// Dates serialise to ISO strings over HTTP; the types keep Date for the service layer.

// The derived coarse phase, kept because apps/web's Leaderboard Contest tab already reads it
// (Decision Log #61/#70). NEVER stored. For a new-model cycle:
//   vacant     0 of the 3 weekly rounds decided
//   week_1     1 decided           weeks_1_2   2 decided        weeks_1_3   all 3 decided (a forfeited week counts as decided)
//   final_live the reveal has happened (status 'final')
//   crowned    the month is over (status 'completed')
// The finer, clock-driven answer is `calendarState`.
export type ContestPhase = 'vacant' | 'week_1' | 'weeks_1_2' | 'weeks_1_3' | 'final_live' | 'crowned';

export type ContestFinalOutcome = 'pending' | 'winners' | 'no_winner' | 'no_final';

export interface ContestCycleSummary {
  id: string;
  title: string;
  description: string | null;
  /** "YYYY-MM"; null for a legacy admin-judged cycle. */
  monthKey: string | null;
  status: string;
  startsAt: Date;
  endsAt: Date;
  /** Set at the reveal. */
  finalOpenedAt: Date | null;
  /** Set when the cycle completes. */
  crownedAt: Date | null;
}

export interface ContestRoundSummary {
  id: string;
  weekNumber: number;
  status: string;
  opensAt: Date;
  /** The (exclusive) end of the round's last window: the vote lock (weeks 1-3) or the reveal (week 4). */
  closesAt: Date;
  judgedAt: Date | null;
  /**
   * The admin's task text. Hidden (null) until the week has opened so a future week cannot be read
   * early; the final's task is shown only in the uploading and live-ranking states (Decision Log
   * #403 item 10).
   */
  task: string | null;
  /** Weeks 1-3: when entries stop and voting starts (00:00 on day 5/12/19). null for week 4 and legacy cycles. */
  entriesCloseAt: Date | null;
  /** Weeks 1-3: when votes lock (20:00 on day 7/14/21). null for week 4 and legacy cycles. */
  votesLockAt: Date | null;
  /** Weeks 1-3: the seconds a video must be watched to count as a view in this week's ranking. */
  viewWatchLimitSeconds: number | null;
  forfeited: boolean;
  /** Shown to users with the forfeit pop-up (spec section 7). */
  forfeitReason: string | null;
}

export interface ContestWinnerSummary {
  weekNumber: number;
  position: number;
  userId: string;
  // username if set, else displayName (users/public-name.util.ts)
  publicName: string;
  entryId: string;
  postId: string;
}

export interface ContestStandingSummary {
  position: number;
  userId: string;
  // username if set, else displayName (users/public-name.util.ts)
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

/** One finalist in the week-4 ranking. Live from the reveal; the stored result once crowned. */
export interface ContestFinalRankingRow {
  rank: number;
  entryId: string;
  postId: string;
  userId: string;
  publicName: string;
  /** Likes + comments counted (the admin's followers-excluded switch applies). */
  points: number;
}

// GET /contest/current -- everything the Create Post "For Contest" tab (Decision Log #188), the
// Contest page and the Leaderboard Contest tab (Decision Log #61/#70) need in one call.
export interface CurrentContestResponse {
  // null only when no contest has ever been created.
  cycle: ContestCycleSummary | null;
  phase: ContestPhase | null;
  /** The clock-driven state: upcoming, week_entries, week_voting, week_forfeited, between_weeks, final_upload, final_live, no_final, completed. null for a legacy cycle. */
  calendarState: ContestCalendarState | null;
  /**
   * true iff SOME account could submit an entry right now: a weekly entry window is open, or the
   * finalist upload window is open. The Create Post "Contest" tab is shown while this is true (a
   * non-finalist sees the closed state during the upload window, Decision Log #403 item 1); whether
   * THIS caller may enter is `callerCanEnter`.
   */
  isAcceptingEntries: boolean;
  /** The round whose entry window is open (a weekly round, or round 4 during the upload window), or null. */
  activeRound: ContestRoundSummary | null;
  rounds: ContestRoundSummary[];
  /** Weekly top-3s decided so far, ordered by week then position. */
  weeklyWinners: ContestWinnerSummary[];
  /** The weekly winners, once week 3 is decided. They are the only ones who can enter the final. */
  finalists: ContestFinalistSummary[];
  /** Weeks that were forfeited, for the Contest-page pop-up (oldest first). */
  forfeitedWeeks: ContestForfeitedWeek[];
  /** The week-4 ranking: live from the reveal, final once crowned. null before the reveal. */
  finalRanking: ContestFinalRankingRow[] | null;
  /** Populated only once the month is crowned. */
  monthlyStandings: ContestStandingSummary[];
  finalOutcome: ContestFinalOutcome | null;
  /** The caller's weekly entry in the round whose entry window is open. */
  callerEntry: { roundId: string; weekNumber: number; postId: string } | null;
  /** The caller's final entry (they can always see their own, even hidden before the reveal). */
  callerFinalEntry: { entryId: string; postId: string; submittedAt: Date } | null;
  callerIsFinalist: boolean;
  /** Whether this caller could submit an entry right now (window open, not yet entered, finalist for week 4). */
  callerCanEnter: boolean;
  /** The caller's current vote in the round being voted on. */
  callerVote: { roundId: string; entryId: string } | null;
}

// GET /contest/cycles/:id -- one cycle in full, for the "past months" view. Same shape minus the
// per-caller fields.
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

// ---------------------------------------------------------------------------------------------
// Entries and votes (user-facing)
// ---------------------------------------------------------------------------------------------

export interface ContestEntryView {
  entryId: string;
  roundId: string;
  weekNumber: number;
  /** A final (week 4) entry is the only kind in round 4. */
  kind: 'weekly' | 'final';
  entrant: { userId: string; publicName: string };
  post: {
    id: string;
    contentText: string;
    mediaUrls: string[];
    createdAt: Date;
    likeCount: number;
    commentCount: number;
  };
  submittedAt: Date;
  /** Whether this entry reached the top 10 and can be voted on. */
  qualified: boolean;
  /** The Phase 1 rank, once Phase 1 has been ranked. The tally behind it is admin-only. */
  phase1Rank: number | null;
  /** The live vote count while voting is open, the frozen one once decided; null before Phase 2. */
  voteCount: number | null;
  /** Whether the CALLER's current vote is for this entry. */
  votedByCaller: boolean;
  /** The weekly position (1-3) if this entry won its week. */
  position: number | null;
  pinned: boolean;
}

export interface ContestRoundEntriesResponse {
  round: ContestRoundSummary;
  calendarState: ContestCalendarState | null;
  /** While Phase 1 is open: every entry, newest first, paged. Afterwards: the qualified entries, best Phase 1 rank first (or by position once decided). */
  items: ContestEntryView[];
  nextCursor: string | null;
  /** The caller's current vote in this round (an entry id), or null. */
  callerVote: string | null;
}

/** PUT/DELETE /contest/entries/:entryId/vote -- the toggle's result, enough to update the screen live by one. */
export interface ContestVoteState {
  roundId: string;
  entryId: string;
  /** Whether the caller's vote is now on this entry. */
  voted: boolean;
  /** The entry's vote count after the change. */
  voteCount: number;
  /** The caller's current vote in the round, or null. */
  callerVote: string | null;
}

export interface PinnedEntryResponse {
  entry: {
    entryId: string;
    kind: 'weekly' | 'final';
    weekNumber: number;
    pinnedUntil: Date | null;
    /** The post, in the same shape GET /posts/:id returns. */
    postId: string;
  } | null;
}

// ---------------------------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------------------------

export interface AdminContestSettings {
  /** ADMIN-ONLY. */
  minimumTally: number | null;
  weeklyPoints: [number, number, number];
  monthlyPoints: [number, number, number];
  followersExcludedWeek4: boolean;
  exposureTolerancePercent: number;
  exposureViewerDailyCap: number;
}

/** Which fields an edit may still change right now (spec section 4a), so the form can disable the rest. */
export interface AdminContestEditability {
  /** Before week 1 opens everything but the dates is editable. */
  beforeLaunch: boolean;
  title: boolean;
  description: boolean;
  minimumTally: boolean;
  placementPoints: boolean;
  /** Week 4 only: locked once week 4 starts. */
  followersExcludedWeek4: boolean;
  exposureTolerancePercent: boolean;
  exposureViewerDailyCap: boolean;
  /** Per week 1-4: whether its task text can still be edited (it has not started). */
  taskByWeek: Record<number, boolean>;
  /** Per week 1-3: whether its watch limit can still be edited (it has not started). */
  watchLimitByWeek: Record<number, boolean>;
}

export interface AdminContestRoundSummary extends ContestRoundSummary {
  entryCount: number;
}

export interface AdminContestCycleListItem {
  cycle: ContestCycleSummary;
  settings: AdminContestSettings;
  phase: ContestPhase;
  calendarState: ContestCalendarState | null;
  rounds: AdminContestRoundSummary[];
  weeklyWinners: ContestWinnerSummary[];
  monthlyStandings: ContestStandingSummary[];
  finalOutcome: ContestFinalOutcome | null;
}

export interface AdminContestCycleListResponse {
  items: AdminContestCycleListItem[];
}

export interface AdminContestEntry {
  entryId: string;
  kind: 'weekly' | 'final';
  submittedAt: Date;
  entrant: { userId: string; publicName: string };
  post: {
    id: string;
    contentText: string;
    mediaUrls: string[];
    createdAt: Date;
    likeCount: number;
    commentCount: number;
  };
  qualified: boolean;
  /** Admin-only: the engagement total that ranked it. */
  phase1Tally: number | null;
  phase1Rank: number | null;
  voteCount: number;
  /** Admin-only: the final points and rank, once crowned. */
  finalTally: number | null;
  finalRank: number | null;
  position: number | null;
}

// For an admin, `task` is never hidden: they see a week that has not opened and the final's.
export interface AdminContestRoundDetail extends AdminContestRoundSummary {
  entries: AdminContestEntry[];
}

export interface AdminContestCycleDetailResponse {
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

export interface AdminCurrentContestResponse {
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
