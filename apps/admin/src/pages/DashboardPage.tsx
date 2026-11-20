// Dashboard — Figma node 110:5, superseded by the W8 frames (B-056, Decision
// Log #472): Default 6990:56075, Latest posts loading 6990:56299, empty
// 6990:56357, load error 6990:56415.
//
// Real data: GET /admin/dashboard/stats (Build Plan Section 4.8, AdminJwtAuthGuard
// only — reachable by every admin role) for Total Visits (all time), Total
// Articles (Published), Community Users (Registered), New This Month and the
// visitor-statistics chart (the last 6 UTC months of anonymous page views);
// and GET /admin/dashboard/latest-posts for the Latest posts table (its own
// loading, empty and error states, independent of the stats request).
//
// "New users by league" is gone: a league concept doesn't exist on User.
import { useEffect, useState } from "react";
import AdminPageHeader from "../layout/AdminPageHeader";
import { AdminApiError } from "../api/adminClient";
import {
  getDashboardStats,
  getLatestPosts,
  type AdminDashboardStats,
  type AdminLatestPost,
} from "../api/adminDashboard";
import "./DashboardPage.css";

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

// "2026-11-05T10:00:00.000Z" → "05/11/2026". UTC parts, no locale formatting,
// so the label is the same for every viewer and timezone (the frame's format
// is DD/MM/YYYY).
function postDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

function useLatestPosts() {
  const [posts, setPosts] = useState<AdminLatestPost[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    getLatestPosts()
      .then((res) => {
        if (!cancelled) setPosts(res);
      })
      .catch(() => {
        // Never show the server's text here: the frame has one fixed line.
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { posts, loading, failed, reload: () => setNonce((n) => n + 1) };
}

const POST_COLUMNS = ["Date", "Media", "Post", "Author", "Likes", "Comments"];

function LatestPostsCard() {
  const { posts, loading, failed, reload } = useLatestPosts();

  return (
    <section className="admin-dashboard__card" aria-labelledby="admin-dashboard-latest-title">
      <div className="admin-dashboard__card-head">
        <h2 id="admin-dashboard-latest-title" className="admin-dashboard__card-title">
          Latest posts
        </h2>
        {!failed && !loading && posts && posts.length > 0 ? (
          <span className="admin-dashboard__caption">Newest first</span>
        ) : null}
      </div>

      {failed ? (
        <div className="admin-dashboard__banner" role="alert">
          <span className="admin-dashboard__banner-bar" aria-hidden />
          <div className="admin-dashboard__banner-text">
            <strong>Couldn’t load the latest posts</strong>
            <span>Check the connection and try again.</span>
          </div>
          <button type="button" className="admin-dashboard__banner-action" onClick={reload}>
            Try again
          </button>
        </div>
      ) : loading ? (
        <div className="admin-dashboard__posts-skeleton" aria-busy="true">
          <div className="admin-dashboard__posts-head" aria-hidden>
            {POST_COLUMNS.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <p className="admin-dashboard__sr-only" role="status">
            Loading the latest posts…
          </p>
          {[0, 1, 2, 3, 4].map((n) => (
            <div key={n} className="admin-dashboard__posts-row" aria-hidden>
              <span className="admin-dashboard__skeleton" />
              <span className="admin-dashboard__skeleton" />
              <span className="admin-dashboard__skeleton admin-dashboard__skeleton--wide" />
              <span className="admin-dashboard__skeleton" />
              <span className="admin-dashboard__skeleton admin-dashboard__skeleton--narrow" />
              <span className="admin-dashboard__skeleton admin-dashboard__skeleton--narrow" />
            </div>
          ))}
        </div>
      ) : posts && posts.length === 0 ? (
        <div className="admin-dashboard__empty">
          <strong>No posts yet</strong>
          <span>Posts that people share will appear here.</span>
        </div>
      ) : posts ? (
        <table className="admin-dashboard__posts">
          <thead>
            <tr>
              {POST_COLUMNS.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id}>
                <td>{postDate(post.createdAt)}</td>
                <td>
                  {post.mediaType ? (
                    <span className="admin-dashboard__media-tag">
                      {post.mediaType === "video" ? "Video" : "Photo"}
                    </span>
                  ) : (
                    <span className="admin-dashboard__muted" aria-label="No media">
                      —
                    </span>
                  )}
                </td>
                <td className="admin-dashboard__post-text">
                  <span>{post.excerpt}</span>
                </td>
                <td>{post.author.publicName}</td>
                <td>{post.likeCount}</td>
                <td>{post.commentCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

export default function DashboardPage() {
  const { data, loading, error, reload } = useDashboardStats();

  // Order and labels as drawn in the W8 frame (the old duplicate tile is gone).
  const statCards = [
    { label: "Total Visits", value: data?.totalVisits },
    { label: "Total Articles", value: data?.totalArticlesPublished },
    { label: "Community Users", value: data?.communityUsersTotal },
    { label: "New This Month", value: data?.newUsersThisMonth },
  ];

  return (
    <>
      <AdminPageHeader title="Dashboard" />
      <div className="admin-dashboard">
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
            </div>
          ))}
        </div>

        <section className="admin-dashboard__card" aria-labelledby="admin-dashboard-visitors-title">
          <div className="admin-dashboard__card-head">
            <h2 id="admin-dashboard-visitors-title" className="admin-dashboard__card-title">
              Visitor statistics
            </h2>
          </div>
          {data ? (
            <VisitorChart series={data.visitsByMonth} />
          ) : (
            <p className="admin-dashboard__muted-line">{loading ? "Loading…" : "No data yet."}</p>
          )}
        </section>

        <LatestPostsCard />
      </div>
    </>
  );
}
