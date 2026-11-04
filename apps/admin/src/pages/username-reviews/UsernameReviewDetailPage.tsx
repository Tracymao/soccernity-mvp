// Username review -- one request (B-139 part (c); Decision Log #467). Figma Admin Username Reviews Detail (Pending)
// 6955:43541 and Detail (Decided) 6955:43828. Route /username-reviews/:id.
//
// There is no GET /admin/username-reviews/:id. The page is reached from the list's "Review" / "View" link, which
// hands the row over in router `state`; a direct visit or a refresh falls back to a bounded re-list
// (findUsernameReviewById). A reinstated request no longer exists on the server (it is deleted with the
// revoked-username record), so after a reinstatement a reload shows "not found".
//
// Real data: only what GET /admin/username-reviews returns. Where the frames and the server differ (the server
// wins; listed in the PR):
//  * "Reason recorded at removal" and "New username chosen" (Pending frame) are not in the response -> not drawn.
//  * The Decision card draws "Decided by", "Decided on" and "Reason (internal)". The list returns none of them (the
//    reason goes to the audit record only). The card here shows the decision, and "Decided on" only right after
//    THIS admin decided in this session (the decide answer carries decidedAt).
//  * The "Decision recorded" banner is likewise shown only right after a decision in this session.
//
// Actions: "Reinstate username" and "Decline request" open the decide dialog (DecideDialog.tsx) with that choice
// selected. Only a pending request has them.
import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import AdminPageHeader from "../../layout/AdminPageHeader";
import {
  findUsernameReviewById,
  type UsernameReviewDecision,
  type UsernameReviewDecisionResult,
  type UsernameReviewListItem,
} from "../../api/usernameReviews";
import { formatShortDate } from "../moderation/moderationShared";
import DecideDialog from "./DecideDialog";
import { KeyValue, ReviewStatusPill, requestNumber, statusLabel } from "./usernameReviewShared";
import "../moderation/moderation.css";
import "./usernameReviews.css";

type LoadState = "loading" | "loaded" | "not-found" | "error";

const BACK_LINK = (
  <div className="mod-back">
    <Link to="/username-reviews">← Username reviews</Link>
  </div>
);

export default function UsernameReviewDetailPage() {
  const { id = "" } = useParams();
  const location = useLocation() as { state?: { request?: UsernameReviewListItem } };
  const handedOver = location.state?.request;

  const [request, setRequest] = useState<UsernameReviewListItem | null>(handedOver?.id === id ? handedOver : null);
  const [loadState, setLoadState] = useState<LoadState>(request ? "loaded" : "loading");
  const [deciding, setDeciding] = useState<UsernameReviewDecision | null>(null);
  const [decided, setDecided] = useState<{ result: UsernameReviewDecisionResult; decision: UsernameReviewDecision } | null>(
    null,
  );
  // Bumped to re-read the request after a dialog error said it had changed.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (request && reloadKey === 0) return;
    let cancelled = false;
    setLoadState("loading");
    findUsernameReviewById(id)
      .then((found) => {
        if (cancelled) return;
        if (found) {
          setRequest(found);
          setLoadState("loaded");
        } else {
          setRequest(null);
          setLoadState("not-found");
        }
      })
      .catch(() => {
        if (!cancelled) setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  if (loadState === "loading") {
    return (
      <>
        <AdminPageHeader title="Review request" />
        <div className="mod-page">
          {BACK_LINK}
          <p className="mod-loading">Loading the review request…</p>
        </div>
      </>
    );
  }

  if (loadState !== "loaded" || !request) {
    return (
      <>
        <AdminPageHeader title="Review request" />
        <div className="mod-page">
          {BACK_LINK}
          <div className="mod-card">
            <h2 className="mod-card__title">Request not found</h2>
            <p className="mod-note">
              {loadState === "error"
                ? "Couldn’t load this request. Please try again from the list."
                : "This request is not in the list. A request is removed when it is reinstated or when the account is deleted."}
            </p>
            <div className="mod-action-row">
              <Link className="mod-btn mod-btn--primary" to="/username-reviews">
                Back to username reviews
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  const status = decided ? decided.result.status : request.status;
  const pending = status === "pending";

  function handleDecided(result: UsernameReviewDecisionResult, decision: UsernameReviewDecision) {
    setDecided({ result, decision });
    setRequest((current) => (current ? { ...current, status: result.status } : current));
    setDeciding(null);
  }

  function handleDialogClosed(stale: boolean) {
    setDeciding(null);
    if (stale) setReloadKey((n) => n + 1);
  }

  return (
    <>
      <AdminPageHeader title={`Review request ${requestNumber(request.id)}`} />
      <div className="mod-page">
        {BACK_LINK}

        <div className="ce-pills">
          <ReviewStatusPill status={status} />
        </div>

        {decided ? (
          <div className="mod-callout" role="status">
            <span className="mod-callout__bar" aria-hidden />
            <div>
              <p className="ce-banner__title">Decision recorded</p>
              <p>
                {decided.decision === "reinstate"
                  ? `Reinstated. @${request.removedUsername} is back on ${request.userDisplayName}’s account and the removal record is deleted.`
                  : `Declined. @${request.removedUsername} stays removed. This decision is final.`}
              </p>
            </div>
          </div>
        ) : null}

        <div className="ce-cards">
          <section className="mod-card" aria-label="Removal">
            <h2 className="mod-card__title">Removal</h2>
            <KeyValue label="Person">{request.userDisplayName}</KeyValue>
            <KeyValue label="Username removed">@{request.removedUsername}</KeyValue>
            <KeyValue label="Removed by">{request.revokedBy?.displayName ?? "—"}</KeyValue>
            <KeyValue label="Removed on">{formatShortDate(request.revokedAt)}</KeyValue>
          </section>
          <section className="mod-card" aria-label="Request">
            <h2 className="mod-card__title">Request</h2>
            <KeyValue label="Requested on">{formatShortDate(request.createdAt)}</KeyValue>
            {request.message ? <p className="ce-message">{request.message}</p> : null}
          </section>
        </div>

        {!pending ? (
          <section className="mod-card" aria-label="Decision">
            <h2 className="mod-card__title">Decision</h2>
            <KeyValue label="Decision">{statusLabel(status)}</KeyValue>
            {decided ? <KeyValue label="Decided on">{formatShortDate(decided.result.decidedAt)}</KeyValue> : null}
          </section>
        ) : null}

        {pending ? (
          <section className="ce-actions" aria-label="Actions">
            <h2 className="mod-card__title">Actions</h2>
            <div className="mod-action-row">
              <button type="button" className="mod-btn mod-btn--primary" onClick={() => setDeciding("reinstate")}>
                Reinstate username
              </button>
              <button type="button" className="mod-btn mod-btn--outline" onClick={() => setDeciding("decline")}>
                Decline request
              </button>
            </div>
            <p className="ur-hint">A decision is final. There is no second review.</p>
            <div className="mod-callout">
              <span className="mod-callout__bar" aria-hidden />
              <p>
                The person sees the result on their create-profile screen and in an in-app notification. No email is
                sent for the decision.
              </p>
            </div>
          </section>
        ) : null}

        {deciding ? (
          <DecideDialog
            request={request}
            initialDecision={deciding}
            onDecided={handleDecided}
            onClose={handleDialogClosed}
          />
        ) : null}
      </div>
    </>
  );
}
