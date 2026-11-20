// The optional "Add messages for context" step of the Report a message dialog (B-286, Decision Log #477).
// Figma: docs/figma-message-report-context-report.md (frames 7025:59162 to 7027:59171). The person may add up to
// 10 messages before and 10 after the reported one from the chat; nothing is chosen by default. The app sends only
// message ids; the server checks every id (same chat, inside the window, visible to the reporter).
//
// This component only draws the step's body (callout, counter, list); the Submit report / Back buttons belong to
// ReportAction, which owns the dialog. The rows come from the thread the page has already loaded, so the loading
// and could-not-load frames have nothing to show here and are not built.
import { useEffect, useRef } from "react";
import { REPORT_CONTEXT_MAX } from "../../api/moderation";
import "./ReportContextStep.css";

export interface ReportContextRow {
  id: string;
  /** Sent by the person reporting. */
  mine: boolean;
  /** "You" for the reporter's own, otherwise the other person's public name. */
  senderLabel: string;
  sentAt: string;
  text: string;
  /** The message being reported: highlighted, not selectable. */
  reported: boolean;
}

export const CONTEXT_WORDING = {
  title: "Add messages for context",
  subtitle: "Optional. Pick messages from this chat that help our team understand what happened.",
  // Says who sees what, so it carries the tag (the Figma frames tag it too).
  safeguarding:
    "Our safeguarding team will see the messages you choose, and the message you are reporting. [COPY PENDING LEGAL REVIEW]",
  clear: "Clear selection",
  includeAll: "Include the messages shown",
  allIncluded: "All shown messages included",
  limit: "That’s the most we can include.",
  reportedPill: "Reported message",
  youPill: "You",
} as const;

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// "N of 20 selected".
export function contextCounter(count: number): string {
  return `${count} of ${REPORT_CONTEXT_MAX} selected`;
}

// The submit button's label (Figma: "Submit report" / "Submit with 6 messages"; one message reads "1 message").
export function contextSubmitLabel(count: number): string {
  if (count === 0) return "Submit report";
  return `Submit with ${count} ${count === 1 ? "message" : "messages"}`;
}

// The line on the "Reported" confirmation when messages went with the report.
export function contextSentLine(count: number): string {
  return count === 1
    ? "1 message from the chat was included with your report."
    : `${count} messages from the chat were included with your report.`;
}

interface ReportContextStepProps {
  rows: ReportContextRow[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  /** Id for the heading, so the dialog can name itself by it. */
  titleId?: string;
}

export default function ReportContextStep({ rows, selected, onChange, disabled = false, titleId }: ReportContextStepProps) {
  const reportedRef = useRef<HTMLDivElement>(null);
  const selectable = rows.filter((r) => !r.reported);
  const selectedSet = new Set(selected);
  const allChosen = selectable.length > 0 && selectable.every((r) => selectedSet.has(r.id));
  const atLimit = selected.length >= REPORT_CONTEXT_MAX;

  // The list opens with the reported message in view, as the frames draw it.
  useEffect(() => {
    reportedRef.current?.scrollIntoView?.({ block: "center" });
  }, []);

  function toggle(id: string) {
    if (selectedSet.has(id)) onChange(selected.filter((s) => s !== id));
    else if (!atLimit) onChange([...selected, id]);
  }

  return (
    <>
      <h2 className="report-dialog__title" id={titleId}>
        {CONTEXT_WORDING.title}
      </h2>
      <p className="report-dialog__subtitle">{CONTEXT_WORDING.subtitle}</p>
      <p className="report-context__callout">{CONTEXT_WORDING.safeguarding}</p>
      <div className="report-context__bar">
        <div className="report-context__count">
          <span aria-live="polite">{contextCounter(selected.length)}</span>
          {selected.length > 0 && (
            <button type="button" className="report-context__clear" onClick={() => onChange([])} disabled={disabled}>
              {CONTEXT_WORDING.clear}
            </button>
          )}
        </div>
        <button
          type="button"
          className="report-dialog__cancel report-context__include"
          onClick={() => onChange(selectable.map((r) => r.id))}
          disabled={disabled || allChosen}
        >
          {allChosen ? CONTEXT_WORDING.allIncluded : CONTEXT_WORDING.includeAll}
        </button>
      </div>
      {atLimit && <p className="report-context__limit">{CONTEXT_WORDING.limit}</p>}
      <div className="report-context__list" role="group" aria-label="Messages around the reported one">
        {rows.map((row) => {
          const meta = (
            <span className="report-context__meta">
              {row.mine ? (
                <span className="report-context__pill">{CONTEXT_WORDING.youPill}</span>
              ) : (
                <span className="report-context__name">{row.senderLabel}</span>
              )}
              <span className="report-context__time">{timeLabel(row.sentAt)}</span>
            </span>
          );
          if (row.reported) {
            return (
              <div key={row.id} ref={reportedRef} className="report-context__row report-context__row--reported">
                <span className="report-context__slot" aria-hidden="true" />
                <span className="report-context__body">
                  <span className="report-context__pill report-context__pill--reported">
                    {CONTEXT_WORDING.reportedPill}
                  </span>
                  {meta}
                  <span className="report-context__text">{row.text}</span>
                </span>
              </div>
            );
          }
          const checked = selectedSet.has(row.id);
          return (
            <label
              key={row.id}
              className={`report-context__row${checked ? " report-context__row--selected" : ""}`}
            >
              <input
                type="checkbox"
                className="report-context__check"
                checked={checked}
                disabled={disabled || (!checked && atLimit)}
                onChange={() => toggle(row.id)}
              />
              <span className="report-context__body">
                {meta}
                <span className="report-context__text">{row.text}</span>
              </span>
            </label>
          );
        })}
      </div>
    </>
  );
}
