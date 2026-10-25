// The Contest page of the admin console: the running (or latest) contest month, read-only.
// Figma: Overview -- Running 6644:22559, Overview -- Final 6644:22852, Overview -- No Contest 6644:23174,
// Overview -- Load Error 6644:23391 (pass C, B-095; build register B-097).
//
// GET /admin/contest/current resolves the running month, or the most recently completed one, so the page
// never goes blank after a month ends. There is nothing to judge, open or crown: the month runs itself.
// The only actions are create a contest, edit the contest (within the locking rules), cycle history and
// the finalist impressions view.
import { Link } from "react-router-dom";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { getCurrentContest } from "../../api/contest";
import CycleOverview from "./CycleOverview";
import { useAsyncData } from "./contestShared";

export default function ContestConsolePage() {
  const { data, loading, error, reload } = useAsyncData(getCurrentContest);

  return (
    <>
      <AdminPageHeader title="Contest" hideSearch />
      <div className="ct-page">
        <div className="ct-top-row">
          <h1 className="ct-title">{data?.cycle ? data.cycle.title : "Contest"}</h1>
          <div className="ct-top-actions">
            {data?.cycle ? (
              <>
                <Link className="ct-btn ct-btn--outline ct-btn--sm" to={`/contest/cycles/${data.cycle.id}/edit`}>
                  Edit contest
                </Link>
                <Link className="ct-btn ct-btn--outline ct-btn--sm" to="/contest/impressions">
                  Finalist impressions
                </Link>
              </>
            ) : null}
            <Link className="ct-btn ct-btn--outline ct-btn--sm" to="/contest/history">
              Cycle history
            </Link>
            <Link className="ct-btn ct-btn--primary ct-btn--sm" to="/contest/cycles/new">
              Create a contest
            </Link>
          </div>
        </div>

        {loading ? <p className="ct-loading">Loading the Contest…</p> : null}
        {error ? (
          <div className="ct-callout ct-callout--alert" role="alert">
            <span className="ct-callout__bar" aria-hidden />
            <p>
              {error}{" "}
              <button type="button" className="ct-link ct-link--button" onClick={reload}>
                Try again
              </button>
            </p>
          </div>
        ) : null}

        {data && !data.cycle ? (
          <div className="ct-card">
            <div className="ct-card__head">
              <h2 className="ct-card__title">No contest yet</h2>
            </div>
            <p className="ct-note">
              No contest has ever been created. A contest is a calendar month: create it before the month starts and
              it runs itself from 08:00 on day 1.
            </p>
            <div className="ct-action-row">
              <Link className="ct-btn ct-btn--primary" to="/contest/cycles/new">
                Create a contest
              </Link>
            </div>
          </div>
        ) : null}

        {data && data.cycle ? <CycleOverview data={{ ...data, cycle: data.cycle }} /> : null}
      </div>
    </>
  );
}
