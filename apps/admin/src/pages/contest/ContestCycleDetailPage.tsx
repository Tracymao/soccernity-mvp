// Read-only detail for a past (or any) contest month: the "View" target from Cycle History
// (GET /admin/contest/cycles/:id). A 404 renders an honest not-found state, never a crash.
import { Link, useParams } from "react-router-dom";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { getContestCycle } from "../../api/contest";
import CycleOverview from "./CycleOverview";
import { useAsyncData } from "./contestShared";

export default function ContestCycleDetailPage() {
  const { id = "" } = useParams();
  const { data, loading, error, errorStatus } = useAsyncData(() => getContestCycle(id), [id]);

  const notFound = errorStatus === 404;

  return (
    <>
      <AdminPageHeader title="Contest" hideSearch />
      <div className="ct-page">
        <div className="ct-back">
          <Link to="/contest">← Contest</Link>
        </div>
        <div className="ct-top-row">
          <h1 className="ct-title">{data ? data.cycle.title : "Contest"}</h1>
          <div className="ct-top-actions">
            {data ? (
              <Link className="ct-btn ct-btn--outline ct-btn--sm" to={`/contest/cycles/${data.cycle.id}/edit`}>
                Edit contest
              </Link>
            ) : null}
            <Link className="ct-btn ct-btn--outline ct-btn--sm" to="/contest/history">
              Cycle history
            </Link>
          </div>
        </div>

        {loading ? <p className="ct-loading">Loading the contest…</p> : null}

        {notFound ? (
          <div className="ct-card">
            <h2 className="ct-card__title">Contest not found</h2>
            <p className="ct-note">No contest matches that id. It may never have existed.</p>
            <div className="ct-action-row">
              <Link className="ct-btn ct-btn--primary" to="/contest/history">
                Back to Cycle history
              </Link>
            </div>
          </div>
        ) : error ? (
          <p className="ct-error" role="alert">
            {error}
          </p>
        ) : null}

        {data ? <CycleOverview data={data} /> : null}
      </div>
    </>
  );
}
