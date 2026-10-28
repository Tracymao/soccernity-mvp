// One item in the media review queue — Figma pass Q admin frames 6852:30003 (picture, source = automatic
// check, with category labels), 6852:30323 (video with inline player, source = user report), 6852:30658
// (already decided), 6852:30985 / 6852:31327 (reject dialog). FC10, B-240; Decision Log #419 item 4; real
// data from GET /admin/media-review/:id, POST .../approve and .../reject (B-037, W15).
//
// The queue row hands its already-fetched item over through router `state`; a direct visit or a refresh
// re-fetches by id. The file is shown through the 5-minute signed link in `viewUrl` (null when storage is
// unavailable: the page says so). Approve and Reject are the only two decisions; Reject needs a reason (1-300
// characters) that the uploader reads. Reject is a navy button, never red (palette rule).
//
// Deviations from the frames, because the API does not provide the data: the "Reason given" sample on the
// user-report callout is not shown (reports carry no reason and never identify the reporter, only a count);
// category labels are the check's names only, without percentages.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { AdminApiError } from "../../api/adminClient";
import {
  MEDIA_REVIEW_REJECT_REASON_MAX,
  approveMedia,
  getMediaReviewItem,
  isAlreadyDecided,
  rejectMedia,
  type MediaReviewItem,
} from "../../api/mediaReview";
import { formatDateTime } from "../moderation/moderationShared";
import { formatAge, kindLabel, sourceLabel } from "./MediaReviewQueuePage";
import "../moderation/moderation.css";
import "./mediaReview.css";

type Load = "loading" | "loaded" | "not-found" | "error";

