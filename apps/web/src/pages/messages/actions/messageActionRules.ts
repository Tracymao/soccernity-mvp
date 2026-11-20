// Rules and wording shared by the message actions on both conversation
// surfaces (B-067, Decision Log #472 (b)): the mobile page
// (ConversationPage.tsx) and the Community pop-up (ChatWindow.tsx).
//
// The server is the authority on every rule here. In particular the 15
// minutes to edit are measured on the SERVER clock from `sentAt`; the client
// clock only decides whether "Edit" looks enabled (a hint). A
// message_edit_window_closed reply is always shown, whatever the client
// thought.
import {
  MESSAGE_DELETE_NOT_SENDER_CODE,
  MESSAGE_EDIT_NOT_SENDER_CODE,
  MESSAGE_EDIT_WINDOW_CLOSED_CODE,
  MESSAGE_NOT_EDITABLE_CODE,
  MessagingApiError,
  isDeletedMessage,
  isRemovedMessage,
  type Message,
  type ThreadMessage,
} from "../../../api/messaging";
import type { ReportContextRow } from "../../../components/report/ReportContextStep";

export const EDIT_WINDOW_MS = 15 * 60 * 1000;

// Hint only -- see the header comment.
export function canEditNow(message: Message, now: number = Date.now()): boolean {
  return now - new Date(message.sentAt).getTime() <= EDIT_WINDOW_MS;
}

// The "Seen 08:09 AM" label (B-061 read receipts, Figma V1 to V4) goes under
// ONE message: the latest message YOU sent in the thread (the list is oldest
// first), and only when the server says it was read (`readAt` set). The
// server already returns `readAt` only for a message you sent, only when it
// was read and only when both people have read receipts on in the same age
// class; this function adds the display rule on top and decides nothing
// about who may see what.
//   - not under an older message of yours, even one that was read;
//   - not under a message you received (the server sends null there anyway);
//   - not on a "This message was deleted" placeholder (it carries no time),
//     and then not under any earlier one either: the latest message of yours
//     is the deleted one, so the label has no message to sit under.
export function seenLabelMessageId(messages: readonly ThreadMessage[], currentUserId: string): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    // A message a moderator removed carries no sender and no read time (B-289), so it can neither hold the
    // label nor tell us whose it was; it is stepped over like a message of the other person's.
    if (isRemovedMessage(message)) continue;
    if (message.senderId !== currentUserId) continue;
    if (isDeletedMessage(message)) return null;
    return message.readAt ? message.id : null;
  }
  return null;
}

// "Matthew Amuloko" -> "Matthew". No name (a deleted account) -> null, and
// the wording falls back to "the other person".
export function firstNameOf(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

// The most messages before and after the reported one the report may offer as context (Decision Log #477).
export const REPORT_CONTEXT_WINDOW = 10;

// The rows of the "Add messages for context" step for a reported message: the loaded thread (oldest first), the
// reported message and up to 10 messages either side of it, counted by position in the list. A message deleted
// for everyone or removed by a moderator keeps its place in the count (the server counts it too) but is not
// offered, since it has no text and the server will not take it as context. Returns [] when the reported message
// is not in the list.
export function reportContextRows(
  messages: readonly ThreadMessage[],
  reportedId: string,
  currentUserId: string,
  otherName: string | null | undefined,
): ReportContextRow[] {
  const index = messages.findIndex((m) => m.id === reportedId);
  if (index < 0) return [];
  const from = Math.max(0, index - REPORT_CONTEXT_WINDOW);
  const to = Math.min(messages.length, index + REPORT_CONTEXT_WINDOW + 1);
  const rows: ReportContextRow[] = [];
  for (const m of messages.slice(from, to)) {
    if (isDeletedMessage(m) || isRemovedMessage(m)) continue;
    const mine = m.senderId === currentUserId;
    rows.push({
      id: m.id,
      mine,
      senderLabel: mine ? "You" : otherName?.trim() || "The other person",
      sentAt: m.sentAt,
      text: m.contentText,
      reported: m.id === reportedId,
    });
  }
  return rows;
}

export const WORDING = {
  editWindowClosed: "You can only edit a message for 15 minutes. This one can’t be changed now.",
  notEditable: "This message can’t be edited.",
  editNotSender: "Only the sender can edit a message.",
  editError: "Couldn’t save your edit. Check your connection and try again.",
  deleteError: "Couldn’t delete the message. Check your connection and try again.",
  deleteNotSender: "Only the sender can delete a message for everyone.",
  deleteChatError: "Couldn’t delete the chat. Check your connection and try again.",
  markReadError: "Couldn’t mark this chat as read.",
  markedRead: "Marked as read.",
  blocked: "Blocked.",
  deleted: "This message was deleted",
  // The one line the frames tag for legal review (Figma B4, B6, D6, D7).
  retention: "We may keep a copy of the original for safety and legal reasons. [COPY PENDING LEGAL REVIEW]",
} as const;

export type EditFailureStatus = "error" | "window-closed" | "not-editable";

export interface EditFailure {
  status: EditFailureStatus;
  text: string;
}

function codeOf(err: unknown): string | undefined {
  return err instanceof MessagingApiError ? err.code : undefined;
}

// A refusal with a status the server chose (a block, a consent 403 ...) shows
// the server's own sentence; a network failure or a 5xx shows the fixed
// "check your connection" line the frames draw.
function serverSentence(err: unknown): string | null {
  if (err instanceof MessagingApiError && err.status !== undefined && err.status >= 400 && err.status < 500) {
    return err.message;
  }
  return null;
}

export function editFailure(err: unknown): EditFailure {
  switch (codeOf(err)) {
    case MESSAGE_EDIT_WINDOW_CLOSED_CODE:
      return { status: "window-closed", text: WORDING.editWindowClosed };
    case MESSAGE_NOT_EDITABLE_CODE:
      return { status: "not-editable", text: WORDING.notEditable };
    case MESSAGE_EDIT_NOT_SENDER_CODE:
      return { status: "not-editable", text: WORDING.editNotSender };
    default:
      return { status: "error", text: serverSentence(err) ?? WORDING.editError };
  }
}

export function deleteFailure(err: unknown): string {
  if (codeOf(err) === MESSAGE_DELETE_NOT_SENDER_CODE) return WORDING.deleteNotSender;
  return serverSentence(err) ?? WORDING.deleteError;
}

export function deleteChatFailure(err: unknown): string {
  return serverSentence(err) ?? WORDING.deleteChatError;
}
