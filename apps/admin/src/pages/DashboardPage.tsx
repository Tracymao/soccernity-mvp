// Dashboard — Figma node 110:5.
//
// Real data: GET /admin/dashboard/stats (Build Plan Section 4.8, AdminJwtAuthGuard
// only — reachable by every admin role). New Users (this calendar month),
// Total Visits (all time), Total Articles (Published), Community Users
// (Registered), and the visitor-statistics chart (the last 6 UTC months of
// anonymous page views) are all real, computed server-side.
//
// Still sample / not wired: the "New users by league" breakdown — a league
// concept doesn't exist on User at all (blocked on Decision Log #6) — and the
// "Latest posts" table, neither of which is in the stats endpoint's contract.
import { useEffect, useState } from "react";
import AdminPageHeader from "../layout/AdminPageHeader";
import { AdminApiError } from "../api/adminClient";
import { getDashboardStats, type AdminDashboardStats } from "../api/adminDashboard";
import { StubSection, StubTable } from "../components/stub/AdminStub";
import "./DashboardPage.css";

const LEAGUE_BREAKDOWN = ["Premier League", "La Liga", "NPFL", "Europa", "Bundesliga"];

const LATEST_POSTS: string[][] = [
  ["08/08/2022", "Zaha double helps Crystal Palace ease past Villa", "Premier League"],
  ["08/08/2022", "Late Barça winner sinks Sevilla", "La Liga"],
  ["08/08/2022", "Rangers edge Enyimba in Aba", "NPFL"],
];

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "YYYY-MM" → "Jan". Pure string parsing, no Date, so the label is the same
// regardless of the viewer's timezone.
function monthLabel(month: string): string {
  const index = Number(month.slice(5, 7)) - 1;
  return MONTH_NAMES[index] ?? month;
}

function useDashboardStats() {
  const [data, setData] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDashboardStats()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof AdminApiError ? err.message : "Couldn't load dashboard stats.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { data, loading, error, reload: () => setNonce((n) => n + 1) };
}

function VisitorChart({ series }: { series: AdminDashboardStats["visitsByMonth"] }) {
  const max = series.reduce((m, p) => Math.max(m, p.count), 0);
  const summary = series.map((p) => `${monthLabel(p.month)} ${p.count}`).join(", ");

  return (
    <div className="admin-dashboard__chart" role="img" aria-label={`Page views by month: ${summary}`}>
      <div className="admin-dashboard__chart-bars" aria-hidden>
        {series.map((p) => (
          <div key={p.month} className="admin-dashboard__chart-col">
            <span className="admin-dashboard__chart-count">{p.count}</span>
            <span
              className="admin-dashboard__chart-bar"
              style={{ height: max > 0 ? `${Math.round((p.count / max) * 100)}%` : "0%" }}
            />
          </div>
        ))}
      </div>
      <div className="admin-dashboard__chart-axis" aria-hidden>
        {series.map((p) => (
          <span key={p.month}>{monthLabel(p.month)}</span>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, loading, error, reload } = useDashboardStats();

  const statCards = [
    { label: "New Users", sub: "This month", value: data?.newUsersThisMonth },
    { label: "Total Visits", sub: "All time", value: data?.totalVisits },
    { label: "Total Articles", sub: "Published", value: data?.totalArticlesPublished },
    { label: "Community Users", sub: "Registered", value: data?.communityUsersTotal },
  ];

  return (
    <>
      <AdminPageHeader title="Dashboard" hideSearch />
      <div className="admin-stub__body">
        {error ? (
          <p className="admin-dashboard__error" role="alert">
            {error}{" "}
            <button type="button" className="admin-dashboard__error-retry" onClick={reload}>
              Retry
            </button>
          </p>
        ) : null}

        <div className="admin-dashboard__stats">
          {statCards.map((c) => (
            <div key={c.label} className="admin-dashboard__stat">
              <span className="admin-dashboard__stat-value">
                {loading ? "…" : c.value === undefined || c.value === null ? "—" : c.value}
              </span>
              <span className="admin-dashboard__stat-label">{c.label}</span>
              <span className="admin-dashboard__stat-sub">{c.sub}</span>
            </div>
          ))}
        </div>

        <StubSection title="New users by league">
          <p className="admin-stub__sample-caption">
            Sample — not real data. No league concept exists on User; blocked on Decision Log #6.
          </p>
          <ul className="admin-dashboard__breakdown">
            {LEAGUE_BREAKDOWN.map((l) => (
              <li key={l}>
                <span>{l}</span>
                <span aria-hidden>—</span>
              </li>
            ))}
          </ul>
        </StubSection>

        <StubSection title="Visitor statistics">
          {data ? (
            <VisitorChart series={data.visitsByMonth} />
          ) : (
            <p className="admin-stub__sample-caption">{loading ? "Loading…" : "No data yet."}</p>
          )}
        </StubSection>

        <StubSection title="Latest posts">
          <StubTable columns={["Date", "Title", "Category"]} rows={LATEST_POSTS} />
        </StubSection>
      </div>
    </>
  );
}
