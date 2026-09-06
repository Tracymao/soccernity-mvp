// Cycle History — GET /admin/contest/cycles (newest first, not paginated).
// Figma node 6277:16282. Each row shows per-week entry counts only; the
// running cycle links back to the console, a completed cycle to its
// read-only detail. `{ items: [] }` is only reachable when no cycle has
// ever existed — same situation the "No Cycle" console state covers.
import { Link } from "react-router-dom";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { listContestCycles } from "../../api/contest";
import { PHASE_LABEL, StatusPill, formatDate, useAsyncData } from "./contestShared";

function weekCounts(rounds: { weekNumber: number; entryCount: number }[]): string {
  const byWeek = new Map(rounds.map((r) => [r.weekNumber, r.entryCount]));
  return [1, 2, 3].map((w) => byWeek.get(w) ?? 0).join(" · ");
}

export default function ContestHistoryPage() {
  const { data, loading, error } = useAsyncData(listContestCycles);
  const items = data?.items ?? [];

  return (
    <>
      <AdminPageHeader title="Cycle History" hideSearch />
      <div className="ct-page">
        <div className="ct-back">
          <Link to="/contest">← Contest Console</Link>
        </div>
        <div className="ct-top-row">
          <h1 className="ct-title">Cycle History</h1>
        </div>

        {loading ? <p className="ct-loading">Loading cycle history…</p> : null}
        {error ? (
          <p className="ct-error" role="alert">
            {error}
          </p>
        ) : null}

        {data && items.length === 0 ? (
          <div className="ct-card">
            <h2 className="ct-card__title">No cycles yet</h2>
            <p className="ct-note">
              No contest cycle has ever been created.{" "}
              <Link className="ct-link" to="/contest/cycles/new">
                Start a cycle
              </Link>
              .
            </p>
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className="ct-table ct-history">
            <div className="ct-table__row ct-table__row--head">
              <span>Cycle</span>
              <span>Window</span>
              <span>Status</span>
              <span>Phase</span>
              <span>Entries W1·W2·W3</span>
              <span aria-hidden />
            </div>
            {items.map((item) => {
              const running = item.cycle.status === "active" || item.cycle.status === "final";
              return (
                <div className="ct-table__row" key={item.cycle.id}>
                  <span className="ct-cell--primary">{item.cycle.title}</span>
                  <span className="ct-cell--secondary">
                    {formatDate(item.cycle.startsAt)} — {formatDate(item.cycle.endsAt)}
                  </span>
                  <span>
                    <StatusPill value={item.cycle.status} />
                  </span>
                  <span className="ct-cell--primary">{PHASE_LABEL[item.phase]}</span>
                  <span className="ct-cell--secondary">{weekCounts(item.rounds)}</span>
                  <span>
                    {running ? (
                      <Link className="ct-link" to="/contest">
                        Open running cycle ›
                      </Link>
                    ) : (
                      <Link className="ct-link" to={`/contest/cycles/${item.cycle.id}`}>
                        View cycle ›
                      </Link>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="ct-callout">
          <span className="ct-callout__bar" aria-hidden />
          <p>
            Newest first, and not paginated — a cycle runs about once a month, so the whole history
            comes back in one call. This list shows entry counts per week only; opening a cycle
            loads its individual entries.
          </p>
        </div>
      </div>
    </>
  );
}
