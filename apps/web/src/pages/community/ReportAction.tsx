// A minimal, disclosed "report" affordance — reused for reporting a post
// (with an adjacent "report the author" option) and for reporting a
// comment.
//
// No Figma frame exists anywhere in the file for this: a file-wide text
// search across every TEXT node on page 0:1 for "report"/"flag" turned up
// only the Admin Console's moderation-queue screens and internal design
// notes — nothing on any Community/Post/Comment/Profile-facing frame.
// Built plainly and disclosed, following the same "no Figma frame exists,
// built plainly" precedent apps/admin's AdminProfilePage.tsx Change
// Password panel already set.
//
// POST /reports (services/api moderation module, JwtAuthGuard only —
// reachable even for a restricted-pending minor, since reporting abuse
// directed at you must always be possible). Free-text reason only — no
// reasons taxonomy exists on the backend (CreateReportDto.reason).
import { useState } from "react";
import { createReport, ModerationApiError, type ReportTargetType } from "../../api/moderation";
import "./ReportAction.css";

export interface ReportTarget {
  /** e.g. "Report post" / "Report user" / "Report comment". */
  label: string;
  targetType: ReportTargetType;
  targetId: string;
}

interface ReportActionProps {
  accessToken: string;
  /** One target -> the trigger opens the reason form directly. More than
   *  one -> the trigger opens a small menu to pick which one first. */
  targets: ReportTarget[];
  /** Collapsed trigger label. Default: "Report". */
  triggerLabel?: string;
}

type Stage = "closed" | "menu" | "reason" | "done";

export default function ReportAction({ accessToken, targets, triggerLabel = "Report" }: ReportActionProps) {
  const [stage, setStage] = useState<Stage>("closed");
  const [selected, setSelected] = useState<ReportTarget | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (targets.length === 0) return null;

  function open() {
    if (targets.length === 1) {
      setSelected(targets[0]);
      setStage("reason");
    } else {
      setStage("menu");
    }
  }

  function pick(target: ReportTarget) {
    setSelected(target);
    setStage("reason");
  }

  function cancel() {
    setStage("closed");
    setSelected(null);
    setReason("");
    setError(null);
  }

  async function submit() {
    const trimmed = reason.trim();
    if (!trimmed || submitting || !selected) return;
    setSubmitting(true);
    setError(null);
    try {
      await createReport(accessToken, { targetType: selected.targetType, targetId: selected.targetId, reason: trimmed });
      setStage("done");
    } catch (err) {
      setError(err instanceof ModerationApiError ? err.message : "Couldn't submit that report.");
    } finally {
      setSubmitting(false);
    }
  }

  if (stage === "done") {
    return <span className="report-action__done">Reported — thanks, our team will review it.</span>;
  }

  if (stage === "closed") {
    return (
      <button type="button" className="report-action__trigger" onClick={open}>
        {triggerLabel}
      </button>
    );
  }

  if (stage === "menu") {
    return (
      <div className="report-action report-action__menu" role="menu">
        {targets.map((t) => (
          <button key={t.targetType + t.targetId} type="button" className="report-action__menu-item" onClick={() => pick(t)}>
            {t.label}
          </button>
        ))}
        <button type="button" className="report-action__menu-item report-action__menu-item--cancel" onClick={cancel}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="report-action">
      <p className="report-action__target">{selected?.label}</p>
      {error && (
        <p className="report-action__error" role="alert">
          {error}
        </p>
      )}
      <textarea
        className="report-action__textarea"
        placeholder="Why are you reporting this?"
        aria-label="Reason for report"
        value={reason}
        maxLength={500}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="report-action__buttons">
        <button
          type="button"
          className="report-action__submit"
          onClick={submit}
          disabled={!reason.trim() || submitting}
        >
          {submitting ? "Submitting…" : "Submit report"}
        </button>
        <button type="button" className="report-action__cancel" onClick={cancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </div>
  );
}
