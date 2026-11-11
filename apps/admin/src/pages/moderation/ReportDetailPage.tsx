// Report Detail & Action — Figma node 5796:8635.
//
// Real data: GET / PATCH /admin/moderation/reports/:id (Build Plan Section
// 4.8, Decision Log #135/#189, built by
// sprint-5/admin-moderation-queue-backend; the GET single-resource route
// added separately -- see api/moderation.ts's getReportById comment). This
// screen is reached from ModerationQueuePage's "Review" link, which passes
// the row's own already-fetched Report via router `state` (skipping a
// redundant fetch); a direct visit / refresh (no router state) now calls
// the real `getReportById` instead of the old bounded-list-scan workaround.
// Delete/suspend actions are navy, not red -- no destructive-colour token
// exists (CLAUDE.md non-negotiable #3).
//
// schema/report-severity-escalation-admin-vetting-application: severity +
// concernsMinor are shown on this screen too (not just the queue rows). A
// non-vetted admin can never REACH a concernsMinor report through the
// queue (listReports silently filters it out server-side), but this page
// can still be reached with one directly -- a stale bookmark, a shared
// link, router `state` surviving in browser history -- so BOTH the
// initial load (getReportById itself 403s on direct access, per
// ModerationService.getReportById) and "Take action" below render the
// real 403 (CHILD_SAFETY_VETTING_REQUIRED_CODE) as the same dedicated
// restricted state, not a generic inline error or a misleading "not
// found". The Escalate card (moderationShared.tsx) is independent of
// concernsMinor and status -- any non-vetted admin gets the same 403
// there regardless.
//
// B-295 (Decision Log #485, #486, #492; Figma pass U, docs/figma-pass-u-report.md): Suspend User is offered only for
// a user, post, comment or message report and opens a confirmation first (the server really suspends the account, in
// the same step as recording the action); an actioned suspension shows the Account suspended state and a Record an
// appeal action (staff record an appeal on the person's behalf, once, inside the window); and a message report whose
// chat involves a child, read by an admin who is not child-safety vetted, shows the hidden-context callout instead of
// the context and the original text. The page decides none of those rules: the server does, this only mirrors the
// target-type list and shows what the server returned.
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { AdminApiError } from "../../api/adminClient";
import {
  actionReport,
  getReportById,
  isChildSafetyVettingRequiredError,
  reasonCategoryLabel,
  REPORT_ACTION_TAKEN_LABELS,
  actionsForTarget,
  canRemoveContent,
  errorCodeOf,
  CONTENT_REMOVAL_NOT_APPLICABLE_CODE,
  isContentRemoved,
  recordAppeal,
  REPORT_ACTION_LABELS,
  type HoldView,
  type Report,
  type ReportAction,
} from "../../api/moderation";
import EnquiryReportView from "./EnquiryReportView";
import ReportedMessageFields from "./ReportedMessageFields";
import ContextMessagesCard from "./ContextMessagesCard";
import RecordAppealDialog from "./RecordAppealDialog";
import SuspendAccountDialog from "./SuspendAccountDialog";
import { CaseLevelHoldButtons, CaseLevelHoldCallout, HoldStatus, mergeHolds } from "./holdActions";
import {
  EscalateReportCard,
  formatDateTime,
  MinorFlagBadge,
  reporterFullLabel,
  SeverityPill,
  targetLabel,
  VettingRestrictedNotice,
} from "./moderationShared";
import "./moderation.css";

type LoadState = "loading" | "loaded" | "not-found" | "restricted" | "error";

