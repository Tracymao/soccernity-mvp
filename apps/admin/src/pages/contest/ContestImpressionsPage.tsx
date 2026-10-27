// Finalist impressions -- the Week-4 impression-distribution view (build register B-092 / B-095;
// Decision Log #388, #402 item 6, #405 item 7; docs/contest-spec.md sections 4a, 10b). Figma pass C
// frames 6646:22745 (list, 9 finalists, one outside tolerance), 6646:23097 (fewer than 9), 6646:23419
// (before the reveal), 6646:23765 (no finalists), 6646:24345 (load error), and pass O's
// 6838:29547 (settings locked once week 4 has started).
//
// Data: `GET /admin/contest/current` for the cycle, the calendar and the week-4 settings (and which of
// them can still change), then `GET /admin/contest/cycles/:id/exposure` for the distribution. The
// distribution is AGGREGATES ONLY: impressions per finalist video, the mean, the tolerance band and
// the spread. No endpoint returns, and nothing here can show, who saw a video (no viewer id, no
// timestamps, no per-viewer cap usage).
//
// What the numbers mean (spec 10b): a tile counts as one impression when at least half of it has been
// in view for at least one continuous second; a viewer can add at most the per-viewer daily cap per
// video per day. The tolerance flags a video whose total is more than that percentage of the mean
// away from the mean, in EITHER direction (a video far behind is as much a fairness problem as one far
// ahead). After the crown the per-viewer rows no longer exist and the figures are the totals kept on
// each entry ("Final totals").
//
// SETTINGS: tolerance and the per-viewer daily cap are week-4 settings. They are edited on the contest's
// Edit screen (one editing path, with its validation), and lock when week 4 starts (day 22); this page
// shows them read-only and says so once locked (pass O 6838:29547). The Figma frames draw an inline
// "Save settings" form instead; the Edit link replaces it so the validation and the field locking
// live in one place.
import { Link } from "react-router-dom";
import AdminPageHeader from "../../layout/AdminPageHeader";
import {
  getContestExposure,
  getCurrentContest,
  type AdminCurrentContest,
  type AdminExposureEntry,
  type AdminExposureResponse,
} from "../../api/contest";
import { formatDateTime, monthLabel, useAsyncData } from "./contestShared";

interface Loaded {
  contest: AdminCurrentContest;
  exposure: AdminExposureResponse | null;
}

async function load(): Promise<Loaded> {
  const contest = await getCurrentContest();
  if (!contest.cycle) return { contest, exposure: null };
  return { contest, exposure: await getContestExposure(contest.cycle.id) };
}

const NUMBER = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

function count(value: number): string {
  return NUMBER.format(value);
}

