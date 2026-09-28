// Appeal Review — Figma node 5796:8753.
//
// Real data: PATCH /admin/moderation/reports/:id/appeal (Build Plan
// Section 4.8/8.4, Decision Log #135/#189/#138, built by
// sprint-5/admin-moderation-queue-backend). Decision Log #138 is
// hard-enforced server-side: the admin who actioned the original report
// gets a real 403 if they try to decide its own appeal — this screen
// surfaces that message verbatim rather than re-deriving the rule
// client-side. Reached from ModerationQueuePage's "Review" link (Appeals
// tab), which passes the row's own already-fetched Report via router
// `state`; a direct visit / refresh now calls the real
// GET /admin/moderation/reports/:id (api/moderation.ts's getReportById)
// instead of the old bounded-list-scan findReportById fallback — the same
// wiring ReportDetailPage.tsx already got.
//
// schema/report-severity-escalation-admin-vetting-application: same
// severity/concernsMinor display + child-safety-vetting-restricted state
// as ReportDetailPage.tsx — see that file's own header comment for why a
// concernsMinor report can still reach this screen directly even though
// the queue's own list filtering already keeps a non-vetted admin from
// ever clicking "Review" on one. Because getReportById itself 403s
// (CHILD_SAFETY_VETTING_REQUIRED_CODE) on direct access to a
// concernsMinor report, the initial load here now renders the same
// dedicated restricted state as ReportDetailPage.tsx, not a misleading
// "not found".
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { AdminApiError } from "../../api/adminClient";
import {
  decideAppeal,
  getReportById,
  isChildSafetyVettingRequiredError,
  REPORT_ACTION_LABELS,
  type AppealDecision,
  type Report,
  type ReportAction,
} from "../../api/moderation";
import {
  EscalateReportCard,
  formatDateTime,
  MinorFlagBadge,
  SeverityPill,
  VettingRestrictedNotice,
} from "./moderationShared";
import "./moderation.css";

type LoadState = "loading" | "loaded" | "not-found" | "restricted" | "error";