export default function ReportDetailPage() {
  const { id = "" } = useParams();
  const location = useLocation() as { state?: { report?: Report } };
  const navigate = useNavigate();

  const [report, setReport] = useState<Report | null>(location.state?.report ?? null);
  const [loadState, setLoadState] = useState<LoadState>(report ? "loaded" : "loading");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionRestricted, setActionRestricted] = useState(false);
  const [submitting, setSubmitting] = useState<ReportAction | null>(null);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [appealOpen, setAppealOpen] = useState(false);

  useEffect(() => {
    // B-045: the active holds come only from the single-report read, and the row the
    // queue hands over has none. So a handed-over report is read once more, only to
    // add its holds; a failure there changes nothing on screen.
    const handedOver = report !== null;
    // A message report also needs the message itself, which only the single-report read carries.
    if (handedOver && report.holds !== undefined && (report.targetType !== "message" || report.reportedMessage !== undefined)) return;
    let cancelled = false;
    getReportById(id)
      .then((found) => {
        if (cancelled) return;
        if (handedOver) {
          // B-046: a report made from a Contact Us enquiry also needs the enquiry it came from, which only
          // the single-report read carries.
          setReport((prev) =>
            prev
              ? {
                  ...prev,
                  holds: found.holds ?? [],
                  source: found.source ?? prev.source,
                  contactEnquiry: found.contactEnquiry,
                  ...(prev.targetType === "message"
                    ? {
                        reportedMessage: found.reportedMessage ?? null,
                        contextMessages: found.contextMessages ?? [],
                        contextHidden: found.contextHidden,
                      }
                    : {}),
                }
              : found,
          );
          return;
        }
        setReport(
          found.targetType === "message"
            ? { ...found, reportedMessage: found.reportedMessage ?? null, contextMessages: found.contextMessages ?? [] }
            : found,
        );
        setLoadState("loaded");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (handedOver) {
          // The enquiry could not be read: say so rather than loading for ever.
          setReport((prev) => {
            if (!prev) return prev;
            if (prev.source === "contact_enquiry") return { ...prev, contactEnquiry: null };
            // Same for a message report: say the message could not be read rather than loading for ever.
            if (prev.targetType === "message" && prev.reportedMessage === undefined) return { ...prev, reportedMessage: null };
            return prev;
          });
          return;
        }
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
    // B-295: suspending an account asks for confirmation first (Figma 7042:61845).
    if (action === "user_suspended") {
      setSuspendOpen(true);
      return;
    }
    setSubmitting(action);
    setActionError(null);
    try {
      await actionReport(id, action);
      navigate("/moderation");
    } catch (err) {
      if (isChildSafetyVettingRequiredError(err)) {
        setActionRestricted(true);
      } else if (errorCodeOf(err) === CONTENT_REMOVAL_NOT_APPLICABLE_CODE) {
        // The server refuses Remove Content for a target that is not a post, comment or message. The page does
        // not offer it there, so this is only a stale or hand-made request.
        setActionError("Content can only be removed for a post, a comment or a message.");
      } else {
        setActionError(
          err instanceof AdminApiError ? err.message : "Couldn’t record that action. Please try again.",
        );
      }
      setSubmitting(null);
    }
  }

  // The suspension is recorded as the report's action. The server really suspends the account in the same step; the
  // page stays on the report and shows the Account suspended state (Figma 7042:61998).
  async function confirmSuspend() {
    const updated = await actionReport(id, "user_suspended");
    setSuspendOpen(false);
    setReport((prev) => (prev ? { ...prev, ...updated } : updated));
  }

  // Staff record an appeal on the suspended person's behalf (Figma 7044:62498).
  async function confirmRecordAppeal(reason: string) {
    const updated = await recordAppeal(id, reason);
    setAppealOpen(false);
    setReport((prev) => (prev ? { ...prev, ...updated } : updated));
  }

  function handleHoldsPlaced(holds: HoldView[]) {
    setReport((prev) => (prev ? { ...prev, holds: mergeHolds(prev.holds, holds) } : prev));
  }

  // A lifted hold is no longer active, so it leaves the hold-active row.
  function handleHoldsLifted(lifted: HoldView[]) {
    const gone = new Set(lifted.map((h) => h.id));
    setReport((prev) => (prev ? { ...prev, holds: (prev.holds ?? []).filter((h) => !gone.has(h.id)) } : prev));
  }

  if (loadState === "loading") {
    return (
      <>
        <AdminPageHeader title="Report" />
        <div className="mod-page">
          {backLink}
          <p className="mod-loading">Loading the report…</p>
        </div>
      </>
    );
  }

  if (loadState === "restricted") {
    return (
      <>
        <AdminPageHeader title="Report" />
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
        <AdminPageHeader title="Report" />
        <div className="mod-page">
          {backLink}
          <div className="mod-card">
            <h2 className="mod-card__title">Report not found</h2>
            <p className="mod-note">
              {loadState === "error"
                ? "Couldn’t load this report. Please try again from the queue."
                : "No report exists with this id — open it directly from the Moderation Queue instead of a bookmarked link."}
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

  // B-046: a report made by escalating a Contact Us enquiry has no reported user, so it has its own view.
  if (report.source === "contact_enquiry") return <EnquiryReportView report={report} />;

  const alreadyReviewed = report.status !== "open";
  // B-295: the report's recorded action is a suspension (and it is still the standing decision: an overturned appeal
  // reopens the report and clears the action).
  const suspendedByReport = report.status === "actioned" && report.actionTaken === "user_suspended";
  // Only one appeal per report; a staff-recorded appeal is possible only against a suspension.
  const canRecordAppeal = suspendedByReport && !report.appealStatus;
  const appealRecordedByStaff = report.appealRecordedByStaff === true;

  return (
    <>
      <AdminPageHeader title={`Report #${report.id.slice(0, 8)}`} />
      <div className="mod-page">
        {backLink}

        <HoldStatus holds={report.holds} onLifted={handleHoldsLifted} />

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
          {suspendedByReport ? (
            <div className="mod-field">
              <span className="mod-field__label">Account</span>
              <span className="mod-field__value">
                <span className="mod-pill mod-pill--strong mod-pill--plain">Account suspended</span>
              </span>
            </div>
          ) : null}
          {isContentRemoved(report) ? (
            <div className="mod-field">
              <span className="mod-field__label">Content</span>
              <span className="mod-field__value">
                <span className="mod-pill mod-pill--strong">Content removed</span>
              </span>
            </div>
          ) : null}
          {report.targetType === "message" ? <ReportedMessageFields message={report.reportedMessage} /> : null}
        </div>

        {report.targetType === "message" ? (
          <ContextMessagesCard
            reportedMessage={report.reportedMessage}
            contextMessages={report.contextMessages}
            contextHidden={report.contextHidden === true}
          />
        ) : null}

        <div className="mod-card">
          <h2 className="mod-card__title">Report details</h2>
          <div className="mod-field">
            <span className="mod-field__label">Reporter</span>
            <span className="mod-field__value">{reporterFullLabel(report)}</span>
          </div>
          <div className="mod-field">
            <span className="mod-field__label">Reason category</span>
            <span className="mod-field__value">{reasonCategoryLabel(report.reasonCategory)}</span>
          </div>
          {/* Optional free text (stored as "" when the reporter wrote none): the row is drawn only when there is some. */}
          {report.reason.trim() !== "" ? (
            <div className="mod-field">
              <span className="mod-field__label">Description</span>
              <span className="mod-field__value">{report.reason}</span>
            </div>
          ) : null}
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
          <div className="mod-field">
            <span className="mod-field__label">Submitted</span>
            <span className="mod-field__value">{formatDateTime(report.createdAt)}</span>
          </div>
          <div className="mod-field">
            <span className="mod-field__label">Status</span>
            <span className="mod-field__value">{report.status}</span>
          </div>
          {report.actionTaken ? (
            <div className="mod-field">
              <span className="mod-field__label">Action taken</span>
              <span className="mod-field__value">
                {REPORT_ACTION_TAKEN_LABELS[report.actionTaken as ReportAction] ?? report.actionTaken}
              </span>
            </div>
          ) : null}
          {report.appealStatus === "pending" ? (
            <div className="mod-field">
              <span className="mod-field__label">Appeal</span>
              <span className="mod-field__value">
                <span className="mod-pill mod-pill--outline mod-pill--plain">
                  {appealRecordedByStaff ? "Pending — recorded by staff" : "Pending"}
                </span>
              </span>
            </div>
          ) : null}
        </div>

        {suspendedByReport && !appealRecordedByStaff ? (
          <div className="mod-callout" role="status">
            <span className="mod-callout__bar" aria-hidden />
            <p>Account suspended. The account can no longer sign in and has been emailed.</p>
          </div>
        ) : null}

        {appealRecordedByStaff && report.appealStatus === "pending" ? (
          <div className="mod-callout" role="status">
            <span className="mod-callout__bar" aria-hidden />
            <p>Appeal recorded for the account. It is waiting for review, and closure of this report is paused.</p>
          </div>
        ) : null}

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
        ) : null}

        {alreadyReviewed && !actionRestricted ? (
          <div className="mod-card">
            <h2 className="mod-card__title">Case-level actions</h2>
            <div className="mod-action-row">
              {canRecordAppeal ? (
                <button type="button" className="mod-btn mod-btn--primary" onClick={() => setAppealOpen(true)}>
                  Record an appeal
                </button>
              ) : null}
              <CaseLevelHoldButtons
                report={report}
                onPlaced={handleHoldsPlaced}
                onRestricted={() => setActionRestricted(true)}
              />
            </div>
            <CaseLevelHoldCallout />
          </div>
        ) : null}

        {alreadyReviewed && actionRestricted ? <VettingRestrictedNotice /> : null}

        {alreadyReviewed ? null : actionRestricted ? (
          <VettingRestrictedNotice />
        ) : (
          <div className="mod-card">
            <h2 className="mod-card__title">Take action</h2>
            {report.concernsMinor ? (
              <p className="mod-note">
                This report concerns a minor — acting on it requires a child-safety-vetted admin
                (Settings › Roles).
              </p>
            ) : null}
            {actionError ? (
              <p className="mod-error" role="alert">
                {actionError}
              </p>
            ) : null}
            <div className="mod-action-row">
              {actionsForTarget(report.targetType).map((action) => (
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
              <CaseLevelHoldButtons
                report={report}
                onPlaced={handleHoldsPlaced}
                onRestricted={() => setActionRestricted(true)}
              />
            </div>
            {/* B-295 (Figma 7041:60951 to 7041:62132): says where Suspend User applies, or why it is missing. */}
            <p className="mod-helper">{suspendHelperLine(report.targetType)}</p>
            <p className="mod-note">
              Once actioned, both the reporter and the reported user are notified of the outcome.
              {canRemoveContent(report.targetType)
                ? " Remove Content hides it from everyone but you and the other moderators; the original is kept as evidence."
                : " Recording an action does not by itself remove content."}
            </p>
            <CaseLevelHoldCallout />
          </div>
        )}

        <EscalateReportCard report={report} onEscalated={setReport} />
      </div>

      {suspendOpen ? (
        <SuspendAccountDialog
          mode="report"
          lead={suspendLead(report.targetType)}
          onSubmit={confirmSuspend}
          onClose={() => setSuspendOpen(false)}
          onRestricted={() => {
            setSuspendOpen(false);
            setActionRestricted(true);
          }}
        />
      ) : null}
      {appealOpen ? (
        <RecordAppealDialog
          reportNumber={report.id.slice(0, 8)}
          onSubmit={confirmRecordAppeal}
          onClose={() => setAppealOpen(false)}
          onRestricted={() => {
            setAppealOpen(false);
            setActionRestricted(true);
          }}
        />
      ) : null}
    </>
  );
}

// Who the confirmation names, by what the report is about (Figma 7042:61914 for a post).
function suspendLead(targetType: string): string {
  const who =
    targetType === "post"
      ? "the author of the reported post"
      : targetType === "comment"
        ? "the author of the reported comment"
        : targetType === "message"
          ? "the sender of the reported message"
          : "the reported user";
  return `Suspend the account of ${who}? If you continue:`;
}

// The line under the Take action buttons. Where Suspend User is offered it says whose account it suspends; where it is
// not offered it says so, and where it does apply (Figma 7041:61631 for a Banter room).
function suspendHelperLine(targetType: string): string {
  if (targetType === "user") return "Suspend User suspends the reported account. You are asked to confirm first.";
  if (targetType === "post") return "Suspend User suspends the account of the post’s author. You are asked to confirm first.";
  if (targetType === "comment") return "Suspend User suspends the account of the comment’s author. You are asked to confirm first.";
  if (targetType === "message") return "Suspend User suspends the account of the message’s sender. You are asked to confirm first.";
  const what =
    targetType === "banter_room"
      ? "a Banter Room report"
      : targetType === "grassroots_team"
        ? "a team report"
        : targetType === "fixture"
          ? "a fixture report"
          : "this kind of report";
  return `Suspend User is not offered on ${what}. Suspension applies to user, post, comment and message reports.`;
}
