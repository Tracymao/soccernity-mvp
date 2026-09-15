// Report Detail & Action — Figma node 5796:8635.
//
// Real data: PATCH /admin/moderation/reports/:id (Build Plan Section 4.8,
// Decision Log #135/#189, built by sprint-5/admin-moderation-queue-backend).
// There is no GET /reports/:id anywhere in services/api -- this screen is
// reached from ModerationQueuePage's "Review" link, which passes the row's
// own already-fetched Report via router `state`; a direct visit / refresh
// falls back to api/moderation.ts's findReportById (see that file's own
// Decision Log candidate #4 comment). Delete/suspend actions are navy, not
// red -- no destructive-colour token exists (CLAUDE.md non-negotiable #3).
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { AdminApiError } from "../../api/adminClient";
import {
  actionReport,
  findReportById,
  REPORT_ACTIONS,
  REPORT_ACTION_LABELS,
  type Report,
  type ReportAction,
} from "../../api/moderation";
import { formatDateTime, targetLabel } from "./moderationShared";
import "./moderation.css";

type LoadState = "loading" | "loaded" | "not-found" | "error";

export default function ReportDetailPage() {
  const { id = "" } = useParams();
  const location = useLocation() as { state?: { report?: Report } };
  const navigate = useNavigate();

  const [report, setReport] = useState<Report | null>(location.state?.report ?? null);
  const [loadState, setLoadState] = useState<LoadState>(report ? "loaded" : "loading");
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<ReportAction | null>(null);

  useEffect(() => {
    if (report) return;
    let cancelled = false;
    findReportById(id, "open")
      .then((found) => {
        if (cancelled) return;
        if (found) {
          setReport(found);
          setLoadState("loaded");
        } else {
          setLoadState("not-found");
        }
      })
      .catch(() => {
        if (!cancelled) setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
    // Only re-runs if `id` changes -- `report` is intentionally excluded
    // so a successful action's optimistic update below doesn't refetch.
  }, [id]);

  const backLink = (
    <div className="mod-back">
      <Link to="/moderation">← Moderation Queue</Link>
    </div>
  );

  async function handleAction(action: ReportAction) {
    if (submitting) return;
    setSubmitting(action);
    setActionError(null);
    try {
      await actionReport(id, action);
      navigate("/moderation");
    } catch (err) {
      setActionError(
        err instanceof AdminApiError ? err.message : "Couldn’t record that action. Please try again.",
      );
      setSubmitting(null);
    }
  }

  if (loadState === "loading") {
    return (
      <>
        <AdminPageHeader title="Report" hideSearch />
        <div className="mod-page">
          {backLink}
          <p className="mod-loading">Loading the report…</p>
        </div>
      </>
    );
  }

  if (loadState === "not-found" || loadState === "error" || !report) {
    return (
      <>
        <AdminPageHeader title="Report" hideSearch />
        <div className="mod-page">
          {backLink}
          <div className="mod-card">
            <h2 className="mod-card__title">Report not found</h2>
            <p className="mod-note">
              {loadState === "error"
                ? "Couldn’t load this report. Please try again from the queue."
                : "This report isn’t in the first 250 open reports — open it directly from the Moderation Queue instead of a bookmarked link."}
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

  const alreadyReviewed = report.status !== "open";

  return (
    <>
      <AdminPageHeader title={`Report #${report.id.slice(0, 8)}`} hideSearch />
      <div className="mod-page">
        {backLink}

        <div className="mod-card">
          <h2 className="mod-card__title">Reported content</h2>
          <div className="mod-field">
            <span className="mod-field__label">Type</span>
            <span className="mod-field__value">{targetLabel(report.targetType)}</span>
          </div>
          <div className="mod-field">
            <span className="mod-field__label">Target id</span>
            <span className="mod-field__value">{report.targetId}</span>
          </div>
        </div>

        <div className="mod-card">
          <h2 className="mod-card__title">Report details</h2>
          <div className="mod-field">
            <span className="mod-field__label">Reporter id</span>
            <span className="mod-field__value">{report.reporterId}</span>
          </div>
          <div className="mod-field">
            <span className="mod-field__label">Reason</span>
            <span className="mod-field__value">{report.reason}</span>
          </div>
          <div className="mod-field">
            <span className="mod-field__label">Submitted</span>
            <span className="mod-field__value">{formatDateTime(report.createdAt)}</span>
          </div>
          <div className="mod-field">
            <span className="mod-field__label">Status</span>
            <span className="mod-field__value">{report.status}</span>
          </div>
        </div>

        {alreadyReviewed ? (
          <div className="mod-card">
            <h2 className="mod-card__title">Already reviewed</h2>
            <p className="mod-note">
              This report was already {report.status === "reviewed" ? "dismissed" : "actioned"}
              {report.actionTaken ? ` (${REPORT_ACTION_LABELS[report.actionTaken as ReportAction] ?? report.actionTaken})` : ""}
              {report.reviewedAt ? ` on ${formatDateTime(report.reviewedAt)}` : ""}. It cannot be
              actioned a second time this way — the only path back to the open queue is an
              overturned appeal.
            </p>
            {report.appealStatus === "pending" ? (
              <div className="mod-action-row">
                <Link className="mod-link" to={`/moderation/appeals/${report.id}`} state={{ report }}>
                  Review its pending appeal ›
                </Link>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mod-card">
            <h2 className="mod-card__title">Take action</h2>
            {actionError ? (
              <p className="mod-error" role="alert">
                {actionError}
              </p>
            ) : null}
            <div className="mod-action-row">
              {REPORT_ACTIONS.map((action) => (
                <button
                  key={action}
                  type="button"
                  className={`mod-btn ${action === "dismissed" ? "mod-btn--outline" : "mod-btn--primary"}`}
                  onClick={() => handleAction(action)}
                  disabled={submitting !== null}
                >
                  {submitting === action ? "Saving…" : REPORT_ACTION_LABELS[action]}
                </button>
              ))}
            </div>
            <p className="mod-note">
              Once actioned, both the reporter and the reported user are notified of the outcome
              (Build Plan Section 8.4). Recording an action does not by itself remove content or
              suspend an account — see the moderation module's own disclosed-limitation note.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
