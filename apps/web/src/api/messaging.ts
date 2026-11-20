// Direct Messaging client -- Build Plan Section 4.7 (the Messaging
// slice). Backs MessagesPage.tsx (inbox), NewConversationPage.tsx
// (recipient picker) and ConversationPage.tsx (thread). The full
// MessagingModule is merged in services/api (sprint-3/messaging-direct-
// messaging; Decision Log #277) -- every function here hits a real
// endpoint, there is no dummy-data phase for this feature.
//
// Follows the api/*.ts convention (api/clubs.ts, api/grassroots.ts,
// api/banter.ts): a shared authedFetch wrapper, a typed
// MessagingApiError carrying `.status`, API_BASE_URL from
// VITE_API_BASE_URL, a Bearer access-token header on every call,
// cursor-based pagination.
//
// Guard notes worth knowing at the call site (conversations.controller.ts):
//   - GET /conversations, GET /conversations/:id/messages and
//     PATCH /conversations/:id/read are JwtAuthGuard-only.
//   - POST /conversations and POST /conversations/:id/messages are
//     ADDITIONALLY gated by GuardianConsentGuard -- a restricted-pending
//     minor gets a 403 SENDING. A minor RECIPIENT (or a deactivated/
//     pending_deletion one) is a 404, never a distinct 403 -- Decision
//     Log #12/#221 -- indistinguishable client-side from "no such user".
//   - Every /:id route 404s for a non-existent conversation AND for a
//     real conversation the caller isn't a participant in (a DM thread's
//     existence is never disclosed to a non-participant).
//   - POST /conversations returns 201 on a genuinely new thread, 200 when
//     an existing one was found instead -- surfaced here via `created`.
//
// Response shapes mirror services/api/src/modules/messaging/
// messaging.service.ts's ConversationView / MessageView / *Page exactly.
import { apiFailure } from "../lib/under16";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export interface OtherParticipant {
  id: string;
  publicName: string | null;
}

export interface MessagePreview {
  // The server skips messages deleted for everyone when it builds the
  // preview, so null cannot arrive today; the type stays honest anyway and
  // the lists show the placeholder wording if it ever does.
  contentText: string | null;
  senderId: string;
  sentAt: string;
}

// B-289 (Decision Log #483): the last-message preview of a conversation whose
// latest message a moderator removed. Exactly this, no text and no sender.
export interface RemovedMessagePreview {
  id: string;
  sentAt: string;
  removedByModeration: true;
  isMine?: boolean;
}

export type LastMessage = MessagePreview | RemovedMessagePreview;

export function isRemovedPreview(preview: LastMessage): preview is RemovedMessagePreview {
  return "removedByModeration" in preview && preview.removedByModeration === true;
}

// GET /conversations, POST /conversations (ConversationView). `unreadCount`
// and `lastMessage` are computed per-caller, server-side, on every read --
// never derived client-side.
export interface Conversation {
  id: string;
  otherParticipant: OtherParticipant | null;
  lastMessageAt: string;
  createdAt: string;
  lastMessage: LastMessage | null;
  unreadCount: number;
}

export interface ConversationPage {
  items: Conversation[];
  nextCursor: string | null;
}

// GET /conversations/:id/messages, POST /conversations/:id/messages
// (MessageView). B-067 added `editedAt` (null until an edit, then the time
// of the latest one) and the deleted-for-everyone placeholder below. Both
// stay optional on the live shape so a response from before B-067 still types.
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  contentText: string;
  sentAt: string;
  readAt: string | null;
  editedAt?: string | null;
  deletedForEveryone?: false;
}

// A message deleted for everyone arrives like this for BOTH people: no text,
// no read time (B-067, messaging/README.md "Read paths").
export interface DeletedMessage {
  id: string;
  conversationId: string;
  senderId: string;
  sentAt: string;
  editedAt: null;
  deletedForEveryone: true;
  contentText: null;
}

// B-289 (Decision Log #483): a message a moderator removed. It stays in the
// thread for BOTH people as exactly this: no text, no original, no edit data,
// no read time, and deliberately no senderId or conversationId. B-295 (Decision
// Log #489): it carries `isMine`, true when the viewer sent it, only so the stub
// sits on the right side of the thread; it is optional so an older stub shape
// (without it) still parses and is treated as the other person's. The user
// cannot edit, delete or report it.
export interface RemovedMessage {
  id: string;
  sentAt: string;
  removedByModeration: true;
  isMine?: boolean;
}

