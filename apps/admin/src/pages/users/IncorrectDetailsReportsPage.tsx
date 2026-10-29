// Incorrect-details reports (B-120, B-119 design; build register Section 25).
// Figma W0 pass K frames 6737:27844 (list) and its family: Truncated 6738:27962,
// Empty 6738:28144, Loading 6738:29952, Load Error 6738:28328, Resolve Confirm
// 6738:30173, Resolve 404 6738:28510, Resolve Failed 6738:28693. Route
// /users/incorrect-details-reports; the sidebar host is Users.
//
// Real data: GET /admin/users/incorrect-details-reports (oldest first, capped
// at 200 by the server; `truncated` says more exist) and POST
// /admin/users/:id/incorrect-details-report/resolve (no body). Moderator /
// superadmin only, the same gate as the whole Users section; an editor's 403 is
// shown as the load error.
//
// The columns are exactly the response's fields. No date of birth, no note
// field (the resolve endpoint takes none) and no control beyond the frames.
// The 404 on resolve ("No open incorrect-details report for this user") is an
// EXPECTED outcome, usually another admin got there first: it shows the drawn
// message and refreshes the list, never a crash.
//
// NOT IN THE FRAMES, so not built (the frame notes list them as SCOPE OPEN):
// a link from a row to User Detail, a success message after a resolve (the row
// just leaves the list), a sidebar item of its own. The only way in is a link
// from the Users list, added because the screen would otherwise be reachable
// by URL only.
import { useState } from "react";
import { Link } from "react-router";
import { AdminApiError } from "../../api/adminClient";
import {
  listIncorrectDetailsReports,
  resolveIncorrectDetailsReport,
  type IncorrectDetailsReport,
} from "../../api/adminUsers";
import { formatDate, useAsyncData } from "./usersShared";
import "./users.css";

const EXPLAINER =
  "A guardian has said the details on a consent request are wrong. While a report is open the guardian cannot approve or start the card payment; they can still decline or withdraw. Resolving a report lets the guardian approve again. No date of birth is shown here. [COPY PENDING LEGAL REVIEW]";
const LOAD_FAILED = "The incorrect-details reports could not be loaded. Check the connection and try again.";
const TRUNCATED = "Showing the first 200 open reports. More open reports exist than this list returns.";
const ALREADY_RESOLVED =
  "No open incorrect-details report for this user. It may already have been resolved, so the list has been refreshed.";
const RESOLVE_FAILED = "The report could not be resolved. It is still open. Try again.";

/** "6b1f5f2e-4b3a-…-2f7c1a8d4e10" -> "6b1f5f2e…2f7c1a8d" (first and last 8). */
function shortId(id: string): string {
  return id.length > 17 ? `${id.slice(0, 8)}…${id.slice(-8)}` : id;
}

// The frames show the raw status values in sentence case ("Active", "Pending").
function statusPillClass(status: string, positive: "active" | "pending"): string {
  return `us-pill us-pill--plain ${status === positive ? "us-pill--soft" : "us-pill--outline"}`;
}

function sentenceCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ") : value;
}

