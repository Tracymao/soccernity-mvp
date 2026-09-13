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
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export interface OtherParticipant {
  id: string;
  displayName: string | null;
}

export interface MessagePreview {
  contentText: string;
  senderId: string;
  sentAt: string;
}

// GET /conversations, POST /conversations (ConversationView). `unreadCount`
// and `lastMessage` are computed per-caller, server-side, on every read --
// never derived client-side.
export interface Conversation {
  id: string;
  otherParticipant: OtherParticipant | null;
  lastMessageAt: string;
  createdAt: string;
  lastMessage: MessagePreview | null;
  unreadCount: number;
}

export interface ConversationPage {
  items: Conversation[];
  nextCursor: string | null;
}

// GET /conversations/:id/messages, POST /conversations/:id/messages
// (MessageView).
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  contentText: string;
  mediaUrl: string | null;
  sentAt: string;
  readAt: string | null;
}

export interface MessagePage {
  items: Message[];
  nextCursor: string | null;
}

export interface SendMessageRequest {
  contentText: string;
  mediaUrl?: string;
}

export interface MarkReadResult {
  conversationId: string;
  markedRead: number;
}

export class MessagingApiError extends Error {
  readonly status?: number;

  constructor(message: string, options?: { status?: number }) {
    super(message);
    this.name = "MessagingApiError";
    this.status = options?.status;
  }
}

interface AuthedFetchInit {
  method?: string;
  body?: string;
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
async function errorMessageFrom(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  if (body && typeof body.message === "string") return body.message;
  if (body && Array.isArray(body.message) && typeof body.message[0] === "string") return body.message[0];
  return fallback;
}

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
    throw new MessagingApiError(
      await errorMessageFrom(response, `Couldn't start that conversation (${response.status}).`),
      { status: response.status },
    );
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
    throw new MessagingApiError(`Couldn't load your messages (${response.status}).`, {
      status: response.status,
    });
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
    throw new MessagingApiError(`Couldn't load this conversation (${response.status}).`, {
      status: response.status,
    });
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
    throw new MessagingApiError(
      await errorMessageFrom(response, `Couldn't send that message (${response.status}).`),
      { status: response.status },
    );
  }
  return (await response.json()) as Message;
}

// PATCH /conversations/:id/read -- marks every message NOT sent by the
// caller as read. Idempotent. Also clears the collapsed "message"
// Notification server-side (sprint-3/banter-messaging-to-code,
// messaging.service.ts's own markConversationRead) -- nothing extra to
// call from here, it's the same one request.
export async function markConversationRead(
  accessToken: string,
  conversationId: string,
): Promise<MarkReadResult> {
  const response = await authedFetch(`/conversations/${conversationId}/read`, accessToken, {
    method: "PATCH",
  });
  if (!response.ok) {
    throw new MessagingApiError(`Couldn't mark that conversation read (${response.status}).`, {
      status: response.status,
    });
  }
  return (await response.json()) as MarkReadResult;
}
