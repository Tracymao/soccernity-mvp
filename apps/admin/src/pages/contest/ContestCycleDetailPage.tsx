// Read-only detail for a past cycle — the "View cycle ›" target from
// Cycle History. A read-only variant of the console hub
// (GET /admin/contest/cycles/:id). 404 renders an honest not-found state,
// never a crash.
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
      <AdminPageHeader title="Contest cycle" hideSearch />
      <div className="ct-page">
        <div className="ct-back">
          <Link to="/contest">← Contest Console</Link>
        </div>
        <div className="ct-top-row">
          <h1 className="ct-title">{data ? data.cycle.title : "Contest cycle"}</h1>
          <Link className="ct-btn ct-btn--outline ct-btn--sm" to="/contest/history">
            Cycle history
          </Link>
        </div>

        {loading ? <p className="ct-loading">Loading the cycle…</p> : null}

        {notFound ? (
          <div className="ct-card">
            <h2 className="ct-card__title">Cycle not found</h2>
            <p className="ct-note">
              No contest cycle matches that id. It may have never existed.
            </p>
            <div className="ct-action-row">
              <Link className="ct-btn ct-btn--primary" to="/contest/history">
                Back to Cycle history
              </Link>
            </div>
          </div>
        ) : error && !notFound ? (
          <p className="ct-error" role="alert">
            {error}
          </p>
        ) : null}

        {data ? <CycleOverview data={data} readOnly /> : null}
      </div>
    </>
  );
}
