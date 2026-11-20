// The decide dialog (B-139 part (c); Decision Log #467). Figma Admin Username Reviews Decide Dialog 6955:44021
// (Reinstate, valid reason), 6955:44629 (Decline, reason too short), 6955:44829 (Saving) and the error states
// 6955:45029 / 6955:45233 / 6955:45437 / 6955:45641 / 6955:45845.
//
// One dialog: a Reinstate / Decline choice, a required internal reason (10 to 500 characters, counter), a confirm
// button whose label follows the choice. Errors are branched on the server's error CODE, never on its message, and
// are shown inside the dialog with the typed reason kept.
//
// Where the frames and the server differ (the server wins):
//  * "Child-safety vetting needed" (6955:45641) has no server code: a minor's request that this admin may not see is
//    answered with the SAME 404 as a missing request, on purpose, so the two cannot be told apart. The 404 here
//    therefore says only that the request was not found.
//  * The wording for "the handle was taken by someone else" and "the account was deleted" is not drawn; plain
//    sentences in the same shape are used.
//
// Keyboard and focus: the shared useDialogFocus (HoldDialog.tsx) -- focus moves in on open (to the reason field),
// Tab stays inside, Escape closes (not while saving) and focus returns to the control that opened it.
import { type FormEvent, useId, useRef, useState } from "react";
import {
  USERNAME_REVIEW_HANDLE_UNAVAILABLE_CODE,
  USERNAME_REVIEW_NOT_FOUND_CODE,
  USERNAME_REVIEW_NOT_PENDING_CODE,
  USERNAME_REVIEW_OWN_REVOCATION_CODE,
  USERNAME_REVIEW_REASON_INVALID_CODE,
  USERNAME_REVIEW_REASON_MAX_LENGTH,
  USERNAME_REVIEW_REASON_MIN_LENGTH,
  USERNAME_REVIEW_USER_HAS_USERNAME_CODE,
  USERNAME_REVIEW_USER_UNAVAILABLE_CODE,
  decideUsernameReview,
  errorCode,
  type UsernameReviewDecision,
  type UsernameReviewDecisionResult,
  type UsernameReviewListItem,
} from "../../api/usernameReviews";
import { useDialogFocus } from "../moderation/HoldDialog";
import "../moderation/moderation.css";
import "./usernameReviews.css";

const REASON_TOO_SHORT = `Enter at least ${USERNAME_REVIEW_REASON_MIN_LENGTH} characters.`;

interface DialogError {
  title: string;
  body: string;
  /** The request has changed under the admin: closing the dialog should re-read it. */
  stale?: boolean;
}

function errorFor(code: string | null, request: UsernameReviewListItem): DialogError {
  switch (code) {
    case USERNAME_REVIEW_USER_HAS_USERNAME_CODE:
      return {
        title: "This request can’t be decided any more",
        body: `${request.userDisplayName} has already chosen a new username, so @${request.removedUsername} can’t be reinstated.`,
      };
    case USERNAME_REVIEW_OWN_REVOCATION_CODE:
      return {
        title: "You can’t decide this request",
        body: "You removed this username. Another moderator or superadmin has to decide it.",
      };
    case USERNAME_REVIEW_NOT_PENDING_CODE:
      return {
        title: "This request was already decided",
        body: "Another admin has decided it. Close this dialog to see the result.",
        stale: true,
      };
    case USERNAME_REVIEW_HANDLE_UNAVAILABLE_CODE:
      return {
        title: "This username can’t be restored",
        body: `@${request.removedUsername} is no longer available to restore.`,
      };
    case USERNAME_REVIEW_USER_UNAVAILABLE_CODE:
      return {
        title: "This account has been deleted",
        body: "There is nothing to reinstate.",
        stale: true,
      };
    case USERNAME_REVIEW_NOT_FOUND_CODE:
      return {
        title: "This request was not found",
        body: "It may have been removed. Close this dialog and go back to the list.",
        stale: true,
      };
    default:
      return { title: "Couldn’t save the decision", body: "Try again. If it keeps failing, check the connection." };
  }
}

export interface DecideDialogProps {
  request: UsernameReviewListItem;
  /** The choice that is selected when the dialog opens (the button the admin pressed). */
  initialDecision: UsernameReviewDecision;
  /** The decision was saved. */
  onDecided: (result: UsernameReviewDecisionResult, decision: UsernameReviewDecision) => void;
  /** The dialog closed without a saved decision. `stale` = an error said the request has changed. */
  onClose: (stale: boolean) => void;
}

