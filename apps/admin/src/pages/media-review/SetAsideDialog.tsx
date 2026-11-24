// "Suspected illegal imagery" -- the confirmation dialog on the media-review item page (build-register B-206; backend
// PR #800, POST /admin/media-review/:id/suspected-illegal). Drawn as SA-1 to SA-5 (dialog states), with SA-6 to SA-8
// for what the page shows afterwards; it reuses the
// RecordAppealDialog / HoldDialog shell (mod-scrim, mod-dialog, useDialogFocus) and says plainly what will happen.
//
// The reason is required (10 to 500 characters, trimmed). Refusals are told apart by the server's stable `code`:
//  * 403 child_safety_vetting_required -> onRestricted (the page shows the existing restricted notice).
//  * 409 suspected_illegal_already_recorded -> a fixed line.
//  * any other 4xx -> the server's message; anything else a fixed line. The typed reason is kept after an error.
//
// WORDING is DEFAULT, founder-veto-able. The sentences that say what happens to the file, to the uploader or to
// retention were cleared by the founder's review of 2026-11-22 (R108), no counsel review needed (Decision Log #412 item 5, #497).
import { type FormEvent, useId, useRef, useState } from "react";
import { AdminApiError } from "../../api/adminClient";
import { isChildSafetyVettingRequiredError } from "../../api/moderation";
import { SET_ASIDE_REASON_MAX, describeWriteError, validateSetAsideReason } from "../../api/suspectedIllegal";
import { useDialogFocus } from "../moderation/HoldDialog";
import "../moderation/moderation.css";
import "./suspectedIllegal.css";

const FALLBACK_ERROR = "Couldn’t set this aside. Nothing was changed. Please try again.";

export default function SetAsideDialog({
  noun,
  onSubmit,
  onClose,
  onRestricted,
}: {
  /** "picture" or "video". */
  noun: string;
  /** Sends the trimmed reason. Rejects with the server's error. */
  onSubmit: (reason: string) => Promise<void>;
  onClose: () => void;
  onRestricted: () => void;
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const helpId = useId();
  const fieldId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  useDialogFocus(formRef, () => {
    if (!submitting) onClose();
  });

  const reasonError = touched ? validateSetAsideReason(reason) : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setTouched(true);
    if (validateSetAsideReason(reason) !== null) return;
    setSubmitting(true);
    try {
      await onSubmit(reason.trim());
    } catch (err) {
      setSubmitting(false);
      if (isChildSafetyVettingRequiredError(err)) {
        onRestricted();
        return;
      }
      const fallback = err instanceof AdminApiError && err.status >= 400 && err.status < 500 ? err.message : FALLBACK_ERROR;
      setError(describeWriteError(err, fallback));
    }
  }

  return (
    <div className="mod-scrim" role="presentation">
      <form
        ref={formRef}
        className="mod-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="mod-dialog__head">
          <h2 id={titleId}>Set this {noun} aside as suspected illegal imagery?</h2>
          <button type="button" className="mod-dialog__close" aria-label="Close" onClick={onClose} disabled={submitting}>
            ✕
          </button>
        </div>
        <div className="mod-dialog__body">
          {error ? (
            <p className="mod-callout-error" role="alert">
              {error}
            </p>
          ) : null}
          <p className="mod-dialog__text">This is what will happen when you confirm:</p>
          <ul className="si-consequences">
            <li>
              The {noun} is withdrawn from public view and rejected. The uploader sees the standard rejection message.

            </li>
            <li>
              The {noun} is kept for the set-aside period and is not deleted with the uploader’s account.
            </li>
            <li>
              Nothing is reported to anyone. A report to a receiving body is made outside Soccernity, and you record it
              afterwards.
            </li>
          </ul>
          <div className="mod-field">
            <label className="mod-dialog__label" htmlFor={fieldId}>
              Reason (required)
            </label>
            <textarea
              id={fieldId}
              className="mod-textarea mod-dialog__input"
              placeholder="Say why this is being set aside."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              onBlur={() => setTouched(true)}
              maxLength={SET_ASIDE_REASON_MAX}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={helpId}
              rows={4}
            />
            {reasonError ? (
              <p className="mod-dialog__field-error" role="alert">
                {reasonError}
              </p>
            ) : null}
          </div>
          <p className="mod-note" id={helpId}>
            10 to 500 characters. The reason is saved with the record and is never shown to the uploader.
          </p>
        </div>
        <div className="mod-dialog__actions">
          <button type="button" className="mod-btn mod-btn--neutral" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="mod-btn mod-btn--primary" disabled={submitting}>
            {submitting ? "Setting aside…" : "Confirm"}
          </button>
        </div>
      </form>
    </div>
  );
}
