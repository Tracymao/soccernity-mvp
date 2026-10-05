// Shared helpers for the Moderation admin screens (Figma nodes
// 5794:8635 / 5796:8635 / 5796:8753 — Decision Log #135/#189, backed by
// sprint-5/admin-moderation-queue-backend). Mirrors
// pages/contest/contestShared.tsx's own per-module-copy convention (see
// that file's own header comment) rather than importing across page
// families.
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { AdminApiError } from "../../api/adminClient";
import {
  escalateReport,
  isChildSafetyVettingRequiredError,
  type Report,
} from "../../api/moderation";

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

export function targetLabel(targetType: string): string {
  if (targetType === "post") return "Post";
  if (targetType === "comment") return "Comment";
  if (targetType === "user") return "User";
  if (targetType === "banter_room") return "Bants room";
  if (targetType === "grassroots_team") return "Grassroots team";
  if (targetType === "fixture") return "Grassroots fixture";
  return targetType;
}

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  errorStatus: number | null;
  reload: () => void;
}

export function useAsyncData<T>(fetcher: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setErrorStatus(null);
    fetcher()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Couldn’t load the moderation queue.");
          setErrorStatus(err instanceof AdminApiError ? err.status : null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [...deps, nonce]);

  return { data, loading, error, errorStatus, reload };
}

// -----------------------------------------------------------------------
// schema/report-severity-escalation-admin-vetting-application — severity /
// concernsMinor display + the shared child-safety-vetting-restricted state
// + the Escalate action, all reused identically by ReportDetailPage.tsx
// and AppealReviewPage.tsx.
// -----------------------------------------------------------------------

export function severityLabel(severity: string): string {
  if (severity === "low") return "Low";
  if (severity === "medium") return "Medium";
  if (severity === "high") return "High";
  if (severity === "critical") return "Critical";
  return severity;
}

// Reuses the existing mod-pill classes — no new colour, high/critical get
// the "strong" (navy) treatment, low/medium the "soft" (green-tint) one,
// same convention report.status's own pill already uses.
export function SeverityPill({ severity }: { severity: string }) {
  const strong = severity === "high" || severity === "critical";
  return <span className={`mod-pill ${strong ? "mod-pill--strong" : "mod-pill--soft"}`}>{severityLabel(severity)}</span>;
}

// The caller decides whether to render this — there is nothing to show
// for a report that doesn't concern a minor, so every call site gates it
// on `report.concernsMinor` rather than this component checking it itself.
export function MinorFlagBadge() {
  return <span className="mod-pill mod-pill--minor">Concerns a minor</span>;
}

// schema/report-severity-escalation-admin-vetting -- reporterId is now
// OPTIONAL (a report submitted via the public, unauthenticated
// POST /reports/public route has no User row behind it at all). These two
// helpers are the one place that decides how to display that -- every
// screen that shows "who reported this" goes through them rather than
// re-deriving the same null-check three times.
export function reporterCellLabel(report: Pick<Report, "reporterId">): string {
  return report.reporterId ? `${report.reporterId.slice(0, 8)}…` : "Public report";
}

export function reporterFullLabel(
  report: Pick<Report, "reporterId" | "reporterContactEmail">,
): string {
  if (report.reporterId) return report.reporterId;
  return report.reporterContactEmail
    ? `Public report — ${report.reporterContactEmail}`
    : "Public report — no contact given";
}

// The dedicated "you are not child-safety-vetted" state -- rendered in
// place of an action/appeal/escalate section once the SERVER has actually
// rejected an attempt with CHILD_SAFETY_VETTING_REQUIRED_CODE, per the
// task's own "no frontend gate needed beyond [the queue's own filtering],
// but add a clear restricted state if a vetted-only report is somehow
// linked directly" instruction. There is no endpoint that exposes the
// CALLING admin's own vetting status (GET /admin/profile doesn't include
// it — only GET /admin/staff, superadmin-only, for OTHER admins), so this
// can only ever be detected reactively, after a real attempt 403s -- never
// predicted up front.
export function VettingRestrictedNotice() {
  return (
    <div className="mod-card mod-card--restricted">
      <h2 className="mod-card__title">Restricted — child-safety vetting required</h2>
      <p className="mod-note">
        This action requires a child-safety-vetted admin (Settings › Roles). The server rejected
        it — nothing was changed. You don&rsquo;t currently have that clearance; ask a superadmin
        to review your vetting status if you believe this is wrong.
      </p>
    </div>
  );
}

// The shared Escalate card — PATCH /admin/moderation/reports/:id/escalate.
// Deliberately independent of Report.status/appealStatus (the backend
// endpoint doesn't care, per its own header comment) and independent of
// concernsMinor too (any non-vetted admin gets the same 403 here,
// regardless — see moderation.ts's own escalateReport comment), so this
// renders on every report this app shows, not just ones flagged as
// concerning a minor.
export function EscalateReportCard({
  report,
  onEscalated,
}: {
  report: Report;
  onEscalated: (updated: Report) => void;
}) {
  const [notes, setNotes] = useState(report.escalationNotes ?? "");
  const [contacted, setContacted] = useState(report.escalatedToAuthority);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restricted, setRestricted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting || notes.trim().length === 0) return;
    setSubmitting(true);
    setError(null);
    setRestricted(false);
    try {
      const updated = await escalateReport(report.id, {
        escalationNotes: notes.trim(),
        escalatedToAuthority: contacted,
      });
      onEscalated(updated);
    } catch (err) {
      if (isChildSafetyVettingRequiredError(err)) {
        setRestricted(true);
      } else {
        setError(
          err instanceof AdminApiError ? err.message : "Couldn’t record the escalation. Please try again.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (restricted) {
    return <VettingRestrictedNotice />;
  }

  return (
    <div className="mod-card">
      <h2 className="mod-card__title">Escalate</h2>
      <p className="mod-note">
        Use this only <strong>after</strong> you have already escalated this report yourself — to
        a designated child-safety lead, a regulator, or law enforcement. Recording an escalation
        here does <strong>not</strong> notify anyone or contact any authority on your behalf — it
        only writes down that a human did.
      </p>
      {report.escalatedAt ? (
        <p className="mod-note">
          Last recorded {formatDateTime(report.escalatedAt)}
          {report.escalatedByAdminId ? ` by admin ${report.escalatedByAdminId.slice(0, 8)}…` : ""} —{" "}
          {report.escalatedToAuthority
            ? "an external authority was contacted."
            : "not yet reported to an external authority."}
        </p>
      ) : null}
      {error ? (
        <p className="mod-error" role="alert">
          {error}
        </p>
      ) : null}
      <form onSubmit={handleSubmit} className="mod-escalate-form">
        <label className="mod-field">
          <span className="mod-field__label">Escalation notes</span>
          <textarea
            className="mod-textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            maxLength={2000}
            required
            placeholder="What did you do, and who did you escalate this to?"
          />
        </label>
        <label className="mod-checkbox">
          <input type="checkbox" checked={contacted} onChange={(e) => setContacted(e.target.checked)} />
          <span>
            I have already contacted an external authority (e.g. a regulator or law enforcement)
            about this report.
          </span>
        </label>
        <div className="mod-action-row">
          <button
            type="submit"
            className="mod-btn mod-btn--primary"
            disabled={submitting || notes.trim().length === 0}
          >
            {submitting ? "Recording…" : report.escalatedAt ? "Update escalation record" : "Record escalation"}
          </button>
        </div>
      </form>
    </div>
  );
}
