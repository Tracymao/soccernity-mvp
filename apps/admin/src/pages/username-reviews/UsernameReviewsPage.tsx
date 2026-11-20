// Username reviews -- the list (B-139 part (c); Decision Log #467). Figma Admin Username Reviews list (Pending)
// 6955:42228, Decided 6955:42587, Empty 6955:42945, Loading 6955:43121, Error 6955:43361. Route /username-reviews,
// shown in the nav to moderators and superadmins.
//
// Real data: GET /admin/username-reviews?status=, newest first, keyset cursor ("Load more"). Only what the server
// returns is drawn. A request the server leaves out (the revoking admin's own, a minor's for an admin who is not
// child-safety vetted) is simply not here: the client applies no rule of its own.
//
// Where the frame and the server differ (the server wins; listed in the PR):
//  * The frame's Status control offers Pending / Decided / All and the Decided list shows a "Reinstated" row. The
//    server DELETES a request when it is reinstated (the request goes with the revoked-username record), so a
//    reinstated request can never be listed. The control offers Pending / Declined / All instead.
//  * Loading is a plain "Loading..." line like the other moderation tabs, not the frame's skeleton rows.
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import AdminPageHeader from "../../layout/AdminPageHeader";
import {
  listUsernameReviews,
  type UsernameReviewListItem,
  type UsernameReviewStatus,
} from "../../api/usernameReviews";
import { formatShortDate, useAsyncData } from "../moderation/moderationShared";
import { ReviewStatusPill } from "./usernameReviewShared";
import "../moderation/moderation.css";
import "./usernameReviews.css";

type StatusChoice = "pending" | "declined" | "all";

const CHOICES: { value: StatusChoice; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "declined", label: "Declined" },
  { value: "all", label: "All" },
];

const EMPTY_TITLES: Record<StatusChoice, string> = {
  pending: "No pending requests.",
  declined: "No declined requests.",
  all: "No requests.",
};

function toStatus(choice: StatusChoice): UsernameReviewStatus | undefined {
  return choice === "all" ? undefined : choice;
}

function ReviewRow({ item }: { item: UsernameReviewListItem }) {
  const pending = item.status === "pending";
  return (
    <div className="ur-table__row" role="row">
      <span role="cell">{formatShortDate(item.createdAt)}</span>
      <span className="ce-cell--name" role="cell" title={item.userDisplayName}>
        {item.userDisplayName}
      </span>
      <span role="cell">@{item.removedUsername}</span>
      <span role="cell">{item.revokedBy?.displayName ?? "—"}</span>
      <span role="cell">{formatShortDate(item.revokedAt)}</span>
      <span role="cell">
        <ReviewStatusPill status={item.status} />
      </span>
      <span role="cell">
        <Link
          className="mod-btn mod-btn--outline mod-btn--sm"
          to={`/username-reviews/${item.id}`}
          state={{ request: item }}
          aria-label={`${pending ? "Review" : "View"} the request from ${item.userDisplayName} about @${item.removedUsername}`}
        >
          {pending ? "Review" : "View"}
        </Link>
      </span>
    </div>
  );
}

export default function UsernameReviewsPage() {
  // What the control shows now, and what the list was last asked for (Apply filter copies one to the other).
  const [draft, setDraft] = useState<StatusChoice>("pending");
  const [applied, setApplied] = useState<StatusChoice>("pending");

  const { data, loading, error, reload } = useAsyncData(
    () => listUsernameReviews({ status: toStatus(applied), limit: 50 }),
    [applied],
  );
  const [extraItems, setExtraItems] = useState<UsernameReviewListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);

  const items = data ? [...data.items, ...extraItems] : [];
  const effectiveCursor = extraItems.length > 0 ? cursor : (data?.nextCursor ?? null);

  function handleApply(event: FormEvent) {
    event.preventDefault();
    setExtraItems([]);
    setCursor(null);
    setLoadMoreError(false);
    setApplied(draft);
  }

  async function loadMore() {
    if (!effectiveCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const page = await listUsernameReviews({ status: toStatus(applied), cursor: effectiveCursor, limit: 50 });
      setExtraItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <AdminPageHeader title="Username reviews" />
      <div className="mod-page">
        <form className="mod-card hi-filter" onSubmit={handleApply} noValidate>
          <div className="hi-filter__row">
            <div className="hi-field">
              <label className="hi-field__label" htmlFor="ur-status">
                Status
              </label>
              <div className="hi-field__box">
                <select
                  id="ur-status"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value as StatusChoice)}
                  aria-describedby="ur-status-help"
                >
                  {CHOICES.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="hi-field__help" id="ur-status-help">
                Pending, declined or all.
              </p>
            </div>
            <button type="submit" className="mod-btn mod-btn--primary" disabled={loading}>
              Apply filter
            </button>
          </div>
        </form>

        {loading && !data ? <p className="mod-loading">Loading the review requests…</p> : null}

        {error ? (
          <>
            <div className="mod-callout mod-callout--alert" role="alert">
              <span className="mod-callout__bar" aria-hidden />
              <div>
                <p className="ce-banner__title">Couldn’t load the review requests</p>
                <p>Check the connection and try again.</p>
              </div>
            </div>
            <div>
              <button type="button" className="mod-btn mod-btn--outline mod-btn--sm" onClick={reload}>
                Retry
              </button>
            </div>
          </>
        ) : null}

        {!error && data && items.length === 0 ? (
          <div className="mod-card hi-empty" role="status">
            <h2 className="hi-empty__title">{EMPTY_TITLES[applied]}</h2>
            <p className="mod-note">A request appears here when someone asks for a review of a removed username.</p>
          </div>
        ) : null}

        {!error && items.length > 0 ? (
          <div className="mod-table" role="table" aria-label="Username review requests">
            <div className="ur-table__row mod-table__row--head" role="row">
              <span role="columnheader">Requested</span>
              <span role="columnheader">Person</span>
              <span role="columnheader">Username removed</span>
              <span role="columnheader">Removed by</span>
              <span role="columnheader">Removed on</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Action</span>
            </div>
            {items.map((item) => (
              <ReviewRow key={item.id} item={item} />
            ))}
          </div>
        ) : null}

        {loadMoreError ? (
          <p className="mod-error" role="alert">
            Couldn’t load more requests. Try again.
          </p>
        ) : null}

        {!error && effectiveCursor ? (
          <div>
            <button type="button" className="mod-btn mod-btn--outline mod-btn--sm" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
