// Articles list — Figma node 123:56.
//
// Real data: GET /admin/articles (Build Plan Section 4.8, built by
// sprint-5/admin-articles-categories-backend). AdminRolesGuard('editor',
// 'superadmin') on the whole endpoint — a moderator gets a real 403, so
// this screen is only reachable by an editor/superadmin token.
//
// This screen only ever lists articles (GET) — PATCH /admin/articles/:id
// (publish/unpublish) has no UI action here, per this PR's own scope
// (neither this screen's Figma design nor the task brief calls for a
// publish toggle) — see api/adminContent.ts's own comment on
// updateArticle.
import { Link } from "react-router-dom";
import { useState } from "react";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { listArticles, type ArticleListItem, type ArticleStatus } from "../../api/adminContent";
import { formatDate, useAsyncData } from "../content/adminContentShared";
import "../content/content.css";

function ArticleRow({ article }: { article: ArticleListItem }) {
  return (
    <div className="ac-table__row" key={article.id}>
      <span className="ac-cell--secondary">{formatDate(article.createdAt)}</span>
      <span className="ac-cell--primary ac-cell--truncate" title={article.title}>
        {article.title}
      </span>
      <span className="ac-cell--secondary">{article.category.name}</span>
      <span>
        <span className={`ac-pill ${article.status === "published" ? "ac-pill--strong" : "ac-pill--soft"}`}>
          {article.status}
        </span>
      </span>
    </div>
  );
}

export default function ArticlesPage() {
  const [status, setStatus] = useState<ArticleStatus | "all">("all");
  const filter = status === "all" ? undefined : status;
  const { data, loading, error, reload } = useAsyncData(() => listArticles({ status: filter, limit: 50 }), [filter]);

  const [extraItems, setExtraItems] = useState<ArticleListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const items = data ? [...data.items, ...extraItems] : [];
  const effectiveCursor = extraItems.length > 0 ? cursor : data?.nextCursor ?? null;

  async function loadMore() {
    if (!effectiveCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listArticles({ status: filter, cursor: effectiveCursor, limit: 50 });
      setExtraItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  function switchFilter(next: ArticleStatus | "all") {
    setStatus(next);
    setExtraItems([]);
    setCursor(null);
  }

  return (
    <>
      <AdminPageHeader title="Articles" hideSearch />
      <div className="ac-page">
        <div className="ac-action-row">
          <div className="ac-tabs">
            <button
              type="button"
              className={`ac-tab ${status === "all" ? "ac-tab--active" : ""}`}
              onClick={() => switchFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              className={`ac-tab ${status === "draft" ? "ac-tab--active" : ""}`}
              onClick={() => switchFilter("draft")}
            >
              Draft
            </button>
            <button
              type="button"
              className={`ac-tab ${status === "published" ? "ac-tab--active" : ""}`}
              onClick={() => switchFilter("published")}
            >
              Published
            </button>
          </div>
          <Link to="/articles/new" className="ac-btn ac-btn--primary">
            Create Article
          </Link>
        </div>

        {loading ? <p className="ac-loading">Loading articles…</p> : null}
        {error ? (
          <p className="ac-error" role="alert">
            {error}{" "}
            <button type="button" className="ac-link" onClick={reload}>
              Retry
            </button>
          </p>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <div className="ac-card">
            <h2 className="ac-card__title">No articles yet</h2>
            <p className="ac-note">Create the first one to get started.</p>
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className="ac-table">
            <div className="ac-table__row ac-table__row--head">
              <span>Date</span>
              <span>Title</span>
              <span>Category</span>
              <span>Status</span>
            </div>
            {items.map((a) => (
              <ArticleRow key={a.id} article={a} />
            ))}
          </div>
        ) : null}

        {effectiveCursor && !loading ? (
          <button type="button" className="ac-btn ac-btn--outline ac-btn--sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        ) : null}
      </div>
    </>
  );
}
