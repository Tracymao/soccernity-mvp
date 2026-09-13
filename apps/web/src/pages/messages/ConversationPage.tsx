// Message — a single conversation thread. Figma source: "Message —
// Conversation — Desktop" (5706:8271) / "Message — Conversation — Mobile"
// (5709:8419) / component "Message — Conversation Actions Menu"
// (5706:8270), "Soccernity-MVP" file (weZWWqggy9j13eX8bhFgs6), from
// sprint-2/mobile-settings-community-message-rebuild (PR #116). Route:
// /messages/:conversationId.
//
// LOGIN REQUIRED, same family as MessagesPage.tsx / CommunityPage.tsx.
//
// Real data (Build Plan Section 4.7, MessagingModule):
//   - GET /conversations/:id/messages -- keyset-paginated NEWEST-first
//     (matching GET /clubs/:id/feed's own direction); each page is
//     reversed here so the on-screen list reads oldest-at-top,
//     newest-at-bottom (standard chat ordering), and "Load earlier
//     messages" PREPENDS the next (older) page rather than appending.
//   - POST /conversations/:id/messages -- send. A 403 means the caller is
//     a restricted-pending minor (Section 5.7's "messaging" is
//     safety-sensitive) -- surfaced as an inline link to /guardian-consent,
//     the same PostComposer.tsx convention.
//   - PATCH /conversations/:id/read -- fired once, non-blocking, right
//     after the thread's first page loads: "the user opened this thread".
//     This is also the ONLY place in the whole app that clears the
//     collapsed 'message' Notification server-side (messaging.service.ts's
//     own markConversationRead, sprint-3/banter-messaging-to-code) --
//     there is no dedicated notifications endpoint to call instead.
//
// THREAD HEADER IDENTITY: there is no `GET /conversations/:id` endpoint
// (messaging/README.md's own "Not built" list -- the client is expected
// to already have conversation metadata from the list or the POST
// response), and `Message` itself carries only `senderId` (an opaque
// id), never a display name -- so there is genuinely no way to recover
// the other participant's name from this route alone. MessagesPage.tsx
// and NewConversationPage.tsx both pass `otherParticipant` via router
// `state` when navigating here. On a direct visit / hard refresh (no
// state survives that), the header falls back to the generic
// "Conversation" rather than inventing or guessing a name. Flagged, not
// a silent bug -- a genuine consequence of Section 4.7 not defining a
// single-conversation read; a real fix is adding `GET /conversations/:id`
// server-side, not something this frontend-only PR can build around.
//
// A 404 (conversation doesn't exist, or the caller isn't a participant --
// MessagingService.assertParticipant never distinguishes the two, a DM
// thread's existence is never disclosed to a non-participant) renders an
// honest "Conversation not found" state, never a crash.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router";
import {
  getMessages,
  sendMessage,
  markConversationRead,
  MessagingApiError,
  type Message,
  type OtherParticipant,
} from "../../api/messaging";
import { getStoredAccessToken, decodeAccessToken } from "../../lib/session";
import "./MessagesPage.css";

type LoadState = "loading" | "loaded" | "error" | "not-found" | "no-session";

const MAX_LENGTH = 3000;

