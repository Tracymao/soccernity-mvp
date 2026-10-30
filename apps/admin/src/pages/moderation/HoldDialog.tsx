// The confirmation dialog the two case-level hold actions share (B-045, Decision
// Log #398 D1, #403 item 8). Figma: Admin Report Detail Bad Faith Confirm
// 6672:27278 and Legal Hold Confirm 6672:27349 -- title, close button, divider,
// body, a required reason, Cancel and a primary button. Report Detail and Appeal
// Review use this same dialog (#403 item 8).
//
// Keyboard and focus: the dialog moves focus into itself when it opens, keeps Tab
// inside it, closes on Escape (not while a request is in flight) and gives focus
// back to the control that opened it when it closes.
import { type FormEvent, type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react";
import { AdminApiError } from "../../api/adminClient";
import { HOLD_REASON_MAX_LENGTH, HOLD_REASON_MIN_LENGTH, isChildSafetyVettingRequiredError } from "../../api/moderation";

const FALLBACK_ERROR = "Couldn’t record that action. Please try again.";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogFocus(containerRef: RefObject<HTMLElement | null>, onEscape: () => void) {
  // The latest onEscape, so the key listener below is attached once.
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = containerRef.current;
    // A control marked data-autofocus first (a dialog with fields above the reason, like Escalate
    // to a report, names its first field), else the reason field (it is what the admin has to
    // fill in), else the first control.
    const first =
      container?.querySelector<HTMLElement>("[data-autofocus]") ??
      container?.querySelector<HTMLElement>("textarea") ??
      container?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        escapeRef.current();
        return;
      }
      if (event.key !== "Tab" || !container) return;
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === firstItem || !container.contains(active))) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && (active === lastItem || !container.contains(active))) {
        event.preventDefault();
        firstItem.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [containerRef]);
}

export interface HoldDialogProps {
  title: string;
  /** The line under the title (carries the report number). */
  intro: ReactNode;
  /** Fields that sit between the intro and the reason (Escalate to a report: severity, minor flag). */
  extraFields?: ReactNode;
  /** The small line under the reason field. */
  reasonHelp: ReactNode;
  confirmLabel: string;
  submittingLabel: string;
  /** Sends the trimmed reason. Rejects with the server's error. */
  onSubmit: (reason: string) => Promise<void>;
  onClose: () => void;
  /** The server said the admin is not child-safety vetted. */
  onRestricted: () => void;
}

export default function HoldDialog({
  title,
  intro,
  extraFields,
  reasonHelp,
  confirmLabel,
  submittingLabel,
  onSubmit,
  onClose,
  onRestricted,
}: HoldDialogProps) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const helpId = useId();
  const dialogRef = useRef<HTMLFormElement>(null);

  useDialogFocus(dialogRef, () => {
    if (!submitting) onClose();
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const trimmed = reason.trim();
    if (trimmed.length < HOLD_REASON_MIN_LENGTH) {
      setReasonError(`Give a reason of at least ${HOLD_REASON_MIN_LENGTH} characters.`);
      return;
    }
    if (trimmed.length > HOLD_REASON_MAX_LENGTH) {
      setReasonError(`Keep the reason under ${HOLD_REASON_MAX_LENGTH} characters.`);
      return;
    }
    setReasonError(null);
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
    } catch (err) {
      setSubmitting(false);
      if (isChildSafetyVettingRequiredError(err)) {
        onRestricted();
        return;
      }
      // 4xx messages are specific and written for the admin ("This report was not
      // made by a signed-in account, so there is no account to hold."); anything
      // else gets the one fallback line the screens already use.
      setError(err instanceof AdminApiError && err.status >= 400 && err.status < 500 ? err.message : FALLBACK_ERROR);
    }
  }

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
          <h2 id={titleId}>{title}</h2>
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
          <p className="mod-dialog__text">{intro}</p>
          {extraFields}
          <div className="mod-field">
            <label className="mod-dialog__label" htmlFor={`${titleId}-reason`}>
              Reason (required)
            </label>
            <textarea
              id={`${titleId}-reason`}
              className="mod-textarea mod-dialog__input"
              placeholder="Enter the reason for this action."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={HOLD_REASON_MAX_LENGTH}
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
            {reasonHelp}
          </p>
        </div>
        <div className="mod-dialog__actions">
          <button type="button" className="mod-btn mod-btn--neutral" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="mod-btn mod-btn--primary" disabled={submitting}>
            {submitting ? submittingLabel : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
