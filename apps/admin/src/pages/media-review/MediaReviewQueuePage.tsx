// Media review queue — Figma pass Q admin frames 6851:29675 (list + statistics card), 6851:30038 (empty),
// 6851:30333 (load error). FC10, B-240; Decision Log #419 item 4; real data from GET /admin/media-review
// and GET /admin/media-review/stats (B-037, W15).
//
// What is here: only pictures and videos the automatic check was unsure about (or never ran for), and
// approved files users reported. Everything the check approved or rejected on its own is not in the queue;
// the statistics card says how many that was in the last 7 days.
//
// Deviations from the frame, each because the API does not provide it:
//   - "27 pending" / "Showing 5 of 27": the list endpoint returns no total, so the count is of what has
//     been loaded and reads "N+" while more pages exist.
//   - Status and source filters are not drawn; they are plain selects because the API takes them and a
//     moderator needs the Approved / Rejected views ("decided" is drawn only on the item screen).
import { useState } from "react";
import { Link } from "react-router";
import AdminPageHeader from "../../layout/AdminPageHeader";
import {
  getMediaReviewStats,
  listMediaReview,
  type MediaReviewItem,
  type MediaReviewSource,
  type MediaReviewStatusFilter,
} from "../../api/mediaReview";
import { useAsyncData } from "../moderation/moderationShared";
import "../moderation/moderation.css";
import "./mediaReview.css";

export function formatAge(seconds: number): string {
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

export function sourceLabel(source: MediaReviewSource): string {
  return source === "auto_check" ? "Automatic check" : "User report";
}

export function kindLabel(kind: string): string {
  return kind === "video" ? "Video" : "Picture";
}

function StatsCard() {
  const { data, loading, error, reload } = useAsyncData(() => getMediaReviewStats(7), []);
  return (
    <section className="mod-card media-stats" aria-label="Statistics, last 7 days">
      <h2 className="mod-card__title">Last 7 days</h2>
      {loading ? <p className="mod-loading">Loading statistics…</p> : null}
      {error ? (
        <p className="mod-error" role="alert">
          {error}{" "}
          <button type="button" className="mod-link" onClick={reload}>
            Try again
          </button>
        </p>
      ) : null}
      {data ? (
        <>
          <dl className="media-stats__grid">
            <div>
              <dt>Auto-approved</dt>
              <dd data-testid="stat-auto-approved">{data.autoApproved}</dd>
            </div>
            <div>
              <dt>Auto-rejected</dt>
              <dd data-testid="stat-auto-rejected">{data.autoRejected}</dd>
            </div>
            <div>
              <dt>Sent to review</dt>
              <dd data-testid="stat-sent-to-review">{data.sentToReview}</dd>
            </div>
            <div>
              <dt>Reported</dt>
              <dd data-testid="stat-reported">{data.reported}</dd>
            </div>
          </dl>
          <p className="mod-note">
            Counts for the last {data.windowDays} days. {data.decidedByModerator} decided by a moderator.
          </p>
        </>
      ) : null}
    </section>
  );
}

function QueueRow({ item }: { item: MediaReviewItem }) {
  return (
    <div className="media-table__row">
      <span>
        {item.sources.length === 0 ? "—" : item.sources.map((s) => sourceLabel(s)).join(" + ")}
        {item.hiddenPendingReview ? <span className="mod-pill mod-pill--soft media-held">hidden</span> : null}
      </span>
      <span className="mod-cell--primary">{item.uploader.publicName}</span>
      <span>{kindLabel(item.kind)}</span>
      <span className="mod-cell--secondary">{formatAge(item.ageSeconds)}</span>
      <span>
        <Link className="mod-btn mod-btn--outline mod-btn--sm" to={`/moderation/media/${item.id}`} state={{ item }}>
          Review
        </Link>
      </span>
    </div>
  );
}

export default function MediaReviewQueuePage() {
  const [status, setStatus] = useState<MediaReviewStatusFilter>("pending");
  const [source, setSource] = useState<MediaReviewSource | "">("");
  const { data, loading, error, reload } = useAsyncData(
    () => listMediaReview({ status, source: source || undefined, limit: 20 }),
    [status, source],
  );
  const [extra, setExtra] = useState<MediaReviewItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const items = data ? [...data.items, ...extra] : [];
  const nextCursor = extra.length > 0 ? cursor : (data?.nextCursor ?? null);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listMediaReview({ status, source: source || undefined, limit: 20, cursor: nextCursor });
      setExtra((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  function changeFilter(nextStatus: MediaReviewStatusFilter, nextSource: MediaReviewSource | "") {
    setStatus(nextStatus);
    setSource(nextSource);
    setExtra([]);
    setCursor(null);
  }

  return (
    <>
      <AdminPageHeader title="Media review" hideSearch />
      <div className="mod-page">
        <div className="media-heading">
          <Link className="mod-link" to="/moderation">
            ← Moderation Queue
          </Link>
          {status === "pending" && data ? (
            <span className="mod-pill mod-pill--strong" data-testid="pending-count">
              {items.length}
              {nextCursor ? "+" : ""} pending
            </span>
          ) : null}
        </div>
        <p className="mod-note">
          Only pictures and videos the automatic check was unsure about, and items people have reported, appear here.
          Everything else was approved or rejected automatically.
        </p>

        <StatsCard />

        <div className="media-filters">
          <label>
            Show
            <select value={status} onChange={(e) => changeFilter(e.target.value as MediaReviewStatusFilter, source)}>
              <option value="pending">Waiting for a decision</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <label>
            Source
            <select value={source} onChange={(e) => changeFilter(status, e.target.value as MediaReviewSource | "")}>
              <option value="">All</option>
              <option value="auto_check">Automatic check</option>
              <option value="user_report">User report</option>
            </select>
          </label>
        </div>

        {loading ? <p className="mod-loading">Loading the review queue…</p> : null}
        {error ? (
          <div className="mod-card mod-card--restricted" role="alert">
            <h2 className="mod-card__title">Couldn’t load the review queue</h2>
            <p className="mod-note">Check your connection and try again. Nothing has been approved or rejected.</p>
            <button type="button" className="mod-btn mod-btn--primary mod-btn--sm" onClick={reload}>
              Try again
            </button>
          </div>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <div className="mod-card">
            <h2 className="mod-card__title">Nothing to review</h2>
            <p className="mod-note">
              {status === "pending"
                ? "No picture or video is waiting for a decision. New items appear here when the automatic check is unsure or someone reports a file."
                : "No items match this view."}
            </p>
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className="media-table" role="table" aria-label="Media review queue">
            <div className="media-table__row media-table__row--head" role="row">
              <span>Source</span>
              <span>Uploader</span>
              <span>Type</span>
              <span>Age</span>
              <span>Action</span>
            </div>
            {items.map((item) => (
              <QueueRow key={item.id} item={item} />
            ))}
          </div>
        ) : null}

        {nextCursor && !loading ? (
          <button type="button" className="mod-btn mod-btn--outline mod-btn--sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        ) : null}
      </div>
    </>
  );
}
