// Contest Console — the hub. One page that branches on `phase`
// (GET /admin/contest/current). Figma frames 6271:15272 (No Cycle),
// 6269:14868 (Vacant), 6266:14767 (Weeks In Progress — covers week_1 /
// weeks_1_2), 6269:15107 (All Weeks Judged), 6270:15070 (Final Live),
// 6270:15346 (Crowned).
//
// GET /admin/contest/current resolves the running cycle, or the
// most-recently completed one — so the "Crowned" state is where the next
// cycle is started from, rather than the console going blank after a crown.
//
// This is the ONLY entry point to the write actions: the phase-contextual
// primary routes to Judge week N / Open the final / Crown winners / Start a
// cycle, so the sequential-judging rule is enforced by the UI's shape
// before the backend ever returns a 409.
import { Link } from "react-router-dom";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { getCurrentContest } from "../../api/contest";
import CycleOverview from "./CycleOverview";
import { PhaseStrip, useAsyncData } from "./contestShared";

export default function ContestConsolePage() {
  const { data, loading, error } = useAsyncData(getCurrentContest);

  return (
    <>
      <AdminPageHeader title="Contest Console" hideSearch />
      <div className="ct-page">
        <div className="ct-top-row">
          <h1 className="ct-title">Contest Console</h1>
          <Link className="ct-btn ct-btn--outline ct-btn--sm" to="/contest/history">
            Cycle history
          </Link>
        </div>

        {loading ? <p className="ct-loading">Loading the Contest console…</p> : null}
        {error ? (
          <p className="ct-error" role="alert">
            {error}
          </p>
        ) : null}

        {data && !data.cycle ? (
          <>
            <div className="ct-card">
              <div className="ct-card__head">
                <h2 className="ct-card__title">No cycle running</h2>
              </div>
              <p className="ct-note">
                No contest cycle has ever been created. Starting one opens week 1 for entries
                immediately.
              </p>
              <div className="ct-divider" />
              <PhaseStrip phase={null} />
              <p className="ct-note">cycle = null · phase = null — the only state where both are null</p>
              <div className="ct-action-row">
                <Link className="ct-btn ct-btn--primary" to="/contest/cycles/new">
                  Start a cycle
                </Link>
                <span className="ct-action-hint">Only one cycle can run at a time.</span>
              </div>
            </div>
            <div className="ct-callout">
              <span className="ct-callout__bar" aria-hidden />
              <p>
                How a cycle runs: create the cycle (three weekly rounds open) → judge week 1, then
                2, then 3, strictly in order → open the final → crown the monthly top 3, which closes
                the cycle. A cycle cannot be deleted once created.
              </p>
            </div>
          </>
        ) : null}

        {data && data.cycle ? (
          <CycleOverview
            data={{
              cycle: data.cycle,
              phase: data.phase ?? "vacant",
              rounds: data.rounds,
              weeklyWinners: data.weeklyWinners,
              monthlyStandings: data.monthlyStandings,
            }}
          />
        ) : null}
      </div>
    </>
  );
}