function RejectDialog({
  noun,
  submitting,
  error,
  onCancel,
  onSubmit,
}: {
  noun: string;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const trimmed = reason.trim();
  const missing = touched && trimmed.length === 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
  }

  return (
    <div className="media-dialog__scrim">
      <form className="media-dialog" role="dialog" aria-modal="true" aria-labelledby="reject-title" onSubmit={submit}>
        <h2 id="reject-title" className="mod-card__title">
          Reject this {noun}?
        </h2>
        <p className="mod-note">Say why this {noun} is being rejected. The uploader sees this reason. [COPY PENDING LEGAL REVIEW]</p>
        <label className="mod-field">
          <span className="mod-field__label">Reason (required)</span>
          <textarea
            className="mod-textarea"
            rows={4}
            maxLength={MEDIA_REVIEW_REJECT_REASON_MAX}
            value={reason}
            aria-invalid={missing}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
          />
        </label>
        <p className={missing ? "mod-error media-dialog__help" : "mod-note media-dialog__help"} role={missing ? "alert" : undefined}>
          {missing ? "Enter a reason to continue." : `Up to ${MEDIA_REVIEW_REJECT_REASON_MAX} characters.`}
        </p>
        {error ? (
          <p className="mod-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mod-action-row">
          <button type="submit" className="mod-btn mod-btn--primary" disabled={submitting || trimmed.length === 0}>
            {submitting ? "Rejecting…" : `Reject ${noun}`}
          </button>
          <button type="button" className="mod-btn mod-btn--outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default function MediaReviewItemPage() {
  const { id = "" } = useParams<{ id: string }>();
  const location = useLocation();
  const handed = (location.state as { item?: MediaReviewItem } | null)?.item;
  const [item, setItem] = useState<MediaReviewItem | null>(handed && handed.id === id ? handed : null);
  const [load, setLoad] = useState<Load>(item ? "loaded" : "loading");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const alive = useRef(true);

  const fetchItem = useCallback(async () => {
    try {
      const fresh = await getMediaReviewItem(id);
      if (!alive.current) return;
      setItem(fresh);
      setLoad("loaded");
    } catch (err) {
      if (!alive.current) return;
      setLoad(err instanceof AdminApiError && err.status === 404 ? "not-found" : "error");
    }
  }, [id]);

  useEffect(() => {
    alive.current = true;
    // The handed-over item may be minutes old and its signed link may have expired: always re-read it.
    void fetchItem();
    return () => {
      alive.current = false;
    };
  }, [fetchItem]);

  const back = (
    <div className="mod-back">
      <Link to="/moderation/media">← Back to queue</Link>
    </div>
  );

  if (load === "loading" && !item) {
    return (
      <>
        <AdminPageHeader title="Media review" hideSearch />
        <div className="mod-page">
          {back}
          <p className="mod-loading">Loading the item…</p>
        </div>
      </>
    );
  }
  if (!item) {
    return (
      <>
        <AdminPageHeader title="Media review" hideSearch />
        <div className="mod-page">
          {back}
          <div className="mod-card mod-card--restricted" role="alert">
            <h2 className="mod-card__title">{load === "not-found" ? "Item not found" : "Couldn’t load this item"}</h2>
            <p className="mod-note">
              {load === "not-found"
                ? "It is not in the review queue (it may never have needed review)."
                : "Check your connection and try again. Nothing has been approved or rejected."}
            </p>
            {load === "error" ? (
              <button type="button" className="mod-btn mod-btn--primary mod-btn--sm" onClick={() => void fetchItem()}>
                Try again
              </button>
            ) : null}
          </div>
        </div>
      </>
    );
  }

  const noun = item.kind === "video" ? "video" : "picture";
  const decided = !item.awaitingDecision;
  const reported = item.sources.includes("user_report") && item.reportCount > 0;

  async function approve() {
    if (!item || busy) return;
    setBusy("approve");
    setActionError(null);
    try {
      const result = await approveMedia(item.id);
      setOutcome(result.outcome === "kept" ? "kept" : "approved");
      await fetchItem();
    } catch (err) {
      if (isAlreadyDecided(err)) await fetchItem();
      else setActionError(err instanceof AdminApiError ? err.message : "Couldn’t approve that. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function reject(reason: string) {
    if (!item || busy) return;
    setBusy("reject");
    setRejectError(null);
    try {
      await rejectMedia(item.id, reason);
      setRejecting(false);
      setOutcome("rejected");
      await fetchItem();
    } catch (err) {
      if (isAlreadyDecided(err)) {
        setRejecting(false);
        await fetchItem();
      } else {
        setRejectError(err instanceof AdminApiError ? err.message : "Couldn’t reject that. Please try again.");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <AdminPageHeader title={`Review ${noun}`} hideSearch />
      <div className="mod-page media-item-page">
        {back}

        <div className="media-viewer" data-testid="media-viewer">
          {item.viewUrl ? (
            item.kind === "video" ? (
              <video src={item.viewUrl} controls preload="metadata" aria-label="The video under review" />
            ) : (
              <img src={item.viewUrl} alt="The picture under review" />
            )
          ) : (
            <p className="mod-note">The preview link isn’t available right now. Reload this page to get a new one.</p>
          )}
        </div>

        {decided ? (
          <div className="mod-callout" role="status">
            <span className="mod-callout__bar" aria-hidden />
            <p>
              <strong>Already decided.</strong> This {noun} was {item.status === "rejected" ? "rejected" : "approved"}
              {item.decidedAt ? ` on ${formatDateTime(item.decidedAt)}` : ""}
              {outcome ? " by you just now" : ""}. There is nothing more to do here.
              {item.status === "rejected" && item.rejectionReason ? ` Reason given to the uploader: “${item.rejectionReason}”` : ""}
            </p>
          </div>
        ) : null}

        {reported ? (
          <div className="mod-callout">
            <span className="mod-callout__bar" aria-hidden />
            <p>
              Reported by {item.reportCount} {item.reportCount === 1 ? "person" : "people"}.
              {item.hiddenPendingReview ? " It is hidden from everyone but its author until you decide." : " It is still visible."}{" "}
              Approving keeps it online and clears the reports; the uploader is not told.
            </p>
          </div>
        ) : null}

        <section className="mod-card">
          <h2 className="mod-card__title">Details</h2>
          <div className="media-details">
            <div className="mod-field">
              <span className="mod-field__label">Uploader</span>
              <span className="mod-field__value">{item.uploader.publicName}</span>
            </div>
            <div className="mod-field">
              <span className="mod-field__label">Source</span>
              <span className="mod-field__value">{item.sources.map((s) => sourceLabel(s)).join(" + ") || "—"}</span>
            </div>
            <div className="mod-field">
              <span className="mod-field__label">Type</span>
              <span className="mod-field__value">
                {kindLabel(item.kind)}
                {item.durationSeconds ? ` · ${Math.round(item.durationSeconds)} s` : ""}
              </span>
            </div>
            <div className="mod-field">
              <span className="mod-field__label">Age</span>
              <span className="mod-field__value">{formatAge(item.ageSeconds)}</span>
            </div>
            <div className="mod-field">
              <span className="mod-field__label">Used in</span>
              <span className="mod-field__value" title={item.postId ?? undefined}>
                {item.postId ? `Post ${item.postId.slice(0, 8)}…` : "Not attached to a post"}
              </span>
            </div>
          </div>
          <div className="mod-field">
            <span className="mod-field__label">Automatic check</span>
            <span className="mod-field__value">
              {item.checkLabels.length > 0 ? (
                <span className="media-labels">
                  {item.checkLabels.map((label) => (
                    <span key={label} className="mod-pill mod-pill--soft">
                      {label}
                    </span>
                  ))}
                </span>
              ) : (
                "No labels (the check did not run, or found nothing above its threshold)."
              )}
            </span>
          </div>
          <p className="mod-note">Labels come from the automatic check. They are a guide — the decision is yours.</p>
        </section>

        {actionError ? (
          <p className="mod-error" role="alert">
            {actionError}
          </p>
        ) : null}

        <div className="mod-action-row">
          <button type="button" className="mod-btn mod-btn--primary" onClick={approve} disabled={decided || busy !== null}>
            {busy === "approve" ? "Approving…" : "Approve"}
          </button>
          <button
            type="button"
            className="mod-btn mod-btn--outline"
            onClick={() => {
              setRejectError(null);
              setRejecting(true);
            }}
            disabled={decided || busy !== null}
          >
            Reject
          </button>
        </div>

        {rejecting ? (
          <RejectDialog
            noun={noun}
            submitting={busy === "reject"}
            error={rejectError}
            onCancel={() => setRejecting(false)}
            onSubmit={reject}
          />
        ) : null}
      </div>
    </>
  );
}