export type ThreadMessage = Message | DeletedMessage | RemovedMessage;

// A message that still carries its sender (every kind except the moderator's stub).
export type SenderMessage = Message | DeletedMessage;

export function isRemovedMessage(message: ThreadMessage): message is RemovedMessage {
  return "removedByModeration" in message && message.removedByModeration === true;
}

export function isDeletedMessage(message: ThreadMessage): message is DeletedMessage {
  return !isRemovedMessage(message) && message.deletedForEveryone === true;
}

export interface MessagePage {
  items: ThreadMessage[];
  nextCursor: string | null;
}

// The coded errors the B-067 routes add (services/api messaging.constants.ts).
// Errors are told apart by `code`, never by the server's message text.
export const MESSAGE_EDIT_WINDOW_CLOSED_CODE = "message_edit_window_closed";
export const MESSAGE_NOT_EDITABLE_CODE = "message_not_editable";
export const MESSAGE_EDIT_NOT_SENDER_CODE = "message_edit_not_sender";
export const MESSAGE_DELETE_NOT_SENDER_CODE = "message_delete_not_sender";
// B-289: edit or delete refused because a moderator removed the message since the page loaded.
export const MESSAGE_REMOVED_CODE = "message_removed";

// The latest edit's result: the fields an edit can change.
export interface EditMessageResult {
  id: string;
  contentText: string;
  editedAt: string | null;
}

export type DeleteMessageScope = "me" | "everyone";

export interface SendMessageRequest {
  contentText: string;
}

export interface MarkReadResult {
  conversationId: string;
  markedRead: number;
}

export class MessagingApiError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message);
    this.name = "MessagingApiError";
    this.status = options?.status;
    this.code = options?.code;
  }
}

interface AuthedFetchInit {
  method?: string;
  body?: string;
}

// Builds the error for a non-ok response and keeps the server's `code` (the
// shared apiFailure only keeps the under-16 one).
async function failure(response: Response, fallback: string, useServerMessage: boolean): Promise<MessagingApiError> {
  const body = (await response.clone().json().catch(() => null)) as { code?: unknown } | null;
  const code = body && typeof body.code === "string" ? body.code : undefined;
  return apiFailure(
    (m, o) => new MessagingApiError(m, { ...o, code: o.code ?? code }),
    response,
    fallback,
    useServerMessage,
  );
}

async function authedFetch(path: string, accessToken: string, init?: AuthedFetchInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method: init?.method,
      body: init?.body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch {
    throw new MessagingApiError("Couldn't reach the Soccernity server.");
  }
}

// Pull the server's own message off a NestJS error body ({ message } or
// { message: string[] }). Same helper feed.ts / grassroots.ts / banter.ts
// use.
// POST /conversations { recipientId } -- find-or-create the thread with
// ONE other user. `created` distinguishes a genuinely new thread (201)
// from an existing one that was returned instead (200) -- the recipient
// picker uses this to decide whether it just started a conversation or
// is resuming one.
export async function startConversation(
  accessToken: string,
  recipientId: string,
): Promise<{ conversation: Conversation; created: boolean }> {
  const response = await authedFetch("/conversations", accessToken, {
    method: "POST",
    body: JSON.stringify({ recipientId }),
  });
  if (!response.ok) {
    throw await apiFailure((m, o) => new MessagingApiError(m, o), response, `Couldn't start that conversation (${response.status}).`, true);
  }
  const conversation = (await response.json()) as Conversation;
  return { conversation, created: response.status === 201 };
}

// GET /conversations -- the caller's inbox, keyset-paginated
// most-recent-activity-first.
export async function listConversations(accessToken: string, cursor?: string): Promise<ConversationPage> {
  const url = new URL(`${API_BASE_URL}/conversations`);
  if (cursor) url.searchParams.set("cursor", cursor);

  const response = await authedFetch(url.pathname + url.search, accessToken);
  if (!response.ok) {
    throw await apiFailure((m, o) => new MessagingApiError(m, o), response, `Couldn't load your messages (${response.status}).`, false);
  }
  return (await response.json()) as ConversationPage;
}

