// Enquiry Detail (B-046 part B; Decision Log #444, #445). Figma Admin Enquiry Detail 6878:31198, Escalated
// 6878:31438, Escalate dialog 6879:31526 / 6879:31599. Route /moderation/contact-enquiries/:id.
//
// Real data: GET /admin/contact-enquiries/:id, PATCH .../handled, POST .../escalate (moderator / superadmin).
//
// Actions: "Reply by email" is a plain mailto link to the sender's address (the console sends and stores
// nothing, and no reply is promised anywhere); "Mark handled" / "Reopen" toggles one status; "Escalate to a
// report" opens the dialog (EscalateEnquiryDialog.tsx) and, once done, the page shows the escalated state with a
// link to the report.
//
// The enquiry number in the title is the first 8 characters of its id, the way Report Detail shows report ids
// (the frames' "#318" is a sample).
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { AdminApiError } from "../../api/adminClient";
import {
  contactCategoryLabel,
  getContactEnquiry,
  setContactEnquiryHandled,
  type ContactEnquiryDetail,
  type EscalationResult,
} from "../../api/contactEnquiries";
import { EnquiryStatusPill, KeyValue, submitterLabel } from "./contactEnquiryShared";
import EscalateEnquiryDialog from "./EscalateEnquiryDialog";
import { formatShortDate } from "./moderationShared";
import "./moderation.css";

type LoadState = "loading" | "loaded" | "not-found" | "error";

const BACK_LINK = (
  <div className="mod-back">
    <Link to="/moderation/contact-enquiries">← Contact enquiries</Link>
  </div>
);

export default function ContactEnquiryDetailPage() {
  const { id = "" } = useParams();
  const [enquiry, setEnquiry] = useState<ContactEnquiryDetail | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [escalating, setEscalating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    getContactEnquiry(id)
      .then((found) => {
        if (cancelled) return;
        setEnquiry(found);
        setLoadState("loaded");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadState(err instanceof AdminApiError && err.status === 404 ? "not-found" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadState === "loading") {
    return (
      <>
        <AdminPageHeader title="Enquiry" hideSearch />
        <div className="mod-page">
          {BACK_LINK}
          <p className="mod-loading">Loading the enquiry…</p>
        </div>
      </>
    );
  }

  if (loadState !== "loaded" || !enquiry) {
    return (
      <>
        <AdminPageHeader title="Enquiry" hideSearch />
        <div className="mod-page">
          {BACK_LINK}
          <div className="mod-card">
            <h2 className="mod-card__title">Enquiry not found</h2>
            <p className="mod-note">
              {loadState === "error"
                ? "Couldn’t load this enquiry. Please try again from the list."
                : "No enquiry exists with this id. It may have been deleted after 12 months."}
            </p>
            <div className="mod-action-row">
              <Link className="mod-btn mod-btn--primary" to="/moderation/contact-enquiries">
                Back to contact enquiries
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  const handled = enquiry.status === "handled";
  const escalatedReportId = enquiry.escalatedReportId;

  async function toggleHandled() {
    if (!enquiry || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      setEnquiry(await setContactEnquiryHandled(enquiry.id, !handled));
    } catch (err) {
      setActionError(err instanceof AdminApiError ? err.message : "Couldn’t save that change. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleEscalated(result: EscalationResult) {
    setEnquiry(result.enquiry);
    setEscalating(false);
  }

  return (
    <>
      <AdminPageHeader title={`Enquiry #${enquiry.id.slice(0, 8)}`} hideSearch />
      <div className="mod-page">
        {BACK_LINK}

        <div className="ce-pills">
          <EnquiryStatusPill status={enquiry.status} />
          {escalatedReportId ? <span className="mod-pill mod-pill--plain mod-pill--outline">Escalated</span> : null}
        </div>

        <div className="ce-cards">
          <section className="mod-card" aria-label="Enquiry">
            <h2 className="mod-card__title">Enquiry</h2>
            <KeyValue label="Name">{enquiry.name}</KeyValue>
            <KeyValue label="Email">{enquiry.email}</KeyValue>
            <KeyValue label="Category">{contactCategoryLabel(enquiry.category)}</KeyValue>
            <KeyValue label="Subject">{enquiry.subject}</KeyValue>
            <KeyValue label="Received">{formatShortDate(enquiry.createdAt)}</KeyValue>
            <KeyValue label="Source">{submitterLabel(enquiry.submitter)}</KeyValue>
            {escalatedReportId ? <KeyValue label="Report">#{escalatedReportId.slice(0, 8)}</KeyValue> : null}
          </section>
          <section className="mod-card" aria-label="Message">
            <h2 className="mod-card__title">Message</h2>
            <p className="ce-message">{enquiry.message}</p>
          </section>
        </div>

        <section className="ce-actions" aria-label="Actions">
          <h2 className="mod-card__title">Actions</h2>
          {actionError ? (
            <p className="mod-error" role="alert">
              {actionError}
            </p>
          ) : null}
          <div className="mod-action-row">
            <a className="mod-btn mod-btn--primary" href={`mailto:${enquiry.email}`}>
              Reply by email
            </a>
            <button type="button" className="mod-btn mod-btn--outline" onClick={toggleHandled} disabled={saving}>
              {saving ? "Saving…" : handled ? "Reopen" : "Mark handled"}
            </button>
            {escalatedReportId ? (
              <Link className="mod-btn mod-btn--outline" to={`/moderation/reports/${escalatedReportId}`}>
                View report #{escalatedReportId.slice(0, 8)}
              </Link>
            ) : (
              <button type="button" className="mod-btn mod-btn--outline" onClick={() => setEscalating(true)}>
                Escalate to a report
              </button>
            )}
          </div>
          <p className="mod-note">Reply by email opens your email app with the sender’s address filled in.</p>
        </section>

        <div className="mod-callout">
          <span className="mod-callout__bar" aria-hidden />
          <p>
            {escalatedReportId ? (
              <>
                Escalated to report #{escalatedReportId.slice(0, 8)}. That report’s retention applies instead of the
                12-month deletion. [COPY PENDING LEGAL REVIEW]
              </>
            ) : (
              <>
                Enquiries are deleted automatically 12 months after the last message. If you escalate one, the
                report’s retention applies instead. [COPY PENDING LEGAL REVIEW]
              </>
            )}
          </p>
        </div>

        {escalating ? (
          <EscalateEnquiryDialog enquiry={enquiry} onEscalated={handleEscalated} onClose={() => setEscalating(false)} />
        ) : null}
      </div>
    </>
  );
}
