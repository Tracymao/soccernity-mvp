// Moderation Queue — Figma node 5794:8635.
//
// Real data: GET /admin/moderation/reports (Build Plan Section 4.8,
// Decision Log #135/#189, built by sprint-5/admin-moderation-queue-backend).
// Two tabs, matching the real backend state machine rather than the old
// stub's static "Open Reports (6) / Appeals (2)" sample counts:
//   - "Open Reports"  -> status: 'open'     (reports awaiting a first action)
//   - "Appeals"       -> status: 'actioned' results, filtered client-side
//                        to appealStatus === 'pending' -- the backend has
//                        no dedicated appeals-only filter
//                        (list-reports-query.dto.ts only takes 'open' |
//                        'reviewed' | 'actioned').
//
// A "Review" link on each row opens the real Report Detail (open tab) or
// Appeal Review (appeals tab) screen, passing the row's own already-fetched
// Report via router `state` -- see api/moderation.ts's own Decision Log
// candidate #4 comment for why (no GET /reports/:id exists).
import { Link } from "react-router-dom";
import { useState } from "react";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { listReports, type Report } from "../../api/moderation";
import { targetLabel, useAsyncData } from "./moderationShared";
import "./moderation.css";

type Tab = "open" | "appeals";

function ReportRow({ report, tab }: { report: Report; tab: Tab }) {
  const reviewTo = tab === "open" ? `/moderation/reports/${report.id}` : `/moderation/appeals/${report.id}`;
  return (
    <div className="mod-table__row" key={report.id}>
      <span className="mod-cell--primary" title={report.targetId}>
        {report.targetId.slice(0, 8)}…
      </span>
      <span>{targetLabel(report.targetType)}</span>
      <span className="mod-cell--secondary mod-cell--truncate" title={report.reason}>
        {report.reason}
      </span>
      <span className="mod-cell--secondary" title={report.reporterId}>
        {report.reporterId.slice(0, 8)}…
      </span>
      <span>
        <span className={`mod-pill ${report.status === "open" ? "mod-pill--strong" : "mod-pill--soft"}`}>
          {report.status}
        </span>
      </span>
      <span>
        <Link className="mod-link" to={reviewTo} state={{ report }}>
          Review ›
        </Link>
      </span>
    </div>
  );
}

export default function ModerationQueuePage() {
  const [tab, setTab] = useState<Tab>("open");
  const backendStatus = tab === "open" ? "open" : "actioned";
  const { data, loading, error, reload } = useAsyncData(
    () => listReports({ status: backendStatus, limit: 50 }),
    [backendStatus],
  );

  // useAsyncData refetches (a fresh first page, extraItems reset) whenever
  // `backendStatus` changes, so `data.items` is always this tab's own
  // items -- `extraItems` only ever accumulates additional pages of the
  // SAME tab's fetch.
  const [extraItems, setExtraItems] = useState<Report[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const allItems = data ? [...data.items, ...extraItems] : [];
  const rows = tab === "open" ? allItems : allItems.filter((r) => r.appealStatus === "pending");

  const effectiveCursor = extraItems.length > 0 ? cursor : data?.nextCursor ?? null;

  async function loadMore() {
    if (!effectiveCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listReports({ status: backendStatus, cursor: effectiveCursor, limit: 50 });
      setExtraItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  function switchTab(next: Tab) {
    setTab(next);
    setExtraItems([]);
    setCursor(null);
  }

  return (
    <>
      <AdminPageHeader title="Moderation Queue" hideSearch />
      <div className="mod-page">
        <div className="mod-tabs">
          <button
            type="button"
            className={`mod-tab ${tab === "open" ? "mod-tab--active" : ""}`}
            onClick={() => switchTab("open")}
          >
            Open Reports
          </button>
          <button
            type="button"
            className={`mod-tab ${tab === "appeals" ? "mod-tab--active" : ""}`}
            onClick={() => switchTab("appeals")}
          >
            Appeals
          </button>
        </div>

        <p className="mod-note">
          Appeals are reviewed by a <strong>different</strong> admin or moderator than the one who
          made the original decision (Decision Log #138). Both the reporter and the reported user
          are notified of the outcome (Build Plan Section 8.4).
        </p>

        {loading ? <p className="mod-loading">Loading the moderation queue…</p> : null}
        {error ? (
          <p className="mod-error" role="alert">
            {error}{" "}
            <button type="button" className="mod-link" onClick={reload}>
              Retry
            </button>
          </p>
        ) : null}

        {!loading && !error && rows.length === 0 ? (
          <div className="mod-card">
            <h2 className="mod-card__title">
              {tab === "open" ? "No open reports" : "No pending appeals"}
            </h2>
            <p className="mod-note">
              {tab === "open"
                ? "Nothing is currently waiting for a first decision."
                : "No actioned report currently has a pending appeal."}
            </p>
          </div>
        ) : null}

        {rows.length > 0 ? (
          <div className="mod-table">
            <div className="mod-table__row mod-table__row--head">
              <span>Reported</span>
              <span>Type</span>
              <span>Reason</span>
              <span>Reporter</span>
              <span>Status</span>
              <span aria-hidden />
            </div>
            {rows.map((r) => (
              <ReportRow key={r.id} report={r} tab={tab} />
            ))}
          </div>
        ) : null}

        {effectiveCursor && !loading ? (
          <button type="button" className="mod-btn mod-btn--outline mod-btn--sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        ) : null}

        <div className="mod-callout">
          <span className="mod-callout__bar" aria-hidden />
          <p>
            Reported content and the reporter are shown by id — the queue endpoint
            (<code>GET /admin/moderation/reports</code>) doesn&rsquo;t return a display name or a
            content preview, only the raw <code>Report</code> row. A future pass could join in
            reporter/author names; flagged, not built here.
          </p>
        </div>
        <div className="mod-callout">
          <span className="mod-callout__bar" aria-hidden />
          <p>
            Recording an action on a report does not by itself enforce it — there is no
            content-removal or account-suspension mechanism wired up yet (Build Plan Section 4.8).
            Actioning a report only records the decision and notifies both parties.
          </p>
        </div>
      </div>
    </>
  );
}
