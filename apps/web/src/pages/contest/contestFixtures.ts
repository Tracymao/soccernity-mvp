// Shared test fixtures for GET /contest/current (the W7 self-running contest shape). Not shipped code.
import type {
  ContestCalendarState,
  ContestCycleSummary,
  ContestRoundSummary,
  CurrentContestResponse,
} from "../../api/contest";

export function cycleSummary(over: Partial<ContestCycleSummary> = {}): ContestCycleSummary {
  return {
    id: "cycle-1",
    title: "September Contest",
    description: null,
    monthKey: "2026-09",
    status: "active",
    startsAt: "2026-09-01T07:00:00.000Z",
    endsAt: "2026-10-01T00:00:00.000Z",
    finalOpenedAt: null,
    crownedAt: null,
    ...over,
  };
}

export function roundSummary(weekNumber: number, over: Partial<ContestRoundSummary> = {}): ContestRoundSummary {
  return {
    id: `round-${weekNumber}`,
    weekNumber,
    status: "open",
    opensAt: "2026-09-08T07:00:00.000Z",
    closesAt: "2026-09-14T19:00:00.000Z",
    judgedAt: null,
    task: weekNumber < 4 ? "Show your best first touch." : null,
    entriesCloseAt: "2026-09-12T23:00:00.000Z",
    votesLockAt: "2026-09-14T19:00:00.000Z",
    viewWatchLimitSeconds: weekNumber < 4 ? 10 : null,
    forfeited: false,
    forfeitReason: null,
    ...over,
  };
}

export const entriesOpen = (weekNumber: 1 | 2 | 3 = 2): ContestCalendarState => ({
  kind: "week_entries",
  weekNumber,
  entriesCloseAt: "2026-09-12T23:00:00.000Z",
});

/** A GET /contest/current body with no contest at all. */
export function noContest(): CurrentContestResponse {
  return {
    cycle: null,
    phase: null,
    calendarState: null,
    isAcceptingEntries: false,
    activeRound: null,
    rounds: [],
    weeklyWinners: [],
    finalists: [],
    forfeitedWeeks: [],
    finalRanking: null,
    monthlyStandings: [],
    finalOutcome: null,
    callerEntry: null,
    callerFinalEntry: null,
    callerIsFinalist: false,
    callerCanEnter: false,
    callerVote: null,
  };
}

/** A contest in week 2, Phase 1 (entries open), the caller able to enter. */
export function openContest(over: Partial<CurrentContestResponse> = {}): CurrentContestResponse {
  return {
    ...noContest(),
    cycle: cycleSummary(),
    phase: "week_1",
    calendarState: entriesOpen(2),
    isAcceptingEntries: true,
    activeRound: roundSummary(2),
    rounds: [roundSummary(1, { status: "judged" }), roundSummary(2)],
    callerCanEnter: true,
    ...over,
  };
}
