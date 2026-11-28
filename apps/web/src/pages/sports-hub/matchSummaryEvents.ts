// CH-H21 -- Match Summary grouping (Figma 632:943). Pure functions over the cached events feed.
//
// The match data carries no half-time score, so each half's score is counted from its goal events and
// shown only when it can be trusted: the counted goals must add up to the match's own score. Anything
// that makes a half unclear (a goal with no side or minute, an own goal whose credited side cannot be
// settled, a goal after the 90th minute) hides that score rather than guessing.
import type { MatchEvent, MatchSummary } from "../../api/sports";

// Synthetic period markers the API adds; the half bands stand in for them.
const PERIOD_MARKERS = new Set(["kick off", "half time", "full time"]);
const GOAL_TYPES = new Set(["goal", "penalty", "own goal"]);

export type SummaryKind = "goal" | "penalty" | "own-goal" | "yellow" | "red" | "substitution" | "other";

const KINDS: Record<string, SummaryKind> = {
  goal: "goal",
  penalty: "penalty",
  "own goal": "own-goal",
  "yellow card": "yellow",
  "red card": "red",
  substitution: "substitution",
};

const typeKey = (type: string) => type.trim().toLowerCase();

export function eventKind(type: string): SummaryKind {
  return KINDS[typeKey(type)] ?? "other";
}

export interface Score {
  home: number;
  away: number;
}

export interface SummaryHalf {
  events: MatchEvent[];
  score: Score | null;
}

export interface SummaryData {
  first: SummaryHalf;
  // null until the second half has been reached.
  second: SummaryHalf | null;
  // Running score after each goal event, only when the whole feed adds up.
  running: Map<MatchEvent, Score>;
}

function countGoals(goals: MatchEvent[], ownGoalCountsAgainst: boolean): Score {
  const score = { home: 0, away: 0 };
  for (const goal of goals) {
    const flip = ownGoalCountsAgainst && eventKind(goal.type) === "own-goal";
    const home = (goal.side === "home") !== flip;
    score[home ? "home" : "away"] += 1;
  }
  return score;
}

export function buildSummary(
  items: MatchEvent[],
  match: Pick<MatchSummary, "homeScore" | "awayScore" | "status" | "statusDetail">,
): SummaryData {
  // The API sends newest first.
  const events = items
    .filter((e) => !PERIOD_MARKERS.has(typeKey(e.type)))
    .sort((a, b) => a.minute - b.minute || a.addedTime - b.addedTime);
  const firstEvents = events.filter((e) => e.minute <= 45);
  const secondEvents = events.filter((e) => e.minute > 45);
  const reachedSecond =
    match.status === "finished" ||
    secondEvents.length > 0 ||
    /second half|extra|half time|penalt/i.test(match.statusDetail ?? "");

  const goals = events.filter((e) => GOAL_TYPES.has(typeKey(e.type)));
  const usable = goals.every((g) => g.side != null && g.minute > 0);

  // The provider does not document which side an own goal is filed under: try both readings and keep
  // the one that matches the match score, only if exactly one does (or there is no own goal).
  let flipOwnGoals: boolean | null = null;
  if (usable && match.homeScore != null && match.awayScore != null) {
    const fits = [false, true].filter((flip) => {
      const total = countGoals(goals, flip);
      return total.home === match.homeScore && total.away === match.awayScore;
    });
    const hasOwnGoal = goals.some((g) => eventKind(g.type) === "own-goal");
    if (fits.length === 1 || (fits.length === 2 && !hasOwnGoal)) flipOwnGoals = fits[0];
  }

  const running = new Map<MatchEvent, Score>();
  let first: Score | null = null;
  let second: Score | null = null;
  if (flipOwnGoals !== null) {
    const flip = flipOwnGoals;
    goals.forEach((g, i) => running.set(g, countGoals(goals.slice(0, i + 1), flip)));
    first = countGoals(goals.filter((g) => g.minute <= 45), flip);
    const late = goals.filter((g) => g.minute > 45);
    second = late.some((g) => g.minute > 90) ? null : countGoals(late, flip);
  }

  return {
    first: { events: firstEvents, score: first },
    second: reachedSecond ? { events: secondEvents, score: second } : null,
    running,
  };
}

// The API's substitution detail is "Replaced <player coming off>".
export function playerOff(e: MatchEvent): string | null {
  return e.detail?.startsWith("Replaced ") ? e.detail.slice("Replaced ".length) : null;
}
