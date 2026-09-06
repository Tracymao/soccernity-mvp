// Open the Final — POST /admin/contest/cycles/:id/final/open (no body).
// Figma node 6276:16080 (a confirm dialog). Reached only from the console
// hub when phase === "weeks_1_3" (all three weekly rounds judged).
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { AdminApiError } from "../../api/adminClient";
import { getContestCycle, openContestFinal } from "../../api/contest";
import { dedupeFinalists, formatDateTime, useAsyncData } from "./contestShared";
import "./contest.css";

export default function ContestOpenFinalPage() {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const { data, loading, error } = useAsyncData(() => getContestCycle(id), [id]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const finalistCount = data ? dedupeFinalists(data.weeklyWinners).length : 0;
  const placingCount = data?.weeklyWinners.length ?? 0;

  const confirm = async () => {
    setSubmitError(null);
    setSaving(true);
    try {
      await openContestFinal(id);
      navigate("/contest");
    } catch (err) {
      setSaving(false);
      setSubmitError(
        err instanceof AdminApiError ? err.message : "Couldn’t open the final. Please try again.",
      );
    }
  };

  return (
    <>
      <AdminPageHeader title="Open the Final" hideSearch />
      <div className="ct-page">
        <div className="ct-back">
          <Link to="/contest">← Contest Console</Link>
        </div>
        <div className="ct-top-row">
          <h1 className="ct-title">Open the Final</h1>
        </div>

        {loading ? <p className="ct-loading">Loading the cycle…</p> : null}
        {error ? (
          <p className="ct-error" role="alert">
            {error}
          </p>
        ) : null}

        {data ? (
          <div className="ct-confirm">
            <h2 className="ct-confirm__title">Open the final for {data.cycle.title}?</h2>
            <p className="ct-confirm__body">
              All three weekly rounds are judged. Opening the final moves the cycle from{" "}
              <strong>active</strong> to <strong>final</strong>. The{" "}
              <strong>{finalistCount}</strong> {finalistCount === 1 ? "finalist" : "finalists"} (from{" "}
              {placingCount} weekly {placingCount === 1 ? "placing" : "placings"}) then become the
              pool you crown from.
            </p>
            {submitError ? (
              <p className="ct-error" role="alert">
                {submitError}
              </p>
            ) : null}
            <div className="ct-form-actions">
              <button
                type="button"
                className="ct-btn ct-btn--primary"
                onClick={confirm}
                disabled={saving}
              >
                {saving ? "Opening…" : "Open the final"}
              </button>
              <Link className="ct-btn ct-btn--outline" to="/contest">
                Cancel
              </Link>
            </div>
            {data.cycle.finalOpenedAt ? (
              <p className="ct-note">
                The final was already opened {formatDateTime(data.cycle.finalOpenedAt)}.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
