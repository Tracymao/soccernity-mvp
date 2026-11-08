// The reported message on Report Detail for a "message" report (build-register B-284 slice; backend
// backend/b067-message-report). Figma Admin Report Detail frames R11 7011:57380 (message target), R12 7011:57551
// (edited) and R13 7011:57728 (deleted by the sender), clones of the report detail 6947:41119.
//
// What the server returns (services/api ReportedMessageView) is exactly that one message: the sender's public name,
// when it was sent, the text as it is stored now, the text as first sent (only if it was edited), when it was
// edited, and whether the sender deleted it for everyone. The text is kept for review in every case.
//
// Where the frames and the server differ (the server wins; listed in the PR):
//  * The frames show "@handle (real name)" for the sender; the server returns the public name only, so that is what
//    is shown.
//  * R13 says "Deleted by the sender at 08:20"; the server returns no deletion time, so no time is shown.
//  * R12 says "Yes, at 08:09 (within the 15 minutes)"; whether the edit was inside the window is not returned and
//    is not worked out here, so only "Yes, at <time>" is shown.
//
// This card is read-only. Nothing here removes the message: a moderator cannot delete a message today, and none
// of the wording below implies it.
import type { ReactNode } from "react";
import type { ReportedMessage } from "../../api/moderation";
import { formatDateTime } from "./moderationShared";

export const REPORTED_MESSAGE_UNAVAILABLE = "The reported message is no longer available.";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mod-field">
      <span className="mod-field__label">{label}</span>
      <span className="mod-field__value">{children}</span>
    </div>
  );
}

function TextBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="mod-field">
      <span className="mod-field__label">{label}</span>
      <p className="mod-message-text">{text}</p>
    </div>
  );
}

// `message` is undefined while the single-report read that carries it has not answered yet, and null when the
// message is gone or the read could not attach it.
export default function ReportedMessageFields({ message }: { message: ReportedMessage | null | undefined }) {
  if (message === undefined) {
    return <p className="mod-loading">Loading the reported message…</p>;
  }
  if (message === null) {
    return <p className="mod-note">{REPORTED_MESSAGE_UNAVAILABLE}</p>;
  }

  const edited = message.editedAt !== null;
  return (
    <>
      <Field label="Sender">{message.sender.publicName}</Field>
      <Field label="Sent">{formatDateTime(message.sentAt)}</Field>
      {edited ? <Field label="Edited">{`Yes, at ${formatDateTime(message.editedAt)}`}</Field> : null}
      {message.deletedForEveryone ? <Field label="Message status">Deleted by the sender</Field> : null}
      <TextBlock label={edited ? "Message text (current)" : "Message text"} text={message.contentText} />
      {edited && message.originalContentText !== null ? (
        <TextBlock label="Original text (before the edit)" text={message.originalContentText} />
      ) : null}
    </>
  );
}
