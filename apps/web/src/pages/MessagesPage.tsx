// Messages -- the inbox. Figma source: "Message — Inbox (No Conversation
// Selected) — Desktop" (5708:8184) / "Message — Empty Inbox (No
// Conversations) — Desktop" (5708:8362), "Soccernity-MVP" file
// (weZWWqggy9j13eX8bhFgs6), from sprint-2/mobile-settings-community-
// message-rebuild (PR #116). Route: /messages.
//
// LOGIN REQUIRED, mirroring CommunityPage.tsx / BanterPage.tsx (Decision
// Log #152's family of authenticated-only screens) -- a visit with no
// stored access token renders a "log in" prompt and never calls the API.
//
// Real data (Build Plan Section 4.7, MessagingModule -- sprint-3/
// messaging-direct-messaging, Decision Log #277):
//   - GET /conversations, keyset-paginated most-recent-activity-first
//     (api/messaging.ts) -- each row: the other participant's name,
//     a last-message preview, and a real per-caller unreadCount.
//
// Clicking a conversation goes to /messages/:conversationId
// (ConversationPage.tsx), carrying `otherParticipant` via router state so
// the thread doesn't need a GET /conversations/:id endpoint (which
// doesn't exist -- Section 4.7 has no such route, see messaging/README.md's
// "Not built" list). "New message" goes to /messages/new
// (NewConversationPage.tsx, the recipient picker, Decision Log #139).
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { listConversations, MessagingApiError, type Conversation } from "../api/messaging";
import { getStoredAccessToken, decodeAccessToken } from "../lib/session";
import "./messages/MessagesPage.css";

type LoadState = "loading" | "loaded" | "error" | "no-session";

function initialsFor(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

// A hard-deleted participant (Decision Log #44's account-deletion
// cascade removes their User row, but Conversation.participantIds keeps
// the dead id) leaves otherParticipant.displayName null. Rendered
// honestly rather than crashing or showing "null" -- see messaging/
// README.md's own note on this.
function nameFor(conversation: Conversation): string {
  return conversation.otherParticipant?.displayName ?? "Deleted user";
}

function previewFor(conversation: Conversation): string {
  if (!conversation.lastMessage) return "No messages yet — say hello.";
  return conversation.lastMessage.contentText;
}

function timeFor(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function MessagesPage() {
  const token = getStoredAccessToken();
  const decoded = token ? decodeAccessToken(token) : null;

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoadState("no-session");
      return;
    }
    setLoadState("loading");
    try {
      const page = await listConversations(token);
      setConversations(page.items);
      setCursor(page.nextCursor);
      setLoadState("loaded");
    } catch {
      setLoadState("error");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadMore() {
    if (!token || !cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await listConversations(token, cursor);
      setConversations((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setLoadMoreError(err instanceof MessagingApiError ? err.message : "Couldn't load more conversations.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (loadState === "no-session" || !decoded) {
    return (
      <div className="messages-status" role="status">
        Log in to see your messages. <Link to="/login">Log in</Link>
      </div>
    );
  }

  return (
    <div className="messages-page">
      <header className="messages-page__header">
        <h1 className="messages-page__title">Messages</h1>
        <Link to="/messages/new" className="messages-page__new">
          New message
        </Link>
      </header>

      {loadState === "loading" && (
        <p className="messages-status" role="status">
          Loading your messages…
        </p>
      )}

      {loadState === "error" && (
        <p className="messages-status messages-status--error" role="alert">
          Couldn&rsquo;t load your messages. Please try again shortly.
        </p>
      )}

      {loadState === "loaded" && conversations.length === 0 && (
        <div className="messages-empty">
          <p className="messages-empty__title">You don&rsquo;t have any messages yet</p>
          <p className="messages-empty__body">
            Send and receive messages with people you follow on Soccernity.
          </p>
          <Link to="/messages/new" className="messages-empty__cta">
            Start a conversation
          </Link>
        </div>
      )}

      {loadState === "loaded" && conversations.length > 0 && (
        <ul className="messages-list">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                to={`/messages/${c.id}`}
                className={c.unreadCount > 0 ? "messages-row messages-row--unread" : "messages-row"}
                state={{ otherParticipant: c.otherParticipant }}
              >
                <span className="messages-row__avatar" aria-hidden="true">
                  {initialsFor(c.otherParticipant?.displayName ?? null)}
                </span>
                <span className="messages-row__text">
                  <span className="messages-row__name">{nameFor(c)}</span>
                  <span className="messages-row__preview">{previewFor(c)}</span>
                </span>
                <span className="messages-row__meta">
                  <span className="messages-row__time">{timeFor(c.lastMessageAt)}</span>
                  {c.unreadCount > 0 && (
                    <span className="messages-row__badge" aria-label={`${c.unreadCount} unread`}>
                      {c.unreadCount}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {cursor && loadState === "loaded" && (
        <button type="button" className="messages-load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}

      {loadMoreError && (
        <p className="messages-status messages-status--error" role="alert">
          {loadMoreError}
        </p>
      )}
    </div>
  );
}
