// Start a Contest Cycle — POST /admin/contest/cycles. Figma frames
// 6272:15373 (auto windows), 6273:15474 (custom weekly windows),
// 6273:15664 (the real 409 "a cycle is already running").
//
// Omitting `rounds` → the server auto-generates three consecutive 7-day
// windows from the start date. Providing them → exactly weeks 1, 2, 3.
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { AdminApiError } from "../../api/adminClient";
import { createContestCycle, type CreateCycleRoundInput } from "../../api/contest";
import { formatDate } from "./contestShared";
import "./contest.css";

function toIso(dateStr: string): string {
  return dateStr ? new Date(dateStr).toISOString() : "";
}

function addDaysIso(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

type Mode = "auto" | "manual";

interface WeekWindow {
  opensAt: string;
  closesAt: string;
}

export default function ContestStartCyclePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [mode, setMode] = useState<Mode>("auto");
  const [weeks, setWeeks] = useState<WeekWindow[]>([
    { opensAt: "", closesAt: "" },
    { opensAt: "", closesAt: "" },
    { opensAt: "", closesAt: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const autoPreview = useMemo(() => {
    if (!startsAt) return null;
    const base = new Date(startsAt).toISOString();
    return [0, 7, 14].map((offset) => ({
      opensAt: addDaysIso(base, offset),
      closesAt: addDaysIso(base, offset + 7),
    }));
  }, [startsAt]);

  const setWeek = (i: number, patch: Partial<WeekWindow>) => {
    setWeeks((prev) => prev.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!title.trim()) {
      setError("A cycle title is required.");
      return;
    }
    if (!startsAt || !endsAt) {
      setError("Both a start and an end date are required.");
      return;
    }
    if (new Date(startsAt) >= new Date(endsAt)) {
      setError("The start date must be before the end date.");
      return;
    }

    let rounds: CreateCycleRoundInput[] | undefined;
    if (mode === "manual") {
      if (weeks.some((w) => !w.opensAt || !w.closesAt)) {
        setError("Set an opens and closes date for all three weeks.");
        return;
      }
      rounds = weeks.map((w, i) => ({
        weekNumber: (i + 1) as 1 | 2 | 3,
        opensAt: toIso(w.opensAt),
        closesAt: toIso(w.closesAt),
      }));
    }

    setSaving(true);
    try {
      await createContestCycle({
        title: title.trim(),
        startsAt: toIso(startsAt),
        endsAt: toIso(endsAt),
        rounds,
      });
      navigate("/contest");
    } catch (err) {
      setSaving(false);
      if (err instanceof AdminApiError && err.status === 409) {
        setBlocked(err.message);
        return;
      }
      setError(
        err instanceof AdminApiError ? err.message : "Couldn’t start the cycle. Please try again.",
      );
    }
  };

  return (
    <>
      <AdminPageHeader title="Start a Contest Cycle" hideSearch />
      <div className="ct-page">
        <div className="ct-back">
          <Link to="/contest">← Contest Console</Link>
        </div>
        <div className="ct-top-row">
          <h1 className="ct-title">Start a Contest Cycle</h1>
        </div>

        {blocked ? (
          <>
            <div className="ct-callout ct-callout--alert" role="alert">
              <span className="ct-callout__bar" aria-hidden />
              <p>{blocked}</p>
            </div>
            <div className="ct-action-row">
              <Link className="ct-btn ct-btn--primary" to="/contest">
                Go to Contest Console
              </Link>
              <span className="ct-action-hint">
                Only one cycle can run at a time — crown the current one before starting another.
              </span>
            </div>
          </>
        ) : (
          <div className="ct-form-card">
            {error ? (
              <p className="ct-error" role="alert">
                {error}
              </p>
            ) : null}

            <h2 className="ct-form-section-title">Cycle</h2>
            <label className="ct-field">
              <span className="ct-field__label">Cycle title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. September 2026 Contest"
                maxLength={200}
              />
              <span className="ct-field__hint">
                Shown to players on the Contest page and the Leaderboard Contest tab.
              </span>
            </label>

            <div className="ct-date-row">
              <label className="ct-field">
                <span className="ct-field__label">Starts at</span>
                <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </label>
              <label className="ct-field">
                <span className="ct-field__label">Ends at</span>
                <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                <span className="ct-field__hint">Must be after the start date.</span>
              </label>
            </div>

            <div className="ct-divider" />
            <h2 className="ct-form-section-title">Weekly rounds</h2>

            <label
              className={"ct-radio-option" + (mode === "auto" ? " ct-radio-option--on" : "")}
            >
              <input
                type="radio"
                name="round-mode"
                checked={mode === "auto"}
                onChange={() => setMode("auto")}
              />
              <span className="ct-radio-option__label">
                <strong>Generate automatically</strong>
                <span>Three consecutive 7-day rounds are created from the start date.</span>
              </span>
            </label>
            <label
              className={"ct-radio-option" + (mode === "manual" ? " ct-radio-option--on" : "")}
            >
              <input
                type="radio"
                name="round-mode"
                checked={mode === "manual"}
                onChange={() => setMode("manual")}
              />
              <span className="ct-radio-option__label">
                <strong>Set each week manually</strong>
                <span>Choose the opens/closes window for weeks 1, 2 and 3 yourself.</span>
              </span>
            </label>

            {mode === "auto" && autoPreview ? (
              <div className="ct-preview">
                <span className="ct-field__label">Rounds that will be created</span>
                {autoPreview.map((w, i) => (
                  <div className="ct-preview__row" key={i}>
                    <strong>Week {i + 1}</strong>
                    <span>
                      {formatDate(w.opensAt)} — {formatDate(w.closesAt)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {mode === "manual" ? (
              <div className="ct-week-windows">
                {weeks.map((w, i) => (
                  <div className="ct-week-windows__row" key={i}>
                    <span>Week {i + 1}</span>
                    <label className="ct-field">
                      <span className="ct-field__label">Opens at</span>
                      <input
                        type="date"
                        value={w.opensAt}
                        onChange={(e) => setWeek(i, { opensAt: e.target.value })}
                      />
                    </label>
                    <label className="ct-field">
                      <span className="ct-field__label">Closes at</span>
                      <input
                        type="date"
                        value={w.closesAt}
                        onChange={(e) => setWeek(i, { closesAt: e.target.value })}
                      />
                    </label>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="ct-form-actions">
              <button
                type="button"
                className="ct-btn ct-btn--primary"
                onClick={handleSubmit}
                disabled={saving}
              >
                {saving ? "Starting…" : "Start cycle"}
              </button>
              <Link className="ct-btn ct-btn--outline" to="/contest">
                Cancel
              </Link>
            </div>
          </div>
        )}

        <div className="ct-callout">
          <span className="ct-callout__bar" aria-hidden />
          <p>
            Starting a cycle opens week 1 for entries immediately. Only one cycle can run at a time —
            if a cycle is already active or in its final, crown it before starting another.
          </p>
        </div>
      </div>
    </>
  );
}
