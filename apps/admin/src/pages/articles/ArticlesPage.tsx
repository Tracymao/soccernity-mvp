// Articles list — Figma node 123:56.
//
// Real data: GET/PATCH /admin/articles (Build Plan Section 4.8, built by
// sprint-5/admin-articles-categories-backend). AdminRolesGuard('editor',
// 'superadmin') on the whole endpoint — a moderator gets a real 403, so
// this screen is only reachable by an editor/superadmin token.
//
// The Status column now carries a real Publish/Unpublish row action —
// PATCH /admin/articles/:id via updateArticle() — mirroring
// CategoriesPage.tsx's own status-toggle pattern exactly: no confirmation
// dialog (this is a directly reversible status flip, the same class of
// action as Categories' own Activate/Deactivate toggle, not Users'
// irreversible Delete), and the server's own response is applied inline
// via an overrides map rather than a full list reload.
import { Link } from "react-router-dom";
import { useState } from "react";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { AdminApiError } from "../../api/adminClient";
import { listArticles, updateArticle, type ArticleListItem, type ArticleStatus } from "../../api/adminContent";
import { formatDate, useAsyncData } from "../content/adminContentShared";
import "../content/content.css";

function ArticleRow({
  article,
  onToggled,
}: {
  article: ArticleListItem;
  onToggled: (updated: ArticleListItem) => void;
}) {
  const [toggling, setToggling] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const nextStatus: ArticleStatus = article.status === "published" ? "draft" : "published";

  const handleToggle = async () => {
    setRowError(null);
    setToggling(true);
    try {
      const updated = await updateArticle(article.id, { status: nextStatus });
      onToggled(updated);
    } catch (err) {
      setRowError(err instanceof AdminApiError ? err.message : "Couldn't update this article.");
    } finally {
      setToggling(false);
    }
  };

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
      <span>
        <button type="button" className="ac-btn ac-btn--outline ac-btn--sm" onClick={handleToggle} disabled={toggling}>
          {toggling ? "Updating…" : nextStatus === "published" ? "Publish" : "Unpublish"}
        </button>
        {rowError ? (
          <p className="ac-error ac-row-error" role="alert">
            {rowError}
          </p>
        ) : null}
      </span>
    </div>
  );
}

export default function ArticlesPage() {
  const [status, setStatus] = useState<ArticleStatus | "all">("all");
  const filter = status === "all" ? undefined : status;
  const { data, loading, error, reload } = useAsyncData(() => listArticles({ status: filter, limit: 50 }), [filter]);

  const [extraItems, setExtraItems] = useState<ArticleListItem[]>([]);
  const [overrides, setOverrides] = useState<Record<string, ArticleListItem>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const baseItems = data ? [...data.items, ...extraItems] : [];
  const items = baseItems.map((a) => overrides[a.id] ?? a);
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
    setOverrides({});
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
              <span aria-hidden />
            </div>
            {items.map((a) => (
              <ArticleRow
                key={a.id}
                article={a}
                onToggled={(updated) => setOverrides((prev) => ({ ...prev, [updated.id]: updated }))}
              />
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