export default function AppealReviewPage() {
  const { id = "" } = useParams();
  const location = useLocation() as { state?: { report?: Report } };
  const navigate = useNavigate();

  const [report, setReport] = useState<Report | null>(location.state?.report ?? null);
  const [loadState, setLoadState] = useState<LoadState>(report ? "loaded" : "loading");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionRestricted, setActionRestricted] = useState(false);
  const [submitting, setSubmitting] = useState<AppealDecision | null>(null);

  useEffect(() => {
    if (report) return;
    let cancelled = false;
    getReportById(id)
      .then((found) => {
        if (cancelled) return;
        setReport(found);
        setLoadState("loaded");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (isChildSafetyVettingRequiredError(err)) {
          setLoadState("restricted");
        } else if (err instanceof AdminApiError && err.status === 404) {
          setLoadState("not-found");
        } else {
          setLoadState("error");
        }
      });
    return () => {
      cancelled = true;
    };
    // Only re-runs if `id` changes -- `report` is intentionally excluded so
    // a successful decide/escalate action's optimistic update above doesn't
    // refetch (matches ReportDetailPage.tsx's own effect).
  }, [id]);

  const backLink = (
    <div className="mod-back">
      <Link to="/moderation">← Moderation Queue</Link>
    </div>
  );

  async function handleDecide(decision: AppealDecision) {
    if (submitting) return;
    setSubmitting(decision);
    setActionError(null);
    try {
      await decideAppeal(id, decision);
      navigate("/moderation");
    } catch (err) {
      if (isChildSafetyVettingRequiredError(err)) {
        setActionRestricted(true);
      } else {
        setActionError(
          err instanceof AdminApiError ? err.message : "Couldn’t record that decision. Please try again.",
        );
      }
      setSubmitting(null);
    }
  }

  if (loadState === "loading") {
    return (
      <>
        <AdminPageHeader title="Appeal" hideSearch />
        <div className="mod-page">
          {backLink}
          <p className="mod-loading">Loading the appeal…</p>
        </div>
      </>
    );
  }

  if (loadState === "restricted") {
    return (
      <>
        <AdminPageHeader title="Appeal" hideSearch />
        <div className="mod-page">
          {backLink}
          <VettingRestrictedNotice />
        </div>
      </>
    );
  }

  if (loadState === "not-found" || loadState === "error" || !report) {
    return (
      <>
        <AdminPageHeader title="Appeal" hideSearch />
        <div className="mod-page">
          {backLink}
          <div className="mod-card">
            <h2 className="mod-card__title">Appeal not found</h2>
            <p className="mod-note">
              {loadState === "error"
                ? "Couldn’t load this appeal. Please try again from the queue."
                : "No report exists with this id — open it directly from the Moderation Queue’s Appeals tab instead of a bookmarked link."}
            </p>
            <div className="mod-action-row">
              <Link className="mod-btn mod-btn--primary" to="/moderation">
                Back to Moderation Queue
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (report.appealStatus !== "pending") {
    return (
      <>
        <AdminPageHeader title={`Appeal — Report #${report.id.slice(0, 8)}`} hideSearch />
        <div className="mod-page">
          {backLink}
          <div className="mod-card">
            <h2 className="mod-card__title">No pending appeal</h2>
            <p className="mod-note">
              {report.appealStatus
                ? `This report's appeal was already decided (${report.appealStatus}).`
                : "This report has no appeal filed against it."}
            </p>
            <div className="mod-field">
              <span className="mod-field__label">Severity</span>
              <span className="mod-field__value">
                <SeverityPill severity={report.severity} />
              </span>
            </div>
            <div className="mod-field">
              <span className="mod-field__label">Concerns a minor</span>
              <span className="mod-field__value">
                {report.concernsMinor ? <MinorFlagBadge /> : "No"}
              </span>
            </div>
          </div>
          <EscalateReportCard report={report} onEscalated={setReport} />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader title={`Appeal — Report #${report.id.slice(0, 8)}`} hideSearch />
      <div className="mod-page">
        {backLink}

        <p className="mod-note">
          You are reviewing this appeal because a <strong>different</strong> admin or moderator
          actioned the original report (Decision Log #138) — the backend rejects this decision
          outright if you were that reviewer. The outcome is final, and the reported user is
          notified.
        </p>

        <div className="mod-card">
          <h2 className="mod-card__title">Original decision (read-only)</h2>
          <div className="mod-field">
            <span className="mod-field__label">Reviewed by (admin id)</span>
            <span className="mod-field__value">{report.reviewedByAdminId ?? "—"}</span>
          </div>
          <div className="mod-field">
            <span className="mod-field__label">Action taken</span>
            <span className="mod-field__value">
              {report.actionTaken
                ? REPORT_ACTION_LABELS[report.actionTaken as ReportAction] ?? report.actionTaken
                : "—"}
            </span>
          </div>
          <div className="mod-field">
            <span className="mod-field__label">Decided</span>
            <span className="mod-field__value">{formatDateTime(report.reviewedAt)}</span>
          </div>
          <div className="mod-field">
            <span className="mod-field__label">Original report reason</span>
            <span className="mod-field__value">{report.reason}</span>
          </div>
          <div className="mod-field">
            <span className="mod-field__label">Severity</span>
            <span className="mod-field__value">
              <SeverityPill severity={report.severity} />
            </span>
          </div>
          <div className="mod-field">
            <span className="mod-field__label">Concerns a minor</span>
            <span className="mod-field__value">
              {report.concernsMinor ? <MinorFlagBadge /> : "No"}
            </span>
          </div>
        </div>

        <div className="mod-card">
          <h2 className="mod-card__title">Appeal submitted by the reported user</h2>
          <p className="mod-note">
            The reported user&rsquo;s own identity isn&rsquo;t part of this response — `Report` has
            no denormalized reported-user column (it&rsquo;s resolved dynamically depending on
            <code> targetType</code>, see the moderation module&rsquo;s README).
          </p>
          <div className="mod-field">
            <span className="mod-field__label">Appeal reason</span>
            <span className="mod-field__value">{report.appealReason ?? "—"}</span>
          </div>
          <div className="mod-field">
            <span className="mod-field__label">Submitted</span>
            <span className="mod-field__value">{formatDateTime(report.appealedAt)}</span>
          </div>
        </div>

        {actionRestricted ? (
          <VettingRestrictedNotice />
        ) : (
          <div className="mod-card">
            <h2 className="mod-card__title">Decide the appeal</h2>
            {report.concernsMinor ? (
              <p className="mod-note">
                This report concerns a minor — deciding its appeal requires a child-safety-vetted
                admin (Settings › Roles).
              </p>
            ) : null}
            {actionError ? (
              <p className="mod-error" role="alert">
                {actionError}
              </p>
            ) : null}
            <div className="mod-action-row">
              <button
                type="button"
                className="mod-btn mod-btn--outline"
                onClick={() => handleDecide("upheld")}
                disabled={submitting !== null}
              >
                {submitting === "upheld" ? "Saving…" : "Uphold Original Decision"}
              </button>
              <button
                type="button"
                className="mod-btn mod-btn--primary"
                onClick={() => handleDecide("overturned")}
                disabled={submitting !== null}
              >
                {submitting === "overturned" ? "Saving…" : "Overturn Decision"}
              </button>
            </div>
            <p className="mod-note">
              Overturning reopens the report in the Moderation Queue with the original action
              cleared, ready to be actioned again.
            </p>
          </div>
        )}

        <EscalateReportCard report={report} onEscalated={setReport} />
      </div>
    </>
  );
}
