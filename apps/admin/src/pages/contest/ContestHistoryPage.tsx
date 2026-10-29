// Cycle History -- GET /admin/contest/cycles (newest first, not paginated: a month runs about once a
// month). Figma: Cycle History 6645:22444, Empty 6645:22705, Load Error 6645:22922 (pass C, B-095).
// Each row shows the month, status, where it is now, entries per week and the outcome; every row opens
// its read-only detail.
import { Link } from "react-router";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { listContestCycles, type AdminContestCycleListItem } from "../../api/contest";
import { StatusPill, calendarLabel, monthLabel, useAsyncData } from "./contestShared";

function weekCounts(rounds: { weekNumber: number; entryCount: number }[]): string {
  const byWeek = new Map(rounds.map((r) => [r.weekNumber, r.entryCount]));
  return [1, 2, 3, 4].map((w) => byWeek.get(w) ?? 0).join(" · ");
}

function outcomeLabel(item: AdminContestCycleListItem): string {
  if (item.finalOutcome === "no_winner") return "No winner this month";
  if (item.finalOutcome === "no_final") return "No final";
  if (item.monthlyStandings.length > 0) return `Won by ${item.monthlyStandings[0].publicName}`;
  return "—";
}

export default function ContestHistoryPage() {
  const { data, loading, error, reload } = useAsyncData(listContestCycles);
  const items = data?.items ?? [];

  return (
    <>
      <AdminPageHeader title="Cycle History" hideSearch />
      <div className="ct-page">
        <div className="ct-back">
          <Link to="/contest">← Contest</Link>
        </div>
        <div className="ct-top-row">
          <h1 className="ct-title">Cycle History</h1>
        </div>

        {loading ? <p className="ct-loading">Loading cycle history…</p> : null}
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

        {data && items.length === 0 ? (
          <div className="ct-card">
            <h2 className="ct-card__title">No contests yet</h2>
            <p className="ct-note">
              No contest has ever been created.{" "}
              <Link className="ct-link" to="/contest/cycles/new">
                Create a contest
              </Link>
              .
            </p>
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className="ct-table ct-history">
            <div className="ct-table__row ct-table__row--head">
              <span>Contest</span>
              <span>Month</span>
              <span>Status</span>
              <span>Where it is</span>
              <span>Entries W1 · W2 · W3 · W4</span>
              <span>Outcome</span>
              <span aria-hidden />
            </div>
            {items.map((item) => (
              <div className="ct-table__row" key={item.cycle.id}>
                <span className="ct-cell--primary">{item.cycle.title}</span>
                <span className="ct-cell--secondary">{monthLabel(item.cycle.monthKey) || "—"}</span>
                <span>
                  <StatusPill value={item.cycle.status} />
                </span>
                <span className="ct-cell--primary">{calendarLabel(item.calendarState) || "—"}</span>
                <span className="ct-cell--secondary">{weekCounts(item.rounds)}</span>
                <span className="ct-cell--secondary">{outcomeLabel(item)}</span>
                <span>
                  <Link className="ct-link" to={`/contest/cycles/${item.cycle.id}`}>
                    View ›
                  </Link>
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="ct-callout">
          <span className="ct-callout__bar" aria-hidden />
          <p>
            Newest first. This list shows entry counts per week only; opening a contest loads its individual entries
            and tallies.
          </p>
        </div>
      </div>
    </>
  );
}
