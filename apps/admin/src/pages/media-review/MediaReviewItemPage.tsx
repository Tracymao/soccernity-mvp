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
// Profile pictures and cover photos (B-037, Decision Log #468; Figma 6972:46346 avatar, 6972:46516 cover,
// 6972:46686 already decided, 6972:46863 / 6972:47057 / 6972:47248 reject dialogs): the same screen with a
// two-column body, the "Profile" used-in row, and one Callout in place of the automatic-check labels (the check
// does not store any for a profile picture). The server decides who may see an item: a minor's picture is
// answered with the same 404 as a missing one for an admin who is not child-safety vetted, and this page shows
// that 404 as the ordinary "not found" state, with no client-side filtering and no mention of vetting.
// A profile item decided with Approve or Reject is no longer in the queue, so GET answers 404 afterwards: this page
// therefore does not re-read it after a decision. It shows the outcome from the answer it already has, and a 409 from the server
// (someone decided first, or the picture left the queue) becomes the "Already decided" state. The frame says
// who decided and when ("Another moderator approved this ... 3 minutes ago"); the API says neither, so
// the text claims only what is known.
//
// Suspected illegal imagery (B-206; backend PR #800). A post or contest file also has a third action beside Approve and
// Reject: "Suspected illegal imagery" (drawn as the third button on the item frames, with the dialog and result states as SA-1 to SA-8, SA-1 7092:67168). It is offered only
// when the signed-in admin could use it: when the admin session is present and says the admin is NOT child-safety
// vetted, the button is not drawn at all. With no session provider (a test mounting the page alone) the server decides,
// and its coded 403 child_safety_vetting_required shows the existing restricted notice. Once a record exists the page
// shows its status and a link instead of the button. A profile picture or cover photo has it too (backend PR #806): the item leaves the queue the moment it is set aside,
// so the page keeps the record the answer returned and shows it with the decided state. The item stays READABLE
// afterwards (the server answers status "rejected", awaitingDecision false and the record), so a re-opened page shows
// the record callout with Approve and Reject disabled.
//
// Deviations from the frames, because the API does not provide the data: the "Reason given" sample on the
// user-report callout is not shown (reports carry no reason and never identify the reporter, only a count);
// category labels are the check's names only, without percentages.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { AdminApiError } from "../../api/adminClient";
import { useOptionalAdminAuth } from "../../auth/AdminAuthContext";
import {
  MEDIA_REVIEW_REJECT_REASON_MAX,
  approveMedia,
  getMediaReviewItem,
  isAlreadyDecided,
  isProfileItem,
  isProfileItemId,
  rejectMedia,
  type MediaReviewItem,
} from "../../api/mediaReview";
import { setAsideSuspectedIllegal, statusLabel } from "../../api/suspectedIllegal";
import { useDialogFocus } from "../moderation/HoldDialog";
import { VettingRestrictedNotice, formatDateTime } from "../moderation/moderationShared";
import { formatAge, itemTypeLabel, sourceLabel } from "./MediaReviewQueuePage";
import SetAsideDialog from "./SetAsideDialog";
import "./suspectedIllegal.css";
import "../moderation/moderation.css";
import "./mediaReview.css";

type Load = "loading" | "loaded" | "not-found" | "error";
/**
 * What a profile-picture decision left behind. Not read from the server (a decided profile item is gone from the
 * queue and answers 404): "approved" / "rejected" are this moderator's own decision; "conflict" is a 409.
 */
type ProfileOutcome = "approved" | "rejected" | "set_aside" | "conflict";

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
  const dialogRef = useRef<HTMLFormElement>(null);
  // Escape closes, except while a decision is being sent.
  useDialogFocus(dialogRef, () => {
    if (!submitting) onCancel();
  });
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
      <form ref={dialogRef} className="media-dialog" role="dialog" aria-modal="true" aria-labelledby="reject-title" onSubmit={submit}>
        <div className="media-dialog__head">
          <h2 id="reject-title" className="mod-card__title">
            Reject this {noun}?
          </h2>
          <button type="button" className="media-dialog__close" aria-label="Close" onClick={onCancel} disabled={submitting}>
            ×
          </button>
        </div>
        <p className="mod-note">Say why this {noun} is being rejected. The uploader sees this reason.</p>
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
        <p className="mod-note media-dialog__help">{`Up to ${MEDIA_REVIEW_REJECT_REASON_MAX} characters.`}</p>
        {missing ? (
          <p className="mod-error media-dialog__help media-dialog__error" role="alert">
            Enter a reason to continue.
          </p>
        ) : null}
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

/** A profile-picture decision the server refused because the item left the queue: 409 (decided, or not in the queue) or 404 (replaced). */
function decisionLeftQueue(err: unknown): boolean {
  return err instanceof AdminApiError && (err.status === 409 || err.status === 404);
}

