// "Escalate to a report" (B-046 part B; Decision Log #444, #445). Figma Admin Enquiry Detail Escalate Dialog
// 6879:31526 and its restricted state 6879:31599.
//
// The shared hold dialog (HoldDialog.tsx) with two more fields above the reason -- severity and "This concerns a
// minor" -- so the focus, Tab trap, Escape (not while saving), focus return, the 10-to-500-character reason and the
// server's own 4xx message inside the dialog are the same code the hold dialogs use. Focus lands on the first
// field (severity).
//
// A 403 child_safety_vetting_required (the server sends it only when "This concerns a minor" is ticked and the
// admin is not child-safety vetted) swaps the form for the restricted notice INSIDE the dialog, as the frame draws
// it, with a Close button.
import { useId, useRef, useState } from "react";
import {
  escalateContactEnquiry,
  type ContactEnquiryDetail,
  type EscalationResult,
} from "../../api/contactEnquiries";
import { REPORT_SEVERITIES, REPORT_SEVERITY_LABELS, type ReportSeverity } from "../../api/moderation";
import HoldDialog, { useDialogFocus } from "./HoldDialog";
import { VettingRestrictedNotice } from "./moderationShared";

function RestrictedDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, onClose);
  return (
    <div className="mod-scrim" role="presentation">
      <div ref={ref} className="mod-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="mod-dialog__head">
          <h2 id={titleId}>Escalate to a report</h2>
          <button type="button" className="mod-dialog__close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mod-dialog__body">
          <VettingRestrictedNotice />
        </div>
        <div className="mod-dialog__actions">
          <button type="button" className="mod-btn mod-btn--neutral" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EscalateEnquiryDialog({
  enquiry,
  onEscalated,
  onClose,
}: {
  enquiry: Pick<ContactEnquiryDetail, "id">;
  /** Called with the server's answer once the report exists; the parent closes the dialog. */
  onEscalated: (result: EscalationResult) => void;
  onClose: () => void;
}) {
  const [severity, setSeverity] = useState<ReportSeverity>("medium");
  const [concernsMinor, setConcernsMinor] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const severityId = useId();
  const severityHelpId = useId();
  const minorId = useId();
  const minorHelpId = useId();

  if (restricted) return <RestrictedDialog onClose={onClose} />;

  async function submit(reason: string) {
    const result = await escalateContactEnquiry(enquiry.id, { severity, concernsMinor, reason });
    onEscalated(result);
  }

  return (
    <HoldDialog
      title="Escalate to a report"
      intro={
        <>
          Enquiry #{enquiry.id.slice(0, 8)}. This creates a report in the Moderation Queue and links it to this
          enquiry.
        </>
      }
      extraFields={
        <>
          <div className="mod-field">
            <label className="mod-dialog__label" htmlFor={severityId}>
              Severity
            </label>
            <select
              id={severityId}
              className="mod-select"
              data-autofocus
              value={severity}
              onChange={(event) => setSeverity(event.target.value as ReportSeverity)}
              aria-describedby={severityHelpId}
            >
              {REPORT_SEVERITIES.map((value) => (
                <option key={value} value={value}>
                  {REPORT_SEVERITY_LABELS[value]}
                </option>
              ))}
            </select>
            <p className="mod-note" id={severityHelpId}>
              Low, medium, high or critical.
            </p>
          </div>
          <label className="mod-checkbox mod-checkbox--boxed" htmlFor={minorId}>
            <input
              id={minorId}
              type="checkbox"
              checked={concernsMinor}
              onChange={(event) => setConcernsMinor(event.target.checked)}
              aria-describedby={minorHelpId}
            />
            <span>
              <span className="mod-checkbox__title">This concerns a minor</span>
              <span className="mod-checkbox__help" id={minorHelpId}>
                Reports marked this way can only be opened by child-safety-vetted admins.
              </span>
            </span>
          </label>
        </>
      }
      reasonHelp="The reason is saved to the audit record. [COPY PENDING LEGAL REVIEW]"
      confirmLabel="Escalate to a report"
      submittingLabel="Escalating…"
      onSubmit={submit}
      onClose={onClose}
      onRestricted={() => setRestricted(true)}
    />
  );
}
