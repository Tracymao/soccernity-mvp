// "Messages around the reported one" on Report Detail for a message report (build-register B-286, Decision Log
// #477; backend/b286-message-report-context). Figma: docs/figma-message-report-context-report.md, admin frames
// 7027:59180 (messages included) and 7027:59472 (none included).
//
// What the server returns (services/api ReportContextMessageView) is only the messages the reporter chose, oldest
// first: the sender's public name, whether the reporter sent it, the text as stored now, the text as first sent
// (only if edited), when it was edited, and whether the sender deleted it for everyone. The text is kept for
// review in every case. The reported message comes from `reportedMessage` and is placed among them by time.
//
// Where the frame and the server differ (the server wins):
//  * The frame draws gap rows ("5 earlier messages were not included"). The server returns no position or count
//    for the messages that were not chosen, so no gap row is shown; the description line says they are not shown.
//  * The frame shows "@handle" for the sender; the server returns the public name only.
//
// The card is read-only and shown to whoever can open the report; the child-safety rule that hides a report about
// a minor from an admin who is not vetted already applies to the whole page.
import type { ReactNode } from "react";
import type { ReportContextMessage, ReportedMessage } from "../../api/moderation";
import { formatDateTime } from "./moderationShared";

export const CONTEXT_NONE_INCLUDED =
  "The reporter did not add any messages from the chat. Only the reported message is shown above.";

interface Row {
  id: string;
  sentAt: string;
  senderName: string;
  sentByReporter: boolean;
  contentText: string;
  originalContentText: string | null;
  editedAt: string | null;
  deletedForEveryone: boolean;
  reported: boolean;
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// The server orders by (sentAt, id); keep the same order when the reported message is slotted in.
function compare(a: { sentAt: string; id: string }, b: { sentAt: string; id: string }): number {
  const t = new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime();
  if (t !== 0) return t;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function buildRows(reported: ReportedMessage | null, context: ReportContextMessage[]): Row[] {
  const rows: Row[] = context.map((m) => ({
    id: m.id,
    sentAt: m.sentAt,
    senderName: m.sender.publicName,
    sentByReporter: m.sentByReporter,
    contentText: m.contentText,
    originalContentText: m.originalContentText,
    editedAt: m.editedAt,
    deletedForEveryone: m.deletedForEveryone,
    reported: false,
  }));
  if (reported) {
    rows.push({
      id: reported.id,
      sentAt: reported.sentAt,
      senderName: reported.sender.publicName,
      // The report row does not say whether the reporter sent it; they cannot report their own message.
      sentByReporter: false,
      contentText: reported.contentText,
      originalContentText: reported.originalContentText,
      editedAt: reported.editedAt,
      deletedForEveryone: reported.deletedForEveryone,
      reported: true,
    });
  }
  return rows.sort(compare);
}

function Pill({ children, tone }: { children: ReactNode; tone: "reporter" | "reported" | "edited" | "deleted" }) {
  return <span className={`mod-context__pill mod-context__pill--${tone}`}>{children}</span>;
}

interface Props {
  reportedMessage: ReportedMessage | null | undefined;
  contextMessages: ReportContextMessage[] | undefined;
}

export default function ContextMessagesCard({ reportedMessage, contextMessages }: Props) {
  // Still loading (or the read that carries it failed): nothing to say yet.
  if (reportedMessage === undefined || contextMessages === undefined) return null;
  // The reported message is gone and nothing else was attached: the Reported content card already says so.
  if (reportedMessage === null && contextMessages.length === 0) return null;

  const rows = buildRows(reportedMessage, contextMessages);

  return (
    <div className="mod-card" aria-labelledby="mod-context-title">
      <h2 className="mod-card__title" id="mod-context-title">
        Messages around the reported one
      </h2>
      {contextMessages.length === 0 ? (
        <p className="mod-note">{CONTEXT_NONE_INCLUDED}</p>
      ) : (
        <>
          <p className="mod-note">
            Chosen by the reporter, oldest first. The message you are reviewing is highlighted. Messages the reporter
            did not choose are not shown.
          </p>
          <ol className="mod-context__list">
            {rows.map((row) => (
              <li
                key={row.id}
                className={`mod-context__row${row.reported ? " mod-context__row--reported" : ""}`}
                aria-current={row.reported ? "true" : undefined}
              >
                <span className="mod-context__time">{timeOf(row.sentAt)}</span>
                <span className="mod-context__who">
                  <span className="mod-context__name">{row.senderName}</span>
                  {row.sentByReporter ? <Pill tone="reporter">Reporter</Pill> : null}
                  {row.reported ? <Pill tone="reported">Reported message</Pill> : null}
                </span>
                <span className="mod-context__body">
                  <span className="mod-context__text">{row.contentText}</span>
                  {row.editedAt !== null && row.originalContentText !== null ? (
                    <span className="mod-context__original">
                      Original: “{row.originalContentText}” (edited {formatDateTime(row.editedAt)})
                    </span>
                  ) : null}
                </span>
                <span className="mod-context__marks">
                  {row.editedAt !== null ? <Pill tone="edited">Edited</Pill> : null}
                  {row.deletedForEveryone ? <Pill tone="deleted">Deleted by the sender</Pill> : null}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