function profileDecidedText(outcome: ProfileOutcome, noun: string): string {
  if (outcome === "approved") return `You approved this ${noun} just now. There is nothing more to do here.`;
  if (outcome === "rejected") return `You rejected this ${noun} just now. There is nothing more to do here.`;
  if (outcome === "set_aside")
    return `You set this ${noun} aside as suspected illegal imagery just now, which also rejected it. There is nothing more to do here.`;
  return `Another moderator already decided this ${noun}, or it is no longer waiting for review. There is nothing more to do here.`;
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
  const [profileOutcome, setProfileOutcome] = useState<ProfileOutcome | null>(null);
  const [settingAside, setSettingAside] = useState(false);
  const [restricted, setRestricted] = useState(false);
  // A profile item leaves the queue the moment it is set aside (it is rejected in the same step), so the page cannot
  // re-read its record; it keeps the one the set-aside answer returned.
  const [profileRecord, setProfileRecord] = useState<{ id: string; status: string } | null>(null);
  const alive = useRef(true);
  const auth = useOptionalAdminAuth();

  const fetchItem = useCallback(async () => {
    try {
      const fresh = await getMediaReviewItem(id);
      if (!alive.current) return;
      setItem(fresh);
      setLoad("loaded");
    } catch (err) {
      if (!alive.current) return;
      const notFound = err instanceof AdminApiError && err.status === 404;
      // A profile item that is no longer in the queue (decided, or replaced by a newer upload) answers 404: the
      // handed-over copy is stale, so it is dropped rather than shown as if it were still waiting.
      if (notFound && isProfileItemId(id)) setItem(null);
      setLoad(notFound ? "not-found" : "error");
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
        <AdminPageHeader title="Media review" />
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
        <AdminPageHeader title="Media review" />
        <div className="mod-page">
          {back}
          <div className="mod-card mod-card--restricted" role="alert">
            <h2 className="mod-card__title">{load === "not-found" ? "Item not found" : "Couldn’t load this item"}</h2>
            <p className="mod-note">
              {load === "not-found"
                ? isProfileItemId(id)
                  ? "It is not waiting for review. It may already have been decided, or replaced by a newer upload."
                  : "It is not in the review queue (it may never have needed review)."
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

  const profile = isProfileItem(item);
  const noun = profile ? itemTypeLabel(item).toLowerCase() : item.kind === "video" ? "video" : "picture";
  // A profile item set aside earlier is still readable (backend PR #806) but no longer waiting: the server answers
  // status "rejected" and awaitingDecision false, so a re-opened page is read-only like a decided post file.
  const decided = profile ? profileOutcome !== null || !item.awaitingDecision : !item.awaitingDecision;
  const reported = item.sources.includes("user_report") && item.reportCount > 0;
  // Offered only to an admin who could use it. A known-not-vetted admin never sees it (a missing or false flag reads
  // as not vetted, as the guardian-notices section does); with no session provider the server decides on press.
  const knownNotVetted = auth !== null && auth.admin?.childSafetyVetted !== true;
  const record = item.suspectedIllegalRecord ?? profileRecord ?? null;
  const canSetAside = !knownNotVetted && record === null && (!profile || profileOutcome === null);

  async function approve() {
    if (!item || busy) return;
    setBusy("approve");
    setActionError(null);
    try {
      const result = await approveMedia(item.id);
      setOutcome(result.outcome === "kept" ? "kept" : "approved");
      if (profile) setProfileOutcome("approved");
      else await fetchItem();
    } catch (err) {
      if (profile && decisionLeftQueue(err)) {
        // 409: decided by someone else, or no longer waiting. 404: replaced since it was shown.
        if (err instanceof AdminApiError && err.status === 404) {
          setItem(null);
          setLoad("not-found");
        } else setProfileOutcome("conflict");
      } else if (isAlreadyDecided(err)) await fetchItem();
      // The 503 "couldn't be published right now" keeps the item waiting: the message is the server's, and the
      // Approve button stays enabled so the moderator can simply try again.
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
      if (profile) setProfileOutcome("rejected");
      else await fetchItem();
    } catch (err) {
      if (profile && decisionLeftQueue(err)) {
        setRejecting(false);
        if (err instanceof AdminApiError && err.status === 404) {
          setItem(null);
          setLoad("not-found");
        } else setProfileOutcome("conflict");
      } else if (isAlreadyDecided(err)) {
        setRejecting(false);
        await fetchItem();
      } else {
        setRejectError(err instanceof AdminApiError ? err.message : "Couldn’t reject that. Please try again.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function setAside(reason: string) {
    if (!item) return;
    if (profile) {
      let created;
      try {
        created = await setAsideSuspectedIllegal(item.id, reason);
      } catch (err) {
        // 404: the picture was replaced (or decided) since it was shown. Nothing was set aside; show the stale state.
        if (err instanceof AdminApiError && err.status === 404) {
          setSettingAside(false);
          setItem(null);
          setLoad("not-found");
          return;
        }
        throw err;
      }
      setSettingAside(false);
      setProfileRecord({ id: created.id, status: created.status });
      setProfileOutcome("set_aside");
      return;
    }
    const created = await setAsideSuspectedIllegal(item.id, reason);
    // The file was rejected in the same step: re-read it so the page shows the decided state and the record.
    setSettingAside(false);
    setItem((prev) => (prev ? { ...prev, suspectedIllegalRecord: { id: created.id, status: created.status } } : prev));
    await fetchItem();
  }

  if (profile) {
    const shape = item.type === "profile_cover" ? "cover" : "avatar";
    return (
      <>
        <AdminPageHeader title={`Review ${noun}`} />
        <div className="mod-page media-item-page">
          {back}

          {profileOutcome ? (
            <div className="mod-callout" role="status" data-testid="profile-decided">
              <span className="mod-callout__bar" aria-hidden />
              <p>
                <strong>Already decided</strong>
                <br />
                {profileDecidedText(profileOutcome, noun)}
              </p>
            </div>
          ) : null}

          {record ? (
            <div className="mod-callout" role="status" data-testid="suspected-illegal-record">
              <span className="mod-callout__bar" aria-hidden />
              <p>
                <strong>Set aside as suspected illegal imagery.</strong> Status: {statusLabel(record.status)}.{" "}
                <Link className="mod-link" to={`/moderation/suspected-illegal/${encodeURIComponent(record.id)}`}>
                  Open the record
                </Link>
              </p>
            </div>
          ) : null}

          {restricted ? <VettingRestrictedNotice /> : null}

          <div className="media-profile-grid">
            <section className="mod-card media-preview" aria-label="Preview">
              <span className="mod-pill mod-pill--soft mod-pill--plain media-preview__tag">{itemTypeLabel(item)}</span>
              <div className={`media-profile-viewer media-profile-viewer--${shape}`} data-testid="media-viewer">
                {item.viewUrl ? (
                  <img src={item.viewUrl} alt={`The ${noun} under review`} />
                ) : (
                  <p className="mod-note">The preview link isn’t available right now. Reload this page to get a new one.</p>
                )}
              </div>
            </section>

            <section className="mod-card" aria-label="Details">
              <h2 className="mod-card__title">Details</h2>
              <div className="media-details media-details--stacked">
                <div className="mod-field media-details__row">
                  <span className="mod-field__label">Uploader</span>
                  <span className="mod-field__value">{item.uploader.publicName}</span>
                </div>
                <div className="mod-field media-details__row">
                  <span className="mod-field__label">Source</span>
                  <span className="mod-field__value">
                    <span className="mod-pill mod-pill--soft mod-pill--plain">{item.sources.map((s) => sourceLabel(s)).join(" + ") || "—"}</span>
                  </span>
                </div>
                <div className="mod-field media-details__row">
                  <span className="mod-field__label">Type</span>
                  <span className="mod-field__value">{itemTypeLabel(item)}</span>
                </div>
                <div className="mod-field media-details__row">
                  <span className="mod-field__label">Age</span>
                  <span className="mod-field__value">{formatAge(item.ageSeconds)}</span>
                </div>
                <div className="mod-field media-details__row">
                  <span className="mod-field__label">Used in</span>
                  <span className="mod-field__value">Profile</span>
                </div>
              </div>

              <div className="mod-callout">
                <span className="mod-callout__bar" aria-hidden />
                <p>The automatic check was unsure about this picture, or could not run. Look at the picture and decide.</p>
              </div>

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
                {canSetAside ? (
                  <button
                    type="button"
                    className="mod-btn mod-btn--outline"
                    onClick={() => setSettingAside(true)}
                    disabled={decided || busy !== null}
                  >
                    Suspected illegal imagery
                  </button>
                ) : null}
              </div>
            </section>
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

          {settingAside ? (
            <SetAsideDialog
              noun={noun}
              onSubmit={setAside}
              onClose={() => setSettingAside(false)}
              onRestricted={() => {
                setSettingAside(false);
                setRestricted(true);
                void auth?.refreshProfile();
              }}
            />
          ) : null}
        </div>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader title={`Review ${noun}`} />
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

        {record ? (
          <div className="mod-callout" role="status" data-testid="suspected-illegal-record">
            <span className="mod-callout__bar" aria-hidden />
            <p>
              <strong>Set aside as suspected illegal imagery.</strong> Status: {statusLabel(record.status)}.{" "}
              <Link className="mod-link" to={`/moderation/suspected-illegal/${encodeURIComponent(record.id)}`}>
                Open the record
              </Link>
            </p>
          </div>
        ) : null}

        {restricted ? <VettingRestrictedNotice /> : null}

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
                {itemTypeLabel(item)}
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
          <p className="mod-note">Labels come from the automatic check. They are a guide. The decision is yours.</p>
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
          {canSetAside ? (
            <button
              type="button"
              className="mod-btn mod-btn--outline"
              onClick={() => setSettingAside(true)}
              disabled={decided || busy !== null}
            >
              Suspected illegal imagery
            </button>
          ) : null}
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

        {settingAside ? (
          <SetAsideDialog
            noun={noun}
            onSubmit={setAside}
            onClose={() => setSettingAside(false)}
            onRestricted={() => {
              setSettingAside(false);
              setRestricted(true);
              // The vetting flag may have been withdrawn since the page loaded: re-read it so the button goes away.
              void auth?.refreshProfile();
            }}
          />
        ) : null}
      </div>
    </>
  );
}