function initialsFor(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function timeFor(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const location = useLocation();
  const passedOther = (location.state as { otherParticipant?: OtherParticipant } | null)?.otherParticipant ?? null;

  const token = getStoredAccessToken();
  const decoded = token ? decodeAccessToken(token) : null;

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [messages, setMessages] = useState<Message[]>([]); // ascending: oldest first, newest last
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const markedReadRef = useRef(false);

  const load = useCallback(async () => {
    if (!token || !decoded) {
      setLoadState("no-session");
      return;
    }
    if (!conversationId) {
      setLoadState("not-found");
      return;
    }
    setLoadState("loading");
    try {
      const page = await getMessages(token, conversationId);
      setMessages([...page.items].reverse());
      setOlderCursor(page.nextCursor);
      setLoadState("loaded");

      // "Opening the thread" -- fire once per mount, non-blocking. Also
      // clears the collapsed 'message' Notification server-side; see this
      // file's own header comment.
      if (!markedReadRef.current) {
        markedReadRef.current = true;
        markConversationRead(token, conversationId).catch(() => {
          /* non-fatal -- the thread already rendered */
        });
      }
    } catch (err) {
      setLoadState(err instanceof MessagingApiError && err.status === 404 ? "not-found" : "error");
    }
  }, [token, decoded?.sub, conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadOlder() {
    if (!token || !conversationId || !olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await getMessages(token, conversationId, olderCursor);
      setMessages((prev) => [...[...page.items].reverse(), ...prev]);
      setOlderCursor(page.nextCursor);
    } catch {
      /* keep what we have; the button stays and can be retried */
    } finally {
      setLoadingOlder(false);
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!token || !conversationId || sending) return;
    const contentText = draft.trim();
    if (!contentText) return;
    setSending(true);
    setSendError(null);
    try {
      const message = await sendMessage(token, conversationId, { contentText });
      setMessages((prev) => [...prev, message]);
      setDraft("");
    } catch (err) {
      setSendError(err instanceof MessagingApiError ? err.message : "Couldn't send that message.");
    } finally {
      setSending(false);
    }
  }

  if (loadState === "no-session" || !decoded) {
    return (
      <div className="messages-status" role="status">
        Log in to view this conversation. <Link to="/login">Log in</Link>
      </div>
    );
  }

  if (loadState === "loading") {
    return (
      <div className="conversation-page">
        <p className="messages-status" role="status">
          Loading conversation…
        </p>
      </div>
    );
  }

  if (loadState === "not-found") {
    return (
      <div className="conversation-page">
        <Link to="/messages" className="conversation-page__back">
          ← Messages
        </Link>
        <p className="messages-status" role="status">
          Conversation not found. <Link to="/messages">Back to messages</Link>
        </p>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="conversation-page">
        <Link to="/messages" className="conversation-page__back">
          ← Messages
        </Link>
        <p className="messages-status messages-status--error" role="alert">
          Couldn&rsquo;t load this conversation. Please try again shortly.
        </p>
      </div>
    );
  }

  // No router state (a direct visit / hard refresh) -> generic header;
  // see this file's own header comment on why nothing better is
  // recoverable from this route alone.
  const headerName = passedOther ? passedOther.displayName ?? "Deleted user" : "Conversation";

  const isConsentBlocked = sendError !== null && /guardian consent/i.test(sendError);

  return (
    <div className="conversation-page">
      <Link to="/messages" className="conversation-page__back">
        ← Messages
      </Link>

      <header className="conversation-page__header">
        <span className="conversation-page__avatar" aria-hidden="true">
          {initialsFor(passedOther?.displayName ?? null)}
        </span>
        <h1 className="conversation-page__name">{headerName}</h1>
      </header>

      <div className="conversation-page__thread">
        {olderCursor && (
          <button type="button" className="conversation-page__older" onClick={loadOlder} disabled={loadingOlder}>
            {loadingOlder ? "Loading…" : "Load earlier messages"}
          </button>
        )}

        {messages.length === 0 && (
          <p className="messages-status" role="status">
            No messages yet — say hello below.
          </p>
        )}

        {messages.map((m) => {
          const mine = m.senderId === decoded.sub;
          return (
            <div key={m.id} className={mine ? "conversation-bubble conversation-bubble--mine" : "conversation-bubble"}>
              <p className="conversation-bubble__text">{m.contentText}</p>
              <span className="conversation-bubble__time">{timeFor(m.sentAt)}</span>
            </div>
          );
        })}
      </div>

      <form className="conversation-composer" onSubmit={handleSend}>
        <input
          type="text"
          className="conversation-composer__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message…"
          maxLength={MAX_LENGTH}
          aria-label="Write a message"
        />
        <button type="submit" className="conversation-composer__submit" disabled={sending || !draft.trim()}>
          {sending ? "Sending…" : "Send"}
        </button>
      </form>

      {sendError && (
        <p className="messages-status messages-status--error" role="alert">
          {isConsentBlocked ? (
            <>
              {sendError} <Link to="/guardian-consent">Check your status</Link>
            </>
          ) : (
            sendError
          )}
        </p>
      )}
    </div>
  );
}
