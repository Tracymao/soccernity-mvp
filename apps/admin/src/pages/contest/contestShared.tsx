// Shared helpers + presentational bits for the Contest admin console
// screens (Figma row A/B/C, nodes 6266–6278; Decision Log #242/#243).
//
// The console models the real state machine: one ContestCycle → three
// weekly ContestRounds judged strictly in order → open the final → crown
// the monthly top 3. `phase` is derived server-side (never stored) and
// drives which primary action the hub offers.
import { useCallback, useEffect, useState } from "react";
import { AdminApiError } from "../../api/adminClient";
import type { ContestPhase, ContestWinnerSummary } from "../../api/contest";
import "./contest.css";

// ---- formatting --------------------------------------------------------

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

export function ordinal(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

// ---- phase ------------------------------------------------------------

export const PHASE_ORDER: ContestPhase[] = [
  "vacant",
  "week_1",
  "weeks_1_2",
  "weeks_1_3",
  "final_live",
  "crowned",
];

export const PHASE_LABEL: Record<ContestPhase, string> = {
  vacant: "No weeks judged",
  week_1: "Week 1",
  weeks_1_2: "Weeks 1–2",
  weeks_1_3: "Weeks 1–3",
  final_live: "Final live",
  crowned: "Crowned",
};

export function PhaseStrip({ phase }: { phase: ContestPhase | null }) {
  const activeIdx = phase ? PHASE_ORDER.indexOf(phase) : -1;
  return (
    <div className="ct-phase-strip" data-testid="ct-phase-strip">
      {PHASE_ORDER.map((p, i) => {
        const state = i === activeIdx ? "active" : i < activeIdx ? "past" : "future";
        return (
          <span key={p} className={`ct-phase-chip ct-phase-chip--${state}`}>
            {PHASE_LABEL[p]}
          </span>
        );
      })}
    </div>
  );
}

export function StatusPill({ value }: { value: string }) {
  // "open" / "final" / "active" render navy; "judged" / "completed" render
  // as the calmer green-tint pill — matching the Figma treatment.
  const strong = value === "open" || value === "final" || value === "active";
  return <span className={`ct-pill ${strong ? "ct-pill--strong" : "ct-pill--soft"}`}>{value}</span>;
}

// ---- position selector (Judge Week / Crown Winners) ------------------

export type PositionValue = 1 | 2 | 3 | null;

const POSITION_OPTIONS: { label: string; value: PositionValue }[] = [
  { label: "1st", value: 1 },
  { label: "2nd", value: 2 },
  { label: "3rd", value: 3 },
  { label: "None", value: null },
];

export function PositionChips({
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: PositionValue;
  onChange: (v: PositionValue) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <div className="ct-chips" role="group" aria-label={ariaLabel}>
      {POSITION_OPTIONS.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.label}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            className={`ct-chip ${selected ? "ct-chip--selected" : ""}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ---- finalist pool (Crown Winners) ---------------------------------

export interface Finalist {
  userId: string;
  displayName: string;
  placings: string; // "Week 1 · 1st · Week 2 · 2nd"
}

// The crown picker's pool is the weekly winners DEDUPLICATED by userId —
// CrownCycleDto rejects a repeated userId (Task 2 §1 / Figma report).
export function dedupeFinalists(weeklyWinners: ContestWinnerSummary[]): Finalist[] {
  const byUser = new Map<string, Finalist>();
  for (const w of weeklyWinners) {
    const existing = byUser.get(w.userId);
    const placing = `Week ${w.weekNumber} · ${ordinal(w.position)}`;
    if (existing) {
      existing.placings += ` · ${placing}`;
    } else {
      byUser.set(w.userId, {
        userId: w.userId,
        displayName: w.displayName,
        placings: placing,
      });
    }
  }
  return [...byUser.values()];
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