function ResolveDialog({
  report,
  submitting,
  onCancel,
  onConfirm,
}: {
  report: IncorrectDetailsReport;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="ud-scrim" role="presentation">
      <div className="ud-dialog" role="dialog" aria-modal="true" aria-labelledby="resolve-title">
        <div className="ud-dialog__head">
          <h2 id="resolve-title">Resolve incorrect-details report</h2>
          <button type="button" className="ud-dialog__close" aria-label="Close" onClick={onCancel} disabled={submitting}>
            ✕
          </button>
        </div>
        <div className="ud-dialog__body">
          <p className="ud-dialog__text">
            Report on {report.minorDisplayName}&rsquo;s consent request, reported {formatDate(report.reportedAt)}.
          </p>
          <p className="ud-field__help">
            Resolving clears the report, and the guardian can approve the request again. The action is recorded in the
            audit log. [COPY PENDING LEGAL REVIEW]
          </p>
          <div className="ud-dialog__buttons">
            <button type="button" className="us-btn us-btn--outline us-btn--lg" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
            <button type="button" className="us-btn us-btn--primary us-btn--lg" onClick={onConfirm} disabled={submitting}>
              {submitting ? "Resolving…" : "Resolve report"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function IncorrectDetailsReportsPage() {
  const { data, loading, error, reload } = useAsyncData(() => listIncorrectDetailsReports(), []);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<IncorrectDetailsReport | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const items = data ? data.items.filter((r) => !resolvedIds.has(r.userId)) : [];

  async function handleConfirm() {
    if (!pending) return;
    setSubmitting(true);
    setNotice(null);
    const target = pending;
    try {
      await resolveIncorrectDetailsReport(target.userId);
      // The row just leaves the list (no success message is drawn).
      setResolvedIds((prev) => new Set(prev).add(target.userId));
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 404) {
        // Expected: already resolved. Say so and refresh the list.
        setNotice(ALREADY_RESOLVED);
        setResolvedIds(new Set());
        reload();
      } else {
        setNotice(RESOLVE_FAILED);
      }
    } finally {
      setSubmitting(false);
      setPending(null);
    }
  }

  return (
    <>
      <div className="admin-page-header">
        <div className="admin-page-header__titles ud-titlerow">
          <h1 className="admin-page-header__title">Incorrect-details reports</h1>
          <Link to="/users" className="us-btn us-btn--outline">
            Back to users
          </Link>
        </div>
      </div>

      <div className="us-page">
        <p className="ud-callout" role="note">
          {EXPLAINER}
        </p>

        {notice ? (
          <p className="ud-callout" role="status">
            {notice}
          </p>
        ) : null}
        {data?.truncated ? (
          <p className="ud-callout" role="status">
            {TRUNCATED}
          </p>
        ) : null}
        {error ? (
          <p className="us-error" role="alert">
            {LOAD_FAILED}{" "}
            <button type="button" className="us-link" onClick={reload}>
              Retry
            </button>
          </p>
        ) : null}

        {!error ? (
          <div className="us-table ir-table" role="table" aria-label="Incorrect-details reports">
            <div className="us-table__row us-table__row--head ir-row" role="row">
              <span role="columnheader">Minor</span>
              <span role="columnheader">User ID</span>
              <span role="columnheader">Account</span>
              <span role="columnheader">Guardian</span>
              <span role="columnheader">Guardian email</span>
              <span role="columnheader">Consent</span>
              <span role="columnheader">Reported</span>
              <span role="columnheader">Action</span>
            </div>
            {loading && !data ? (
              <p className="us-loading ir-empty" role="status">
                Loading the open reports.
              </p>
            ) : null}
            {!loading && data && items.length === 0 ? (
              <div className="ir-empty" role="status">
                <p className="ud-action__title">No open incorrect-details reports</p>
                <p className="ud-action__body">
                  When a guardian reports incorrect details on a consent request, it appears here.
                </p>
              </div>
            ) : null}
            {items.map((report) => (
              <div className="us-table__row ir-row" role="row" key={report.userId}>
                <span className="us-cell--primary us-cell--truncate" role="cell" title={report.minorDisplayName}>
                  {report.minorDisplayName}
                </span>
                <span className="us-cell--secondary us-cell--truncate" role="cell" title={report.userId}>
                  {shortId(report.userId)}
                </span>
                <span role="cell">
                  <span className={statusPillClass(report.minorAccountStatus, "active")}>{sentenceCase(report.minorAccountStatus)}</span>
                </span>
                <span className="us-cell--truncate" role="cell" title={report.guardianName}>
                  {report.guardianName}
                </span>
                <span className="us-cell--truncate" role="cell" title={report.guardianEmail}>
                  {report.guardianEmail}
                </span>
                <span role="cell">
                  <span className={statusPillClass(report.consentStatus, "pending")}>{sentenceCase(report.consentStatus)}</span>
                </span>
                <span className="us-cell--secondary" role="cell">
                  {formatDate(report.reportedAt)}
                </span>
                <span role="cell">
                  <button type="button" className="us-btn us-btn--outline" onClick={() => setPending(report)}>
                    Resolve
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {pending ? (
        <ResolveDialog
          report={pending}
          submitting={submitting}
          onCancel={() => setPending(null)}
          onConfirm={handleConfirm}
        />
      ) : null}
    </>
  );
}
