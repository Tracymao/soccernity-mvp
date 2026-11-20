// "Record an appeal" -- staff record an appeal on a suspended person's behalf (build-register B-295; backend B-292,
// Decision Log #485 (f), #492). Figma 7044:62187 (default), 7044:62269 (reason required), 7044:62352 (window closed),
// 7044:62425 (child-safety vetting required).
//
// POST /admin/moderation/reports/:id/appeal { reason }. The server accepts a reason of 1 to 500 characters; the
// dialog stops an empty one first ("Enter a reason for the appeal.") and sends nothing. Refusals are told apart by
// the server's stable `code`, never its message text:
//  * 403 child_safety_vetting_required -> onRestricted (the page shows its restricted state, frame 7044:62425).
//  * 403 appeal_window_closed -> the server's own message in the dialog (frame 7044:62352). The window length is
//    configuration and is never printed here.
//  * any other 4xx (already appealed, staff_appeal_not_applicable, reported_account_unavailable) -> the server's
//    message; anything else a fixed line. The typed reason is kept after an error.
//
// WORDING. The two paragraphs and the audit-record line are the Figma wording. Each carries the literal tag
// [COPY PENDING LEGAL REVIEW] in the rendered text, with a row in docs/pending-copy-manifest.md (Decision Log #497,
// B-301). The same audit-record sentence is already tagged in holdActions.tsx.
import { type FormEvent, useId, useRef, useState } from "react";
import { AdminApiError } from "../../api/adminClient";
import { APPEAL_REASON_MAX_LENGTH, isChildSafetyVettingRequiredError } from "../../api/moderation";
import { useDialogFocus } from "./HoldDialog";

const FALLBACK_ERROR = "Couldn’t record the appeal. Please try again.";
export const APPEAL_REASON_REQUIRED_MESSAGE = "Enter a reason for the appeal.";

export default function RecordAppealDialog({
  reportNumber,
  onSubmit,
  onClose,
  onRestricted,
}: {
  /** The short report id the screens use in their headings. */
  reportNumber: string;
  /** Sends the trimmed reason. Rejects with the server's error. */
  onSubmit: (reason: string) => Promise<void>;
  onClose: () => void;
  onRestricted: () => void;
}) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const helpId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  useDialogFocus(formRef, () => {
    if (!submitting) onClose();
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setReasonError(true);
      return;
    }
    setReasonError(false);
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
    } catch (err) {
      setSubmitting(false);
      if (isChildSafetyVettingRequiredError(err)) {
        onRestricted();
        return;
      }
      setError(err instanceof AdminApiError && err.status >= 400 && err.status < 500 ? err.message : FALLBACK_ERROR);
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
          <h2 id={titleId}>Record an appeal</h2>
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
          <p className="mod-dialog__text">
            Record an appeal for the suspended person against the decision on Report #{reportNumber}. They can’t sign
            in, so staff record it for them. [COPY PENDING LEGAL REVIEW]
          </p>
          <p className="mod-dialog__text">
            This is only possible inside the appeal window, counted from the decision. Recording it pauses closure of
            this report until the appeal is decided. [COPY PENDING LEGAL REVIEW]
          </p>
          <div className="mod-field">
            <label className="mod-dialog__label" htmlFor={`${titleId}-reason`}>
              Reason (required)
            </label>
            <textarea
              id={`${titleId}-reason`}
              className="mod-textarea mod-dialog__input"
              placeholder="Enter the reason for this appeal."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={APPEAL_REASON_MAX_LENGTH}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={helpId}
              rows={4}
            />
            {reasonError ? (
              <p className="mod-dialog__field-error" role="alert">
                {APPEAL_REASON_REQUIRED_MESSAGE}
              </p>
            ) : null}
          </div>
          <p className="mod-note" id={helpId}>
            The reason is saved to the audit record. [COPY PENDING LEGAL REVIEW]
          </p>
        </div>
        <div className="mod-dialog__actions">
          <button type="button" className="mod-btn mod-btn--neutral" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="mod-btn mod-btn--primary" disabled={submitting}>
            {submitting ? "Recording…" : "Record appeal"}
          </button>
        </div>
      </form>
    </div>
  );
}
