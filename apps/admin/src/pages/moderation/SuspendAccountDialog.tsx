// "Suspend this account?" -- the confirmation dialog for a suspension, used by Report Detail (Suspend User, Figma
// 7042:61845) and by the user page and the Users list (Suspend account, Figma 7045:63231 / 7045:63341 / 7045:63452).
// build-register B-295, Decision Log #485.
//
// Two modes, one dialog:
//  * "report": the suspension is recorded as the action of a report, so the email's reason comes from that report's
//    own category and the dialog asks nothing more. onSubmit() takes no argument.
//  * "user": there is no report, so the admin picks one of the nine reason categories (required, a radio list). The
//    API refuses a suspension without it (400 suspension_reason_category_required); the dialog stops an empty choice
//    first ("Choose a reason category.") and sends nothing.
//
// Keyboard and focus are the shared useDialogFocus behaviour (HoldDialog.tsx): focus goes into the dialog, Tab stays
// inside, Escape closes (not while a request is running) and focus returns to the control that opened it.
//
// Errors: the server's child-safety-vetting 403 hands over to onRestricted (the page shows its restricted state);
// any other 4xx shows the server's own message in the dialog; anything else a fixed line. The chosen category is kept
// after an error.
//
// WORDING. Every sentence in the consequence list and the category help line is the wording of the Figma frames and
// carries the literal tag [COPY PENDING LEGAL REVIEW] in the rendered string, with one row per sentence in
// docs/pending-copy-manifest.md (Decision Log #497, B-301). The tag is a suffix on the sentence, as in holdActions.tsx.
// npm run check:pending-copy fails until counsel clears them.
import { type FormEvent, useId, useRef, useState } from "react";
import { AdminApiError } from "../../api/adminClient";
import {
  isChildSafetyVettingRequiredError,
  REPORT_REASON_CATEGORIES,
  REPORT_REASON_CATEGORY_LABELS,
} from "../../api/moderation";
import { useDialogFocus } from "./HoldDialog";

const FALLBACK_ERROR = "Couldn’t suspend this account. Please try again.";

// Tagged: each sentence ends with the literal tag. Figma 7042:61915 (report) and 7045:63231 (user page).
const BULLET_SIGN_IN = "They can’t sign in, and every session they have ends now. [COPY PENDING LEGAL REVIEW]";
const BULLET_POINTS = "Engagement points they earned from views, likes and comments are removed. [COPY PENDING LEGAL REVIEW]";
const BULLET_GUARDIAN = "If they are under 18, their guardian is told once. [COPY PENDING LEGAL REVIEW]";
const BULLET_EMAIL_REPORT =
  "They are emailed straight away with a short reason based on this report’s category, and told how to appeal through the Contact Us page. For Child safety concern, Other, or no category the reason is “breaching our community rules”. The email names no reporter and no duration. [COPY PENDING LEGAL REVIEW]";
const BULLET_EMAIL_USER =
  "They are emailed straight away with a short reason based on the category you choose, and told how to appeal through the Contact Us page. The email names no reporter and no duration. [COPY PENDING LEGAL REVIEW]";
const BULLET_OVERTURNED = "If an appeal against this report is overturned, the account is reinstated automatically. [COPY PENDING LEGAL REVIEW]";
const BULLET_USER_APPEALS =
  "A moderator reviews appeals sent through Contact Us and can reinstate the account from this page. [COPY PENDING LEGAL REVIEW]";
const CATEGORY_HELP =
  "The email gives a short reason based on this choice. For Child safety concern and Other it says “breaching our community rules”. [COPY PENDING LEGAL REVIEW]";

export const SUSPEND_CATEGORY_REQUIRED_MESSAGE = "Choose a reason category.";

export type SuspendDialogMode = "report" | "user";

export default function SuspendAccountDialog({
  mode,
  lead,
  onSubmit,
  onClose,
  onRestricted,
}: {
  mode: SuspendDialogMode;
  /** The first paragraph, which names who is being suspended. */
  lead: string;
  /** Sends the suspension. "user" mode passes the chosen category; "report" mode passes nothing. Rejects with the server's error. */
  onSubmit: (reasonCategory?: string) => Promise<void>;
  onClose: () => void;
  /** The server said the admin is not child-safety vetted. */
  onRestricted?: () => void;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const helpId = useId();
  const nameId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  useDialogFocus(formRef, () => {
    if (!submitting) onClose();
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    if (mode === "user" && !category) {
      setCategoryError(true);
      return;
    }
    setCategoryError(false);
    setSubmitting(true);
    try {
      await onSubmit(mode === "user" ? (category ?? undefined) : undefined);
    } catch (err) {
      setSubmitting(false);
      if (isChildSafetyVettingRequiredError(err) && onRestricted) {
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
          <h2 id={titleId}>Suspend this account?</h2>
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
          <p className="mod-dialog__text">{lead}</p>
          <ul className="mod-dialog__list">
            <li>{BULLET_SIGN_IN}</li>
            <li>{BULLET_POINTS}</li>
            <li>{BULLET_GUARDIAN}</li>
            <li>{mode === "report" ? BULLET_EMAIL_REPORT : BULLET_EMAIL_USER}</li>
            <li>{mode === "report" ? BULLET_OVERTURNED : BULLET_USER_APPEALS}</li>
          </ul>

          {mode === "user" ? (
            <fieldset className="mod-radio-group" aria-describedby={helpId}>
              <legend className="mod-dialog__label">Reason category (required)</legend>
              <div className={`mod-radio-list${categoryError ? " mod-radio-list--invalid" : ""}`}>
                {REPORT_REASON_CATEGORIES.map((key) => (
                  <label className="mod-radio" key={key}>
                    <input
                      type="radio"
                      name={nameId}
                      value={key}
                      checked={category === key}
                      disabled={submitting}
                      onChange={() => {
                        setCategory(key);
                        setCategoryError(false);
                      }}
                    />
                    <span>{REPORT_REASON_CATEGORY_LABELS[key]}</span>
                  </label>
                ))}
              </div>
              {categoryError ? (
                <p className="mod-dialog__field-error" role="alert">
                  {SUSPEND_CATEGORY_REQUIRED_MESSAGE}
                </p>
              ) : null}
              <p className="mod-note" id={helpId}>
                {CATEGORY_HELP}
              </p>
            </fieldset>
          ) : null}
        </div>
        <div className="mod-dialog__actions">
          <button type="button" className="mod-btn mod-btn--neutral" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="mod-btn mod-btn--primary" disabled={submitting}>
            {submitting ? "Suspending…" : "Suspend account"}
          </button>
        </div>
      </form>
    </div>
  );
}
