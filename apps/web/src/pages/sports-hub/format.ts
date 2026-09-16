// Shared formatting helpers for SportsHubPage.tsx / MatchCentrePage.tsx.
// Pulled out once both files needed the same kickoff-time/phase-label
// logic, mirroring GrassrootsTeamPage's DAY_FMT/TIME_FMT precedent.
import type { MatchPhase, MatchSummary } from "../../api/sports";

const DAY_FMT = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short" });
const TIME_FMT = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
const DATE_TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatKickoffDay(iso: string): string {
  return DAY_FMT.format(new Date(iso));
}

export function formatKickoffTime(iso: string): string {
  return TIME_FMT.format(new Date(iso));
}

export function formatKickoffFull(iso: string): string {
  return DATE_TIME_FMT.format(new Date(iso));
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monogramFor(name: string): string {
  return name.trim()[0]?.toUpperCase() ?? "?";
}

// A short pill label + CSS class for a match's coarse MatchPhase, using
// the vendor's own free-text `statusDetail` where it's the more useful
// display (e.g. "Half time" while live) and falling back to a generic
// label per phase otherwise.
export function phaseLabel(match: Pick<MatchSummary, "status" | "statusDetail" | "kickoffTime">): string {
  switch (match.status) {
    case "live":
      return match.statusDetail ?? "Live";
    case "finished":
      return "FT";
    case "postponed":
      return "Postponed";
    case "cancelled":
      return "Cancelled";
    case "scheduled":
    default:
      return formatKickoffTime(match.kickoffTime);
  }
}

export function phaseClass(status: MatchPhase): string {
  if (status === "live") return "sh-status sh-status--live";
  if (status === "finished") return "sh-status sh-status--ft";
  if (status === "postponed" || status === "cancelled") return "sh-status sh-status--off";
  return "sh-status sh-status--scheduled";
}
