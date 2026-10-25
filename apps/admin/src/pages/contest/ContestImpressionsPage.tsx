// Finalist impressions -- the week-4 exposure view. Figma pass C (B-095): finalist impression view,
// settings validation, load error.
//
// The balanced-impression engine that produces impression counts does not exist yet (build register
// B-092), so this screen shows what is real -- the stored exposure settings for the running contest --
// and says plainly that impression counts will appear here once the engine is built. The settings can be
// edited on the contest's Edit screen (they lock when week 4 starts).
import { Link } from "react-router-dom";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { getCurrentContest } from "../../api/contest";
import { monthLabel, useAsyncData } from "./contestShared";

export default function ContestImpressionsPage() {
  const { data, loading, error, reload } = useAsyncData(getCurrentContest);
  const cycle = data?.cycle ?? null;
  const settings = data?.settings ?? null;
  const finalists = data?.finalists ?? [];

  return (
    <>
      <AdminPageHeader title="Finalist impressions" hideSearch />
      <div className="ct-page">
        <div className="ct-back">
          <Link to="/contest">← Back to console</Link>
        </div>
        <div className="ct-top-row">
          <h1 className="ct-title">Finalist impressions</h1>
          {cycle ? (
            <div className="ct-top-actions">
              <Link className="ct-btn ct-btn--outline ct-btn--sm" to={`/contest/cycles/${cycle.id}/edit`}>
                Edit settings
              </Link>
            </div>
          ) : null}
        </div>

        {loading ? <p className="ct-loading">Loading…</p> : null}
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

        {data && !cycle ? (
          <div className="ct-card">
            <h2 className="ct-card__title">No contest yet</h2>
            <p className="ct-note">There is no contest to show impressions for.</p>
          </div>
        ) : null}

        {cycle && settings ? (
          <>
            <div className="ct-card">
              <div className="ct-card__head">
                <h2 className="ct-card__title">{cycle.monthKey ? `${monthLabel(cycle.monthKey)} · week 4` : "Week 4"}</h2>
              </div>
              <div className="ct-settings">
                <div>
                  <span className="ct-settings__label">Exposure tolerance</span>
                  <strong>{settings.exposureTolerancePercent}%</strong>
                </div>
                <div>
                  <span className="ct-settings__label">Views per viewer per day</span>
                  <strong>{settings.exposureViewerDailyCap}</strong>
                </div>
                <div>
                  <span className="ct-settings__label">Finalists</span>
                  <strong>{finalists.length}</strong>
                </div>
              </div>
            </div>

            <div className="ct-callout" data-testid="ct-impressions-pending">
              <span className="ct-callout__bar" aria-hidden />
              <p>
                Impression counts per finalist are not available yet. They will appear here once the balanced
                exposure for week 4 is running. The tolerance and the daily cap above are stored now and lock when
                week 4 starts.
              </p>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
