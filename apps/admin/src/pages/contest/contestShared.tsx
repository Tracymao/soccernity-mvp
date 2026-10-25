// Shared helpers + small presentational bits for the Contest admin screens (build register B-097; Figma
// pass C frames 6643:21602 to 6646:24345; Decision Log #381-#406).
//
// The Contest runs itself on the fixed Europe/London calendar, so every date here is shown in
// Europe/London whatever the admin's own clock says (docs/contest-spec.md section 5). There is no
// judging, opening or crowning to drive: the screens only show status and edit the contest.
import { useCallback, useEffect, useState } from "react";
import { AdminApiError } from "../../api/adminClient";
import type { AdminContestRoundSummary, ContestCalendarState } from "../../api/contest";
import "./contest.css";

const TZ = "Europe/London";

// ---- formatting (Europe/London) --------------------------------------------

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }).format(d);
}

/** "5 Oct, 20:00" in London time. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return `${day}, ${time}`;
}

export function ordinal(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

/** "October 2026" from a "YYYY-MM" month key. */
export function monthLabel(monthKey: string | null | undefined): string {
  if (!monthKey) return "";
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

// ---- status -------------------------------------------------------------

/** What a round is doing right now, from the round's own fields and the calendar state. */
export function roundStatusLabel(round: AdminContestRoundSummary, calendar: ContestCalendarState | null): string {
  if (round.forfeited) return "Forfeited";
  if (round.status === "judged") return round.weekNumber === 4 ? "Final decided" : "Winners confirmed";
  const week = round.weekNumber;
  if (calendar) {
    if (calendar.kind === "week_entries" && calendar.weekNumber === week) return "Entries open";
    if (calendar.kind === "week_voting" && calendar.weekNumber === week) return "Voting open";
    if (calendar.kind === "week_forfeited" && calendar.weekNumber === week) return "Forfeited";
    if (week === 4 && calendar.kind === "final_upload") return "Uploads open";
    if (week === 4 && calendar.kind === "final_live") return "Live ranking";
  }
  return "Scheduled";
}

export function StatusPill({ value }: { value: string }) {
  // Live states render navy; settled or waiting states the calmer green-tint pill.
  const strong = ["open", "final", "active", "Entries open", "Voting open", "Uploads open", "Live ranking"].includes(
    value,
  );
  return <span className={`ct-pill ${strong ? "ct-pill--strong" : "ct-pill--soft"}`}>{value}</span>;
}

/** One line describing where the contest is, for the header pill. */
export function calendarLabel(calendar: ContestCalendarState | null): string {
  if (!calendar) return "";
  switch (calendar.kind) {
    case "upcoming":
      return "Starts soon";
    case "week_entries":
      return `Week ${calendar.weekNumber} · Phase 1 · entries`;
    case "week_voting":
      return `Week ${calendar.weekNumber} · Phase 2 · voting`;
    case "week_forfeited":
      return `Week ${calendar.weekNumber} · forfeited`;
    case "between_weeks":
      return `Between weeks ${calendar.afterWeek} and ${calendar.nextWeek}`;
    case "final_upload":
      return "Week 4 · final uploads";
    case "final_live":
      return "Week 4 · final live";
    case "no_final":
      return "No final this month";
    case "completed":
      return "Completed";
    default:
      return "";
  }
}

// ---- async data hook -------------------------------------------------

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  errorStatus: number | null;
  reload: () => void;
}

export function useAsyncData<T>(fetcher: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setErrorStatus(null);
    fetcher()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Couldn’t load contest data.");
          setErrorStatus(err instanceof AdminApiError ? err.status : null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [...deps, nonce]);

  return { data, loading, error, errorStatus, reload };
}
