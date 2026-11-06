// The message sidebar on the Community page (B-066). Figma source:
// "Messages Window" (1306:2548) inside frame 1306:354, "Soccernity-MVP"
// file (weZWWqggy9j13eX8bhFgs6). Presentational: CommunityMessages.tsx owns
// the conversation list and the open chats; this renders the panel.
//
// What the frame draws and what is built:
//   - "Messages" title and the compose icon -> /messages/new (the existing
//     recipient picker).
//   - "Search Messages": a client-side filter over the conversations
//     already loaded, by the other person's name (there is no message
//     search endpoint).
//   - The "Inbox" chip: the only list there is, drawn as a static chip.
//   - Conversation rows: initials avatar (no photo data), name, the last
//     message ("You: ..." for your own), a relative age, and a green dot for
//     an unread conversation. The hover "..." on the first row belongs to
//     the conversation actions menu (B-067) and is not built.
//
// FRAME COLOURS NOT COPIED, and why (flagged in the PR): the search bar and
// the Inbox chip are drawn as solid navy pills with navy text (unreadable),
// the unread preview text is off-palette amber #DBA111, the chip border is
// off-palette #041BF2 and the row hover is a grey. All four are drawn from
// the brand tokens instead (green tint 12%, navy, navy semibold).
import { Link } from "react-router";
import type { Conversation } from "../../../api/messaging";
import msgCompose from "../../../assets/icons/msg-compose.svg";
import msgUnreadDot from "../../../assets/icons/msg-unread-dot.svg";
import msgMetaDot from "../../../assets/icons/msg-meta-dot.svg";
import { initialsFor, relativeShort } from "./time";

export type ListState = "loading" | "loaded" | "error";

export interface MessagesSidebarProps {
  currentUserId: string;
  state: ListState;
  restrictedMessage: string | null;
  conversations: Conversation[];
  search: string;
  onSearchChange: (value: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: string | null;
  onLoadMore: () => void;
  onRetry: () => void;
  openIds: string[];
  onOpen: (conversation: Conversation) => void;
}

function nameFor(c: Conversation): string {
  return c.otherParticipant?.publicName ?? "Deleted user";
}

export default function MessagesSidebar({
  currentUserId,
  state,
  restrictedMessage,
  conversations,
  search,
  onSearchChange,
  hasMore,
  loadingMore,
  loadMoreError,
  onLoadMore,
  onRetry,
  openIds,
  onOpen,
}: MessagesSidebarProps) {
  const term = search.trim().toLowerCase();
  const visible = term ? conversations.filter((c) => nameFor(c).toLowerCase().includes(term)) : conversations;

  return (
    <aside className="msg-panel" aria-label="Messages">
      <header className="msg-panel__header">
        <h2 className="msg-panel__title">Messages</h2>
        <Link to="/messages/new" className="msg-panel__compose" aria-label="New message">
          <img src={msgCompose} alt="" width={16.1959} height={16.1962} />
        </Link>
      </header>

      <input
        type="search"
        className="msg-panel__search"
        placeholder="Search Messages"
        aria-label="Search messages"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      <span className="msg-panel__chip">Inbox</span>

      {state === "loading" && (
        <p className="msg-panel__status" role="status">
          Loading your messages…
        </p>
      )}

      {state === "error" && (
        <p className="msg-panel__status msg-panel__status--error" role="alert">
          {restrictedMessage ?? "Couldn’t load your messages. Please try again shortly."}{" "}
          {!restrictedMessage && (
            <button type="button" className="msg-panel__link-button" onClick={onRetry}>
              Try again
            </button>
          )}
        </p>
      )}

      {state === "loaded" && conversations.length === 0 && (
        <div className="msg-panel__empty">
          <p className="msg-panel__empty-title">You don’t have any messages yet</p>
          <p className="msg-panel__empty-body">Send and receive messages with people you follow on Soccernity.</p>
          <Link to="/messages/new" className="msg-panel__empty-cta">
            Start a conversation
          </Link>
        </div>
      )}

      {state === "loaded" && conversations.length > 0 && visible.length === 0 && (
        <p className="msg-panel__status" role="status">
          No conversations match that name.
        </p>
      )}

      {state === "loaded" && visible.length > 0 && (
        <ul className="msg-panel__list">
          {visible.map((c) => {
            const unread = c.unreadCount > 0;
            const last = c.lastMessage;
            const preview = last
              ? `${last.senderId === currentUserId ? "You: " : ""}${last.contentText}`
              : "No messages yet";
            const className = [
              "msg-row",
              unread ? "msg-row--unread" : "",
              openIds.includes(c.id) ? "msg-row--open" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <li key={c.id}>
                <button type="button" className={className} onClick={() => onOpen(c)}>
                  <span className="msg-row__avatar" aria-hidden="true">
                    {initialsFor(c.otherParticipant?.publicName ?? null)}
                  </span>
                  <span className="msg-row__text">
                    <span className="msg-row__name">{nameFor(c)}</span>
                    <span className="msg-row__line">
                      <span className="msg-row__preview">{preview}</span>
                      <img src={msgMetaDot} alt="" width={3} height={3} className="msg-row__sep" />
                      <span className="msg-row__time">{relativeShort(c.lastMessageAt)}</span>
                    </span>
                  </span>
                  {unread && (
                    <img
                      src={msgUnreadDot}
                      alt={`${c.unreadCount} unread`}
                      width={8}
                      height={8}
                      className="msg-row__unread"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {state === "loaded" && hasMore && (
        <button type="button" className="msg-panel__more" onClick={onLoadMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}

      {loadMoreError && (
        <p className="msg-panel__status msg-panel__status--error" role="alert">
          {loadMoreError}
        </p>
      )}
    </aside>
  );
}
