// Report a concern — an unauthenticated public reporting page. No Figma
// frame exists anywhere in the file for this (checked before building):
// every existing report/flag surface (ReportAction.tsx, the file-wide
// text search that component's own header comment describes) is for a
// signed-in user reporting something they can already see inside the
// app. There is no public-facing "report abuse" screen anywhere in
// Figma. Built plainly and disclosed, following the exact same
// no-Figma-frame precedent ReportAction.tsx itself already set for the
// authenticated version of this feature.
//
// Wiring: POST /reports/public (services/api/src/modules/moderation/
// public-reports.controller.ts — no guard at all besides its own rate
// limit; see api/moderation.ts's createPublicReport). This is the route
// a parent, a school, or anyone else with no Soccernity account uses to
// flag a post, comment, or account — including anything concerning a
// child's safety — without registering first.
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
  ModerationApiError,
  REPORT_TARGET_TYPES,
  type ReportTargetType,
} from "../api/moderation";
import "./ReportPage.css";

const TARGET_TYPE_LABELS: Record<ReportTargetType, string> = {
  post: "A post",
  comment: "A comment",
  user: "A user account",
};

const REASON_MAX_LENGTH = 500;

// Same real, confirmed support destination VerifyEmailPage.tsx already
// uses (Decision Log #37) — the fallback for a reporter who doesn't have
// an exact post/comment/account ID to paste in.
const SUPPORT_MAILTO_HREF = "mailto:support@soccernity.com?subject=Report%20a%20concern";

type Status = "idle" | "submitting" | "submitted" | "error";

export default function ReportPage() {
  const [email, setEmail] = useState("");
  const [targetType, setTargetType] = useState<ReportTargetType>("post");
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [concernsMinor, setConcernsMinor] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const canSubmit =
    email.trim().length > 0 && targetId.trim().length > 0 && reason.trim().length > 0 && status !== "submitting";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setStatus("submitting");
    setError(null);
    try {
      await createPublicReport({
        reporterContactEmail: email.trim(),
        targetType,
        targetId: targetId.trim(),
        reason: reason.trim(),
        concernsMinor,
      });
      setSubmittedEmail(email.trim());
      setStatus("submitted");
    } catch (err) {
      setStatus("error");
      setError(err instanceof ModerationApiError ? err.message : "Couldn't submit that report. Please try again.");
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

        <div className="report-page__field">
          <label className="report-page__label" htmlFor="report-reason">
            Why are you reporting this?
          </label>
          <textarea
            id="report-reason"
            className="report-page__textarea"
            placeholder="Describe what you saw and why it concerns you."
            required
            maxLength={REASON_MAX_LENGTH}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

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
