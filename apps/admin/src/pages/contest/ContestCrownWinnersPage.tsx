// Crown Monthly Winners — POST /admin/contest/cycles/:id/crown. Figma
// node 6276:16213. The finalist pool is this cycle's weekly winners
// DEDUPLICATED by userId — CrownCycleDto rejects a repeated userId, so
// designing one row per weekly placing would produce a screen that
// cannot submit. Each row summarises that user's weekly placings.
// At least one standing is required; ties allowed; max 6.
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { AdminApiError } from "../../api/adminClient";
import { crownContestCycle, getContestCycle } from "../../api/contest";
import {
  PositionChips,
  dedupeFinalists,
  formatDateTime,
  useAsyncData,
  type PositionValue,
} from "./contestShared";
import "./contest.css";

export default function ContestCrownWinnersPage() {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const { data, loading, error } = useAsyncData(() => getContestCycle(id), [id]);

  const finalists = useMemo(
    () => (data ? dedupeFinalists(data.weeklyWinners) : []),
    [data],
  );

  const [standings, setStandings] = useState<Record<string, PositionValue>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const payload = useMemo(
    () =>
      finalists
        .map((f) => ({ userId: f.userId, position: standings[f.userId] ?? null }))
        .filter((s): s is { userId: string; position: 1 | 2 | 3 } => s.position != null),
    [finalists, standings],
  );

  const crown = async () => {
    setSubmitError(null);
    if (payload.length === 0) {
      setSubmitError("Set a standing for at least one finalist.");
      return;
    }
    setSaving(true);
    try {
      await crownContestCycle(id, payload);
      navigate("/contest");
    } catch (err) {
      setSaving(false);
      setSubmitError(
        err instanceof AdminApiError ? err.message : "Couldn’t crown the cycle. Please try again.",
      );
    }
  };

  return (
    <>
      <AdminPageHeader title="Crown Monthly Winners" hideSearch />
      <div className="ct-page">
        <div className="ct-back">
          <Link to="/contest">← Contest Console</Link>
        </div>
        <div className="ct-top-row">
          <h1 className="ct-title">Crown Monthly Winners</h1>
        </div>

        {loading ? <p className="ct-loading">Loading the finalists…</p> : null}
        {error ? (
          <p className="ct-error" role="alert">
            {error}
          </p>
        ) : null}

        {data ? (
          <>
            <div className="ct-card">
              <div className="ct-card__head">
                <h2 className="ct-card__title">{data.cycle.title}</h2>
                <span className="ct-pill ct-pill--strong">{data.cycle.status}</span>
              </div>
              <div className="ct-meta">
                {data.cycle.finalOpenedAt ? (
                  <span>Final opened {formatDateTime(data.cycle.finalOpenedAt)}</span>
                ) : null}
                <span>
                  {finalists.length} {finalists.length === 1 ? "finalist" : "finalists"} from{" "}
                  {data.weeklyWinners.length} weekly{" "}
                  {data.weeklyWinners.length === 1 ? "placing" : "placings"}
                </span>
              </div>
            </div>

            {submitError ? (
              <p className="ct-error" role="alert">
                {submitError}
              </p>
            ) : null}

            <div className="ct-finalists">
              {finalists.map((f) => (
                <div className="ct-finalist" key={f.userId}>
                  <div className="ct-finalist__copy">
                    <div className="ct-finalist__name">{f.displayName}</div>
                    <div className="ct-finalist__placings">{f.placings}</div>
                  </div>
                  <PositionChips
                    ariaLabel={`Standing for ${f.displayName}`}
                    value={standings[f.userId] ?? null}
                    onChange={(v) => setStandings((prev) => ({ ...prev, [f.userId]: v }))}
                  />
                </div>
              ))}
            </div>

            <div className="ct-actions-card">
              <button
                type="button"
                className="ct-btn ct-btn--primary"
                onClick={crown}
                disabled={saving || payload.length === 0}
              >
                {saving ? "Crowning…" : "Crown and close the cycle"}
              </button>
              <Link className="ct-btn ct-btn--outline" to="/contest">
                Cancel
              </Link>
              <span className="ct-actions-card__hint">
                Only this cycle’s weekly winners can be crowned, and each player appears once. At
                least one standing is required; ties are allowed. Crowning awards the monthly points
                and closes the cycle — it cannot be undone.
              </span>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
