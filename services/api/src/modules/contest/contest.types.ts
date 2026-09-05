// sprint-2/contest-data-model-backend — the derived Contest phase.
//
// NEVER stored — computed by ContestService.derivePhase() from
// ContestCycle.status plus how many of its weekly rounds are 'judged'.
// Maps 1:1 to the Figma states in Decision Log #61 / #70:
//
//   vacant     — cycle active, 0 rounds judged        (DL #70 step 1, "Week 1 Phase 1")
//   week_1     — cycle active, 1 round judged          (DL #70 step 2, 3 rows)
//   weeks_1_2  — cycle active, 2 rounds judged         (DL #70 step 3, 6 rows)
//   weeks_1_3  — cycle active, 3 rounds judged         (DL #70 step 4, 9 rows, count DYNAMIC)
//   final_live — cycle status 'final'                  (DL #61 state 2, "LEVEL 1 FINAL · LIVE")
//   crowned    — cycle status 'completed'              (DL #61 state 3, monthly top 3)
export type ContestPhase = 'vacant' | 'week_1' | 'weeks_1_2' | 'weeks_1_3' | 'final_live' | 'crowned';

export interface ContestCycleSummary {
  id: string;
  title: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  finalOpenedAt: Date | null;
  crownedAt: Date | null;
}

export interface ContestRoundSummary {
  id: string;
  weekNumber: number;
  status: string;
  opensAt: Date;
  closesAt: Date;
  judgedAt: Date | null;
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

// GET /contest/current — everything the Create Post "For Contest" mode-tab
// (Decision Log #188) and the Leaderboard Contest tab (Decision Log
// #61/#70) need in one call.
export interface CurrentContestResponse {
  // null only when no ContestCycle has ever been created.
  cycle: ContestCycleSummary | null;
  phase: ContestPhase | null;
  // The Decision Log #188 boolean: true iff a "Create a Post — For
  // Contest" submission would succeed right now (cycle status 'active'
  // AND a round is open within its [opensAt, closesAt] window).
  isAcceptingEntries: boolean;
  // The round currently accepting entries, or null.
  activeRound: ContestRoundSummary | null;
  rounds: ContestRoundSummary[];
  // Weekly top-3s so far — fills progressively as rounds are judged
  // (Decision Log #70). Ordered by weekNumber then position.
  weeklyWinners: ContestWinnerSummary[];
  // Populated only in the 'crowned' phase (Decision Log #61 state 3).
  monthlyStandings: ContestStandingSummary[];
  // The caller's own entry in the currently-open round, if any — so the
  // composer can show a "you've already entered this week" state.
  callerEntry: { roundId: string; weekNumber: number; postId: string } | null;
}

// GET /contest/cycles/:id — a single cycle in full, for the Leaderboard
// Contest tab's "past months" view.
export interface ContestCycleDetailResponse {
  cycle: ContestCycleSummary;
  phase: ContestPhase;
  rounds: ContestRoundSummary[];
  weeklyWinners: ContestWinnerSummary[];
  monthlyStandings: ContestStandingSummary[];
}
