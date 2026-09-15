// Categories — Figma node 128:488.
//
// Real data: GET /admin/categories (Build Plan Section 4.8, built by
// sprint-5/admin-articles-categories-backend). "Post Count" is the
// backend's own computed `articleCount`. The Status column is a real,
// interactive toggle — PATCH /admin/categories/:id — retiring a category
// (rather than deleting it) is the real underlying need Section 4.8's
// literal spec leaves no route for; see admin-content/README.md.
import { Link } from "react-router-dom";
import { useState } from "react";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { AdminApiError } from "../../api/adminClient";
import { listCategories, updateCategory, type Category, type CategoryStatus } from "../../api/adminContent";
import { useAsyncData } from "../content/adminContentShared";
import "../content/content.css";

function CategoryRow({ category, onToggled }: { category: Category; onToggled: (updated: Category) => void }) {
  const [toggling, setToggling] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const nextStatus: CategoryStatus = category.status === "active" ? "inactive" : "active";

  const handleToggle = async () => {
    setRowError(null);
    setToggling(true);
    try {
      const updated = await updateCategory(category.id, { status: nextStatus });
      onToggled(updated);
    } catch (err) {
      setRowError(err instanceof AdminApiError ? err.message : "Couldn't update this category.");
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="ac-table__row ac-table__row--categories" key={category.id}>
      <span className="ac-cell--primary ac-cell--truncate" title={category.name}>
        {category.name}
      </span>
      <span className="ac-cell--secondary">{category.articleCount}</span>
      <span>
        <span className={`ac-pill ${category.status === "active" ? "ac-pill--strong" : "ac-pill--soft"}`}>
          {category.status}
        </span>
      </span>
      <span>
        <button type="button" className="ac-btn ac-btn--outline ac-btn--sm" onClick={handleToggle} disabled={toggling}>
          {toggling ? "Updating…" : nextStatus === "inactive" ? "Deactivate" : "Activate"}
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

export default function CategoriesPage() {
  const [status, setStatus] = useState<CategoryStatus | "all">("all");
  const filter = status === "all" ? undefined : status;
  const { data, loading, error, reload } = useAsyncData(() => listCategories({ status: filter, limit: 50 }), [filter]);

  const [extraItems, setExtraItems] = useState<Category[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Category>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const baseItems = data ? [...data.items, ...extraItems] : [];
  const items = baseItems.map((c) => overrides[c.id] ?? c);
  const effectiveCursor = extraItems.length > 0 ? cursor : data?.nextCursor ?? null;

  async function loadMore() {
    if (!effectiveCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listCategories({ status: filter, cursor: effectiveCursor, limit: 50 });
      setExtraItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  function switchFilter(next: CategoryStatus | "all") {
    setStatus(next);
    setExtraItems([]);
    setOverrides({});
    setCursor(null);
  }

  return (
    <>
      <AdminPageHeader title="Categories" hideSearch />
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
              className={`ac-tab ${status === "active" ? "ac-tab--active" : ""}`}
              onClick={() => switchFilter("active")}
            >
              Active
            </button>
            <button
              type="button"
              className={`ac-tab ${status === "inactive" ? "ac-tab--active" : ""}`}
              onClick={() => switchFilter("inactive")}
            >
              Inactive
            </button>
          </div>
          <Link to="/categories/new" className="ac-btn ac-btn--primary">
            Add Category
          </Link>
        </div>

        {loading ? <p className="ac-loading">Loading categories…</p> : null}
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
            <h2 className="ac-card__title">No categories yet</h2>
            <p className="ac-note">Add the first one to get started.</p>
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className="ac-table">
            <div className="ac-table__row ac-table__row--categories ac-table__row--head">
              <span>Name</span>
              <span>Post Count</span>
              <span>Status</span>
              <span aria-hidden />
            </div>
            {items.map((c) => (
              <CategoryRow
                key={c.id}
                category={c}
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
