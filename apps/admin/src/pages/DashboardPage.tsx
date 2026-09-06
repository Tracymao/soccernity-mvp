// Dashboard — Figma node 110:5.
//
// STUB: no `GET /admin/dashboard/stats` endpoint exists (Build Plan
// Section 4.8). Every metric, the visitor-statistics chart, and the
// Latest Posts table are reproduced structurally but carry no real data —
// the stat values render as "—" and the table is sample data.
import AdminStubScreen, { StubSection, StubTable } from "../components/stub/AdminStub";
import "./DashboardPage.css";

const STAT_CARDS = [
  { label: "New Users", sub: "This month" },
  { label: "Total Visits", sub: "All time" },
  { label: "Total Articles", sub: "Published" },
  { label: "Community Users", sub: "Registered" },
];

const LEAGUE_BREAKDOWN = ["Premier League", "La Liga", "NPFL", "Europa", "Bundesliga"];

const LATEST_POSTS: string[][] = [
  ["08/08/2022", "Zaha double helps Crystal Palace ease past Villa", "Premier League"],
  ["08/08/2022", "Late Barça winner sinks Sevilla", "La Liga"],
  ["08/08/2022", "Rangers edge Enyimba in Aba", "NPFL"],
];

export default function DashboardPage() {
  return (
    <AdminStubScreen
      title="Dashboard"
      banner={
        <>
          `GET /admin/dashboard/stats` is not built (Build Plan Section 4.8). The metrics, chart,
          and table below carry no real data.
        </>
      }
    >
      <div className="admin-dashboard__stats">
        {STAT_CARDS.map((c) => (
          <div key={c.label} className="admin-dashboard__stat">
            <span className="admin-dashboard__stat-value">—</span>
            <span className="admin-dashboard__stat-label">{c.label}</span>
            <span className="admin-dashboard__stat-sub">{c.sub}</span>
          </div>
        ))}
      </div>

      <StubSection title="New users by league">
        <p className="admin-stub__sample-caption">Sample — not real data</p>
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
          <p className="admin-stub__sample-caption">Sample — chart not wired to data</p>
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
    </AdminStubScreen>
  );
}
