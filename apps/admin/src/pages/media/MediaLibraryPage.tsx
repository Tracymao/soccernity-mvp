// Media library — Figma nodes 361:553 (list) and 396:442 (preview).
//
// Real data: GET /admin/media (Build Plan Section 4.8, built by
// sprint-5/admin-media-storage-backend). AdminRolesGuard('editor',
// 'superadmin') on the whole endpoint — a moderator gets a real 403, so
// this screen is only reachable by an editor/superadmin token.
import { Link } from "react-router-dom";
import { useState } from "react";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { listMedia, type MediaAsset, type MediaType } from "../../api/adminMedia";
import { displayNameFromUrl, formatBytes, formatDate, useAsyncData } from "./mediaShared";
import "./media.css";

function MediaRow({ media }: { media: MediaAsset }) {
  const name = displayNameFromUrl(media.url);
  return (
    <div className="med-table__row" key={media.id}>
      <Link
        to={`/media/preview/${media.id}`}
        state={{ media }}
        className="med-cell--primary med-cell--truncate"
        title={name}
      >
        {name}
      </Link>
      <span className="med-cell--secondary">{formatDate(media.createdAt)}</span>
      <span className="med-cell--secondary">{formatBytes(media.size)}</span>
      <span>
        <span className="med-pill">{media.type}</span>
      </span>
    </div>
  );
}

export default function MediaLibraryPage() {
  const [type, setType] = useState<MediaType | "all">("all");
  const filter = type === "all" ? undefined : type;
  const { data, loading, error, reload } = useAsyncData(() => listMedia({ type: filter, limit: 50 }), [filter]);

  const [extraItems, setExtraItems] = useState<MediaAsset[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const items = data ? [...data.items, ...extraItems] : [];
  const effectiveCursor = extraItems.length > 0 ? cursor : data?.nextCursor ?? null;

  async function loadMore() {
    if (!effectiveCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listMedia({ type: filter, cursor: effectiveCursor, limit: 50 });
      setExtraItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  function switchFilter(next: MediaType | "all") {
    setType(next);
    setExtraItems([]);
    setCursor(null);
  }

  return (
    <>
      <AdminPageHeader title="Media" hideSearch />
      <div className="med-page">
        <div className="med-action-row">
          <div className="med-tabs">
            <button
              type="button"
              className={`med-tab ${type === "all" ? "med-tab--active" : ""}`}
              onClick={() => switchFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              className={`med-tab ${type === "image" ? "med-tab--active" : ""}`}
              onClick={() => switchFilter("image")}
            >
              Images
            </button>
            <button
              type="button"
              className={`med-tab ${type === "video" ? "med-tab--active" : ""}`}
              onClick={() => switchFilter("video")}
            >
              Videos
            </button>
          </div>
          <Link to="/media/upload" className="med-btn med-btn--primary">
            Add Media
          </Link>
        </div>

        {loading ? <p className="med-loading">Loading media…</p> : null}
        {error ? (
          <p className="med-error" role="alert">
            {error}{" "}
            <button type="button" className="med-link" onClick={reload}>
              Retry
            </button>
          </p>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <div className="med-card">
            <h2 className="med-card__title">No media yet</h2>
            <p className="med-note">
              <Link to="/media/upload" className="med-link">
                Upload the first file
              </Link>{" "}
              to get started.
            </p>
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className="med-table">
            <div className="med-table__row med-table__row--head">
              <span>Name</span>
              <span>Time of Upload</span>
              <span>File Size</span>
              <span>Type</span>
            </div>
            {items.map((m) => (
              <MediaRow key={m.id} media={m} />
            ))}
          </div>
        ) : null}

        {effectiveCursor && !loading ? (
          <button type="button" className="med-btn med-btn--outline med-btn--sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        ) : null}
      </div>
    </>
  );
}
