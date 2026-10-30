// Report Detail for a report made by escalating a Contact Us enquiry (B-046 part B; Decision Log #444).
// Figma Admin Report Detail From Contact Enquiry 6878:31683. ReportDetailPage renders this in place of its own
// body when the report carries `source: "contact_enquiry"`.
//
// What it does not have, by design and by the server: no reported-user section and no hold actions (the report
// has no reported account, so a hold can never exist on it -- the server refuses both), and no appeal.
//
// Where the frame and the server differ (the server wins; listed in the PR):
//  * The frame's REPORT DETAILS card has "Escalated by <name>" and "Reason <the admin's reason>". The server
//    records neither on the report: the admin's reason goes to the audit record only, and
//    escalatedByAdminId is not set by an enquiry escalation. Those two rows are not drawn.
//  * Only "Dismiss Report" is drawn as an action. The server would accept the other report actions on an enquiry
//    report; offering only the drawn one is the frame's call and is flagged as undecided there.
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { AdminApiError } from "../../api/adminClient";
import { contactCategoryLabel } from "../../api/contactEnquiries";
import { actionReport, isChildSafetyVettingRequiredError, type Report } from "../../api/moderation";
import { KeyValue } from "./contactEnquiryShared";
import { formatDateTime, MinorFlagBadge, SeverityPill, VettingRestrictedNotice } from "./moderationShared";
import "./moderation.css";

export default function EnquiryReportView({ report }: { report: Report }) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [restricted, setRestricted] = useState(false);

  const enquiry = report.contactEnquiry;
  const alreadyReviewed = report.status !== "open";

  async function dismiss() {
    if (submitting) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await actionReport(report.id, "dismissed");
      navigate("/moderation");
    } catch (err) {
      if (isChildSafetyVettingRequiredError(err)) {
        setRestricted(true);
      } else {
        setActionError(err instanceof AdminApiError ? err.message : "Couldn’t record that action. Please try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <>
      <AdminPageHeader title={`Report #${report.id.slice(0, 8)}`} hideSearch />
      <div className="mod-page">
        <div className="mod-back">
          <Link to="/moderation">← Moderation Queue</Link>
        </div>

        <div className="ce-pills">
          <span className="mod-pill mod-pill--plain mod-pill--outline">From Contact Us</span>
          <span className={`mod-pill mod-pill--plain ${report.status === "open" ? "mod-pill--soft" : "mod-pill--strong"}`}>
            {report.status === "open" ? "Open" : report.status}
          </span>
        </div>

        <div className="ce-cards">
          <section className="mod-card" aria-label="Reported enquiry">
            <h2 className="mod-card__title">Reported enquiry</h2>
            <KeyValue label="Source">From Contact Us</KeyValue>
            {enquiry === undefined ? (
              <p className="mod-loading">Loading the enquiry…</p>
            ) : enquiry === null ? (
              <p className="mod-note">The enquiry this report came from couldn’t be loaded. It may have been deleted.</p>
            ) : (
              <>
                <KeyValue label="Category">{contactCategoryLabel(enquiry.category)}</KeyValue>
                <KeyValue label="Subject">{enquiry.subject}</KeyValue>
                <KeyValue label="Contact name">{enquiry.name}</KeyValue>
                <KeyValue label="Contact email">{enquiry.email}</KeyValue>
                <div className="ce-kv ce-kv--stacked">
                  <span className="ce-kv__label">Message</span>
                  <p className="ce-message">{enquiry.message}</p>
                </div>
              </>
            )}
          </section>
          <section className="mod-card" aria-label="Report details">
            <h2 className="mod-card__title">Report details</h2>
            <KeyValue label="Severity">
              <SeverityPill severity={report.severity} />
            </KeyValue>
            <KeyValue label="Concerns a minor">{report.concernsMinor ? <MinorFlagBadge /> : "No"}</KeyValue>
            <KeyValue label="Submitted">{formatDateTime(report.createdAt)}</KeyValue>
            <KeyValue label="Status">{report.status}</KeyValue>
          </section>
        </div>

        {restricted ? (
          <VettingRestrictedNotice />
        ) : (
          <section className="ce-actions" aria-label="Take action">
            <h2 className="mod-card__title">Take action</h2>
            {actionError ? (
              <p className="mod-error" role="alert">
                {actionError}
              </p>
            ) : null}
            {alreadyReviewed ? (
              <p className="mod-note">
                This report was already {report.status === "reviewed" ? "dismissed" : "actioned"}
                {report.reviewedAt ? ` on ${formatDateTime(report.reviewedAt)}` : ""}.
              </p>
            ) : null}
            <div className="mod-action-row">
              {alreadyReviewed ? null : (
                <button type="button" className="mod-btn mod-btn--primary" onClick={dismiss} disabled={submitting}>
                  {submitting ? "Saving…" : "Dismiss Report"}
                </button>
              )}
              <Link className="mod-btn mod-btn--outline" to={`/moderation/contact-enquiries/${report.targetId}`}>
                View enquiry #{report.targetId.slice(0, 8)}
              </Link>
            </div>
          </section>
        )}

        <div className="mod-callout">
          <span className="mod-callout__bar" aria-hidden />
          <p>
            This report came from a Contact Us enquiry. It has no reported account or content, so there are no
            account or hold actions.
          </p>
        </div>
      </div>
    </>
  );
}
