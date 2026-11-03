// Report a concern — an unauthenticated public reporting page. B-284 (Decision Log #465) added the reason
// category step; Figma: "Report — Public page" frames 6947:39713 to 6947:40905
// (docs/figma-report-reason-categories.md). Before B-284 no Figma frame existed for this page, and the rest of
// the form (email, target, ID, the "involves a child" box) is unchanged from that plain build.
//
// Wiring: POST /reports/public (services/api/src/modules/moderation/
// public-reports.controller.ts — no guard at all besides its own rate
// limit; see api/moderation.ts's createPublicReport). This is the route
// a parent, a school, or anyone else with no Soccernity account uses to
// flag a post, comment, or account — including anything concerning a
// child's safety — without registering first.
//
// The category step is the same radio group the in-app report dialog uses (components/report/ReportFields.tsx,
// labels in lib/reportReasons.ts). A category is required; the description is optional except for "Other".
//
// `reporterContactName` is deliberately not collected — CreatePublicReportDto
// has no such field (see that DTO's own comment); this form only asks
// for what the backend actually accepts.
//
// Copy on this page is plain, ordinary product copy, written directly —
// per Temi's own call, this route has no legal-copy dependency and does
// not go through safeguarding-drafter. If Temi wants different wording,
// it's a direct edit to the strings below.
//
// Linked from the site footer (Footer.tsx) — the "help area" this task
// asked for; there is no separate help/support hub anywhere in this app
// to link from instead.
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  createPublicReport,
  REPORT_TARGET_TYPES,
  reportSubmitErrorMessage,
  type ReportReasonCategory,
  type ReportTargetType,
} from "../api/moderation";
import { ReportCategoryField, ReportDetailsField } from "../components/report/ReportFields";
import { canSubmitReport, detailsToSend } from "../lib/reportReasons";
import "./ReportPage.css";

const TARGET_TYPE_LABELS: Record<ReportTargetType, string> = {
  post: "A post",
  comment: "A comment",
  user: "A user account",
  banter_room: "A Bants room",
};

// Same real, confirmed support destination VerifyEmailPage.tsx already
// uses (Decision Log #37) — the fallback for a reporter who doesn't have
// an exact post/comment/account ID to paste in.
const SUPPORT_MAILTO_HREF = "mailto:support@soccernity.com?subject=Report%20a%20concern";

type Status = "idle" | "submitting" | "submitted" | "error";

export default function ReportPage() {
  const [email, setEmail] = useState("");
  const [targetType, setTargetType] = useState<ReportTargetType>("post");
  const [targetId, setTargetId] = useState("");
  const [category, setCategory] = useState<ReportReasonCategory | null>(null);
  const [details, setDetails] = useState("");
  const [concernsMinor, setConcernsMinor] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const canSubmit =
    email.trim().length > 0 &&
    targetId.trim().length > 0 &&
    canSubmitReport(category, details) &&
    status !== "submitting";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || category === null) return;
    setStatus("submitting");
    setError(null);
    try {
      await createPublicReport({
        reporterContactEmail: email.trim(),
        targetType,
        targetId: targetId.trim(),
        reasonCategory: category,
        reason: detailsToSend(details),
        concernsMinor,
      });
      setSubmittedEmail(email.trim());
      setStatus("submitted");
    } catch (err) {
      setStatus("error");
      setError(reportSubmitErrorMessage(err));
    }
  }

  if (status === "submitted") {
    return (
      <div className="report-page report-page--success">
        <span className="report-page__success-disc" aria-hidden="true">
          ✓
        </span>
        <h1 className="report-page__title">Report submitted</h1>
        <p className="report-page__lede">
          We&rsquo;ve sent a confirmation to <strong>{submittedEmail}</strong>. A member of our moderation team
          will review this report.
        </p>
        <Link to="/" className="report-page__btn report-page__btn--primary">
          Back to Soccernity
        </Link>
      </div>
    );
  }

  return (
    <form className="report-page" onSubmit={submit} noValidate>
      <div className="report-page__header">
        <h1 className="report-page__title">Report a concern</h1>
        <p className="report-page__lede">
          Use this form to flag a post, comment, or account on Soccernity — including anything that concerns
          the safety of a child. You don&rsquo;t need a Soccernity account to submit a report.
        </p>
      </div>

      <div className="report-page__card">
        <div className="report-page__field">
          <label className="report-page__label" htmlFor="report-email">
            Your email
          </label>
          <input
            id="report-email"
            className="report-page__input"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="report-page__hint">
            We&rsquo;ll send a confirmation here, and may follow up if we need more information.
          </p>
        </div>

        <div className="report-page__field">
          <label className="report-page__label" htmlFor="report-target-type">
            What are you reporting?
          </label>
          <select
            id="report-target-type"
            className="report-page__input report-page__select"
            value={targetType}
            onChange={(e) => setTargetType(e.target.value as ReportTargetType)}
          >
            {REPORT_TARGET_TYPES.map((type) => (
              <option key={type} value={type}>
                {TARGET_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        <div className="report-page__field">
          <label className="report-page__label" htmlFor="report-target-id">
            Where can we find it?
          </label>
          <input
            id="report-target-id"
            className="report-page__input"
            type="text"
            placeholder="Paste the ID of the post, comment, or profile"
            required
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          />
          <p className="report-page__hint">
            If you don&rsquo;t have the exact ID and can&rsquo;t find it, email us directly at{" "}
            <a href={SUPPORT_MAILTO_HREF}>support@soccernity.com</a> and describe what you saw instead.
          </p>
        </div>

        <ReportCategoryField value={category} onChange={setCategory} disabled={status === "submitting"} />

        <ReportDetailsField
          category={category}
          value={details}
          onChange={setDetails}
          placeholder="Describe what you saw and why it concerns you."
          disabled={status === "submitting"}
        />

        <label className="report-page__checkbox">
          <input
            type="checkbox"
            aria-label="This involves a child"
            checked={concernsMinor}
            onChange={(e) => setConcernsMinor(e.target.checked)}
          />
          <span className="report-page__checkbox-text">
            <span className="report-page__checkbox-title">This involves a child</span>
            <span className="report-page__checkbox-hint">
              Check this if the content or behaviour you&rsquo;re reporting concerns the safety of anyone under
              18.
            </span>
          </span>
        </label>
      </div>

      {error && (
        <p className="report-page__error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="report-page__btn report-page__btn--primary" disabled={!canSubmit}>
        {status === "submitting" ? "Submitting…" : "Submit report"}
      </button>
    </form>
  );
}