export default function DecideDialog({ request, initialDecision, onDecided, onClose }: DecideDialogProps) {
  const [decision, setDecision] = useState<UsernameReviewDecision>(initialDecision);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<DialogError | null>(null);
  const titleId = useId();
  const helpId = useId();
  const dialogRef = useRef<HTMLFormElement>(null);

  const close = () => onClose(error?.stale === true);
  useDialogFocus(dialogRef, () => {
    if (!submitting) close();
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    if (reason.trim().length < USERNAME_REVIEW_REASON_MIN_LENGTH) {
      setReasonError(REASON_TOO_SHORT);
      return;
    }
    setReasonError(null);
    setSubmitting(true);
    try {
      const result = await decideUsernameReview(request.id, { decision, reason: reason.trim() });
      onDecided(result, decision);
    } catch (err) {
      setSubmitting(false);
      const code = errorCode(err);
      if (code === USERNAME_REVIEW_REASON_INVALID_CODE) {
        setReasonError(REASON_TOO_SHORT);
        return;
      }
      setError(errorFor(code, request));
    }
  }

  const confirmLabel = decision === "reinstate" ? "Reinstate username" : "Decline request";

  return (
    <div className="mod-scrim" role="presentation">
      <form
        ref={dialogRef}
        className="mod-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="mod-dialog__head">
          <h2 id={titleId}>Decide on this request</h2>
          <button type="button" className="mod-dialog__close" aria-label="Close" onClick={close} disabled={submitting}>
            ✕
          </button>
        </div>
        <div className="mod-dialog__body">
          <p className="mod-dialog__text">
            {request.userDisplayName} asked for a review of the removal of @{request.removedUsername}. A decision is final
            and there is no second review.
          </p>

          <div role="radiogroup" aria-label="Decision" className="ur-options">
            <label className={`ur-option${decision === "reinstate" ? " ur-option--selected" : ""}`}>
              <input
                type="radio"
                name={`${titleId}-decision`}
                value="reinstate"
                checked={decision === "reinstate"}
                onChange={() => setDecision("reinstate")}
                disabled={submitting}
              />
              <span className="ur-option__text">
                <span className="ur-option__title">Reinstate</span>
                <span className="ur-option__help">The old username comes back and the removal record is deleted.</span>
              </span>
            </label>
            <label className={`ur-option${decision === "decline" ? " ur-option--selected" : ""}`}>
              <input
                type="radio"
                name={`${titleId}-decision`}
                value="decline"
                checked={decision === "decline"}
                onChange={() => setDecision("decline")}
                disabled={submitting}
              />
              <span className="ur-option__text">
                <span className="ur-option__title">Decline</span>
                <span className="ur-option__help">The username stays removed and the person cannot choose it again.</span>
              </span>
            </label>
          </div>

          <div className="mod-field">
            <label className="mod-dialog__label" htmlFor={`${titleId}-reason`}>
              Reason (internal, required)
            </label>
            <textarea
              id={`${titleId}-reason`}
              className="mod-textarea mod-dialog__input"
              placeholder="Enter the reason for this decision."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={USERNAME_REVIEW_REASON_MAX_LENGTH}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={helpId}
              rows={4}
              disabled={submitting}
            />
            {reasonError ? (
              <p className="mod-dialog__field-error" role="alert">
                {reasonError}
              </p>
            ) : null}
          </div>
          <div className="ur-hint-row">
            <p className="mod-note" id={helpId}>
              Internal. Saved to the audit record. At least {USERNAME_REVIEW_REASON_MIN_LENGTH} characters.
            </p>
            <span className="mod-note" aria-label="Characters used">
              {reason.length} / {USERNAME_REVIEW_REASON_MAX_LENGTH}
            </span>
          </div>

          {error ? (
            <div className="mod-callout mod-callout--alert" role="alert">
              <span className="mod-callout__bar" aria-hidden />
              <div>
                <p className="ce-banner__title">{error.title}</p>
                <p>{error.body}</p>
              </div>
            </div>
          ) : null}
        </div>
        <div className="mod-dialog__actions">
          <button type="button" className="mod-btn mod-btn--neutral" onClick={close} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="mod-btn mod-btn--primary" disabled={submitting}>
            {submitting ? "Saving…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
