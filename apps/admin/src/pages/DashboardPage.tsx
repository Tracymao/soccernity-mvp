// Dashboard — Figma node 110:5.
//
// Real data for three of the four stat cards: GET /admin/dashboard/stats
// (Build Plan Section 4.8, built by sprint-5/admin-users-dashboard-backend,
// AdminJwtAuthGuard only — reachable by every admin role). New Users
// (this calendar month), Total Articles (Published), and Community Users
// (Registered) are all real, computed server-side.
//
// Total Visits stays "—" — the backend's own response carries an
// explicit `totalVisits: null`, never a faked 0, because no page-view/
// visit-tracking model or middleware exists anywhere in this codebase
// (a Decision Log candidate, see admin-dashboard/README.md). The
// visitor-statistics chart and the "New users by league" breakdown are
// ALSO still sample/not-wired — a league concept doesn't exist on User
// at all, and Section 4.5's "Community Users" figure carries no per-
// league dimension; both remain out of this PR's scope, flagged rather
// than silently built as something they aren't.
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

export default function DashboardPage() {
  const { data, loading, error, reload } = useDashboardStats();

  const statCards = [
    { label: "New Users", sub: "This month", value: data?.newUsersThisMonth },
    { label: "Total Visits", sub: "All time", value: data?.totalVisits ?? undefined },
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
          <div className="admin-dashboard__chart" role="img" aria-label="Visitor statistics chart — not available">
            <p className="admin-stub__sample-caption">
              Sample — no page-view tracking exists anywhere in this codebase yet.
            </p>
            <div className="admin-dashboard__chart-bars">
              {[40, 65, 50, 80, 60].map((h, i) => (
                <span key={i} style={{ height: `${h}%` }} />
              ))}
            </div>
            <div className="admin-dashboard__chart-axis">
              <span>Jan</span>
              <span>Feb</span>
              <span>Mar</span>
              <span>Apr</span>
              <span>May</span>
            </div>
          </div>
        </StubSection>

        <StubSection title="Latest posts">
          <StubTable columns={["Date", "Title", "Category"]} rows={LATEST_POSTS} />
        </StubSection>
      </div>
    </>
  );
}