// GET /conversations/:id/messages -- newest-first keyset pagination
// (matching GET /clubs/:id/feed's direction). A chat UI shows newest at
// the bottom and pages backward into history -- the caller reverses the
// first page before rendering; loadMore prepends earlier history.
export async function getMessages(
  accessToken: string,
  conversationId: string,
  cursor?: string,
): Promise<MessagePage> {
  const url = new URL(`${API_BASE_URL}/conversations/${conversationId}/messages`);
  if (cursor) url.searchParams.set("cursor", cursor);

  const response = await authedFetch(url.pathname + url.search, accessToken);
  if (!response.ok) {
    throw await apiFailure((m, o) => new MessagingApiError(m, o), response, `Couldn't load this conversation (${response.status}).`, false);
  }
  return (await response.json()) as MessagePage;
}

// POST /conversations/:id/messages -- JwtAuthGuard + GuardianConsentGuard
// + participant check. A 403 means the caller is a restricted-pending
// minor (surfaced verbatim so the UI can tell it apart from a generic
// failure -- same convention as PostComposer.tsx).
export async function sendMessage(
  accessToken: string,
  conversationId: string,
  payload: SendMessageRequest,
): Promise<Message> {
  const response = await authedFetch(`/conversations/${conversationId}/messages`, accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw await apiFailure((m, o) => new MessagingApiError(m, o), response, `Couldn't send that message (${response.status}).`, true);
  }
  return (await response.json()) as Message;
}

// PATCH /conversations/:id/read -- marks every message NOT sent by the
// caller as read. Idempotent. Also clears the collapsed "message"
// Notification server-side (sprint-3/banter-messaging-to-code,
// messaging.service.ts's own markConversationRead) -- nothing extra to
// call from here, it's the same one request.
// PATCH /conversations/:id/messages/:messageId { contentText } -- the sender
// edits their own text message. The SERVER clock decides the 15 minutes, so
// a message_edit_window_closed reply is the answer, whatever the client
// thought. Same guard set as a send.
export async function editMessage(
  accessToken: string,
  conversationId: string,
  messageId: string,
  contentText: string,
): Promise<EditMessageResult> {
  const response = await authedFetch(
    `/conversations/${conversationId}/messages/${messageId}`,
    accessToken,
    { method: "PATCH", body: JSON.stringify({ contentText }) },
  );
  if (!response.ok) {
    throw await failure(response, `Couldn't save that edit (${response.status}).`, true);
  }
  return (await response.json()) as EditMessageResult;
}

// DELETE /conversations/:id/messages/:messageId?scope=me|everyone -- 204.
// `me` hides one message for the caller; `everyone` (sender only) replaces
// it with the placeholder for both people. The server keeps the row either way.
export async function deleteMessage(
  accessToken: string,
  conversationId: string,
  messageId: string,
  scope: DeleteMessageScope,
): Promise<void> {
  const response = await authedFetch(
    `/conversations/${conversationId}/messages/${messageId}?scope=${scope}`,
    accessToken,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw await failure(response, `Couldn't delete that message (${response.status}).`, true);
  }
}

// DELETE /conversations/:id -- "Delete chat", for the caller only (204). A
// newer message from the other person brings the chat back with only the
// new messages.
export async function deleteConversation(accessToken: string, conversationId: string): Promise<void> {
  const response = await authedFetch(`/conversations/${conversationId}`, accessToken, { method: "DELETE" });
  if (!response.ok) {
    throw await failure(response, `Couldn't delete that chat (${response.status}).`, true);
  }
}

export async function markConversationRead(
  accessToken: string,
  conversationId: string,
): Promise<MarkReadResult> {
  const response = await authedFetch(`/conversations/${conversationId}/read`, accessToken, {
    method: "PATCH",
  });
  if (!response.ok) {
    throw await apiFailure((m, o) => new MessagingApiError(m, o), response, `Couldn't mark that conversation read (${response.status}).`, false);
  }
  return (await response.json()) as MarkReadResult;
}
