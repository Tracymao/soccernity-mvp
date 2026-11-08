// The in-app "report" affordance — reused for reporting a post (with an adjacent "report the author" option),
// a comment, a user and a Bants room.
//
// B-284 (Decision Log #465): a report carries a REQUIRED reason category from a fixed list plus an OPTIONAL
// description (required only for "Other"). Figma: "Report — In-app form" frames 6946:40232 to 6946:40796
// (docs/figma-report-reason-categories.md) — a dialog over the page with the category radio list, the details
// field, a send error, and a "Reported — thanks" confirmation. The small target menu that picks post-or-user
// first has no frame and stays as it was.
//
// POST /reports (services/api moderation module, JwtAuthGuard only — reachable even for a restricted-pending
// minor, since reporting abuse directed at you must always be possible).
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  createReport,
  reportSubmitErrorMessage,
  type ReportReasonCategory,
  type ReportTargetType,
} from "../../api/moderation";
import { ReportCategoryField, ReportDetailsField } from "../../components/report/ReportFields";
import { canSubmitReport, detailsToSend } from "../../lib/reportReasons";
import "./ReportAction.css";

export interface ReportTarget {
  /** e.g. "Report post" / "Report user" / "Report comment". */
  label: string;
  targetType: ReportTargetType;
  targetId: string;
}

interface ReportActionProps {
  accessToken: string;
  /** One target -> the trigger opens the report dialog directly. More than
   *  one -> the trigger opens a small menu to pick which one first. */
  targets: ReportTarget[];
  /** Collapsed trigger label. Default: "Report". */
  triggerLabel?: string;
  /** Open straight away (no trigger click), with focus on the first choice. Used where another control has
   *  already asked to report, e.g. the media report daily-limit sheet (B-266). */
  startOpen?: boolean;
  /** Called when the person cancels, and with `startOpen` the caller takes over instead of a "Report"
   *  trigger being shown. */
  onCancel?: () => void;
  /** Called when the person presses Close on the "Reported — thanks" confirmation. With it, the caller takes over
   *  (and unmounts this) instead of the plain "Reported" note replacing the trigger. Used by the message menu. */
  onFinished?: () => void;
}

type Stage = "closed" | "menu" | "reason" | "done" | "reported";

// The dialog title names what is being reported (Figma: "Report this post / comment / user").
const DIALOG_TITLES: Record<ReportTargetType, string> = {
  post: "Report this post",
  comment: "Report this comment",
  user: "Report this user",
  banter_room: "Report this room",
  message: "Report this message",
};

const FOCUSABLE = 'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

export default function ReportAction({
  accessToken,
  targets,
  triggerLabel = "Report",
  startOpen = false,
  onCancel,
  onFinished,
}: ReportActionProps) {
  const [stage, setStage] = useState<Stage>(() => {
    if (!startOpen || targets.length === 0) return "closed";
    return targets.length === 1 ? "reason" : "menu";
  });
  const [selected, setSelected] = useState<ReportTarget | null>(() =>
    startOpen && targets.length === 1 ? targets[0] : null,
  );
  const [category, setCategory] = useState<ReportReasonCategory | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const subtitleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reportedRef = useRef<HTMLSpanElement>(null);
  // Opened by another control: that control, not a trigger here, gets focus back.
  const handedOver = startOpen && Boolean(onCancel);

  // The confirmation takes focus so it does not fall back to the page; so does the "Reported" note.
  useEffect(() => {
    if (stage === "done") dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    if (stage === "reported") reportedRef.current?.focus();
  }, [stage]);

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
    setCategory(null);
    setDetails("");
    setError(null);
    onCancel?.();
    if (!handedOver) setTimeout(() => triggerRef.current?.focus(), 0);
  }

  // After the confirmation there is nothing more to send, so the trigger gives way to a plain "Reported" note.
  function close() {
    if (onFinished) {
      onFinished();
      return;
    }
    setStage("reported");
  }

  async function submit() {
    if (submitting || !selected || category === null || !canSubmitReport(category, details)) return;
    setSubmitting(true);
    setError(null);
    try {
      await createReport(accessToken, {
        targetType: selected.targetType,
        targetId: selected.targetId,
        reasonCategory: category,
        reason: detailsToSend(details),
      });
      setStage("done");
    } catch (err) {
      setError(reportSubmitErrorMessage(err, selected.targetType));
    } finally {
      setSubmitting(false);
    }
  }

  // Escape closes (not mid-send); Tab stays inside the dialog.
  function onDialogKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      if (submitting) return;
      e.preventDefault();
      if (stage === "done") close();
      else cancel();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
      (n) => !n.hasAttribute("disabled"),
    );
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (stage === "reported") {
    return (
      <span className="report-action__done" tabIndex={-1} ref={reportedRef}>
        Reported
      </span>
    );
  }

  if (stage === "menu") {
    return (
      <div className="report-action report-action__menu" role="menu">
        {targets.map((t, index) => (
          <button
            key={t.targetType + t.targetId}
            type="button"
            className="report-action__menu-item"
            autoFocus={startOpen && index === 0}
            onClick={() => pick(t)}
          >
            {t.label}
          </button>
        ))}
        <button type="button" className="report-action__menu-item report-action__menu-item--cancel" onClick={cancel}>
          Cancel
        </button>
      </div>
    );
  }

  const trigger =
    (handedOver && stage === "closed") || onFinished ? null : (
      <button type="button" className="report-action__trigger" onClick={open} ref={triggerRef}>
        {triggerLabel}
      </button>
    );

  if (stage === "closed") return trigger;

  const dialog = (
    <div
      className="report-dialog-overlay"
      onClick={() => {
        if (submitting) return;
        if (stage === "done") close();
        else cancel();
      }}
      data-testid="report-dialog-overlay"
    >
      <div
        className="report-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitleId}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onDialogKeyDown}
      >
        {stage === "done" ? (
          <>
            <h2 className="report-dialog__title" id={titleId}>
              Reported — thanks
            </h2>
            <p className="report-dialog__subtitle" id={subtitleId}>
              Our team will review it.
            </p>
            <div className="report-dialog__buttons">
              <button type="button" className="report-dialog__submit" onClick={close}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="report-dialog__title" id={titleId}>
              {DIALOG_TITLES[selected?.targetType ?? "post"]}
            </h2>
            <p className="report-dialog__subtitle" id={subtitleId}>
              Tell us what’s wrong. Our team will review it.
            </p>
            <ReportCategoryField value={category} onChange={setCategory} disabled={submitting} autoFocus />
            <ReportDetailsField
              category={category}
              value={details}
              onChange={setDetails}
              placeholder="Add anything that would help our team look into it."
              disabled={submitting}
            />
            {error && (
              <p className="report-dialog__error" role="alert">
                {error}
              </p>
            )}
            <div className="report-dialog__buttons">
              <button
                type="button"
                className="report-dialog__submit"
                onClick={submit}
                disabled={!canSubmitReport(category, details) || submitting}
              >
                {submitting ? "Submitting…" : "Submit report"}
              </button>
              <button type="button" className="report-dialog__cancel" onClick={cancel} disabled={submitting}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      {trigger}
      {createPortal(dialog, document.body)}
    </>
  );
}