function deviation(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${NUMBER.format(Math.abs(value))}%`;
}

function statusLabel(entry: AdminExposureEntry, started: boolean): string {
  if (!entry.inRotation) return "Not in rotation";
  if (entry.status === "within") return "Within tolerance";
  if (entry.status === "above" || entry.status === "below") return "Outside tolerance";
  return started ? "Within tolerance" : "No impressions yet";
}

export default function ContestImpressionsPage() {
  const { data, loading, error, reload } = useAsyncData(load);
  const contest = data?.contest ?? null;
  const exposure = data?.exposure ?? null;
  const cycle = contest?.cycle ?? null;
  const settings = contest?.settings ?? null;

  const revealsAt =
    contest?.calendarState?.kind === "final_upload" ? contest.calendarState.revealsAt : null;
  const noFinalists = !!exposure && exposure.finalistCount === 0;
  const beforeReveal = !!exposure && !exposure.revealed && !noFinalists;
  const locked = !!contest?.editable && contest.editable.exposureTolerancePercent === false;

  const pill = !exposure
    ? null
    : noFinalists
      ? "No final"
      : exposure.source === "final_totals"
        ? "Final totals"
        : exposure.live
          ? "Live from reveal"
          : revealsAt
            ? `Reveals ${formatDateTime(revealsAt)}`
            : "Before the reveal";

  const max = exposure ? Math.max(1, ...exposure.entries.map((e) => e.impressions)) : 1;
  const hasMean = !!exposure && exposure.revealed && exposure.finalistCount > 0;

  return (
    <>
      <AdminPageHeader title="Finalist impressions" hideSearch />
      <div className="ct-page">
        <div className="ct-back">
          <Link to="/contest">← Back to console</Link>
        </div>
        <div className="ct-top-row">
          <h1 className="ct-title">Finalist impressions</h1>
          {cycle?.monthKey ? <span className="ct-pill ct-pill--soft ct-pill--natural">{monthLabel(cycle.monthKey)} · Week 4 final</span> : null}
          {pill ? <span className="ct-pill ct-pill--outline ct-pill--natural">{pill}</span> : null}
          {cycle ? (
            <div className="ct-top-actions">
              <Link className="ct-btn ct-btn--outline ct-btn--sm" to="/contest">
                Back to overview
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

        {noFinalists ? (
          <div className="ct-card ct-card--center" data-testid="ct-impressions-none">
            <h2 className="ct-card__title">No finalists this month</h2>
            <p className="ct-note">
              No weekly winners went through, so there is no final and no impression distribution to show.
            </p>
          </div>
        ) : null}

        {exposure && !noFinalists ? (
          <>
            <div className="ct-stats">
              <div className="ct-stat">
                <span className="ct-settings__label">Finalists</span>
                <strong>{exposure.finalistCount}</strong>
              </div>
              <div className="ct-stat">
                <span className="ct-settings__label">Mean impressions</span>
                <strong data-testid="ct-imp-mean">{hasMean ? count(exposure.mean) : "—"}</strong>
              </div>
              <div className="ct-stat">
                <span className="ct-settings__label">Tolerance band</span>
                <strong data-testid="ct-imp-band">
                  {hasMean ? `${count(exposure.lowerBound)} – ${count(exposure.upperBound)}` : "—"}
                </strong>
              </div>
              <div className="ct-stat">
                <span className="ct-settings__label">Outside tolerance</span>
                <strong data-testid="ct-imp-outside">{hasMean ? exposure.outsideTolerance : "—"}</strong>
              </div>
            </div>

            {beforeReveal ? (
              <div className="ct-callout" data-testid="ct-impressions-before-reveal">
                <span className="ct-callout__bar" aria-hidden />
                <p>
                  Finalist videos are hidden until the reveal{revealsAt ? ` at ${formatDateTime(revealsAt)}` : ""}.
                  Impressions start counting from the reveal, so there is nothing to compare yet.
                </p>
              </div>
            ) : null}

            <div className="ct-table ct-imp" data-testid="ct-impressions-table">
              <div className="ct-table__row ct-table__row--head">
                <span>Finalist</span>
                <span>Impressions</span>
                <span>Distribution</span>
                <span>Vs mean</span>
                <span>Status</span>
              </div>
              {exposure.entries.map((entry) => {
                const outside = entry.status === "above" || entry.status === "below";
                return (
                  <div key={entry.entryId} className="ct-table__row" data-testid="ct-impressions-row">
                    <span className="ct-cell--primary">{entry.finalist.publicName}</span>
                    <span>{hasMean ? count(entry.impressions) : "—"}</span>
                    <span className="ct-bar" aria-hidden={hasMean ? undefined : true}>
                      {hasMean ? (
                        <span
                          className={outside ? "ct-bar__fill ct-bar__fill--outside" : "ct-bar__fill"}
                          style={{ width: `${Math.round((entry.impressions / max) * 100)}%` }}
                        />
                      ) : (
                        "—"
                      )}
                    </span>
                    <span>{hasMean ? deviation(entry.deviationPercent) : "—"}</span>
                    <span>
                      <span
                        className={outside ? "ct-pill ct-pill--strong ct-pill--natural" : "ct-pill ct-pill--outline ct-pill--natural"}
                        title={entry.status === "above" ? "Above the band" : entry.status === "below" ? "Below the band" : undefined}
                      >
                        {hasMean ? statusLabel(entry, true) : "No impressions yet"}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>

            {hasMean ? (
              <p className="ct-footnote" data-testid="ct-impressions-method">
                How impressions are counted: a finalist tile counts as one impression when at least half of it is in
                view for at least one second. Figures are totals per finalist video; no per-viewer data is shown.
                {exposure.source === "final_totals" ? " The contest has been crowned, so these are the final totals." : ""}
              </p>
            ) : null}
          </>
        ) : null}

        {cycle && settings && !noFinalists ? (
          <div className="ct-card" data-testid="ct-impressions-settings">
            <div className="ct-card__head">
              <h2 className="ct-card__title">{locked ? "Distribution settings · locked" : "Distribution settings"}</h2>
              {!locked ? (
                <Link className="ct-btn ct-btn--outline ct-btn--sm" to={`/contest/cycles/${cycle.id}/edit`}>
                  Edit settings
                </Link>
              ) : null}
            </div>
            {locked ? (
              <div className="ct-callout" data-testid="ct-impressions-locked">
                <span className="ct-callout__bar" aria-hidden />
                <p>
                  Locked since 08:00 on day 22. Tolerance and the per-viewer daily cap are week-4 settings and cannot
                  be changed once week 4 starts.
                </p>
              </div>
            ) : null}
            <div className="ct-settings">
              <div>
                <span className="ct-settings__label">Tolerance</span>
                <strong>{settings.exposureTolerancePercent}% of the mean</strong>
              </div>
              <div>
                <span className="ct-settings__label">Per-viewer daily cap</span>
                <strong>{settings.exposureViewerDailyCap} times per day</strong>
              </div>
            </div>
            <p className="ct-footnote">
              Finalist videos should stay within this percentage of the mean impressions across live finalist videos.
              The cap is the most times one viewer sees a given finalist video in a day.
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}
