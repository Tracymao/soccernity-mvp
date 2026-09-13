// Message — New Conversation (Recipient Picker). Figma source: cloned
// from the real Message pillar shell (`5708:8184` desktop /
// `5709:8354` mobile), per Decision Log #139's resolution of Decision
// Log #136: ONE screen combining a search field with a default "PEOPLE
// YOU FOLLOW" list, "Soccernity-MVP" file (weZWWqggy9j13eX8bhFgs6), from
// sprint-2/decision-log-133-137-followup (PR #128). Route: /messages/new.
//
// LOGIN REQUIRED, same family as MessagesPage.tsx.
//
// Real data: GET /users/:id/following (api/users.ts) -- the caller's own
// follow list, the only "who can I message" source that exists (there is
// no people-search endpoint anywhere in Build Plan Section 4, same gap
// Decision Log #139's own report flagged). The search field is therefore
// a CLIENT-SIDE filter over the already-loaded following page, not a
// site-wide search -- labelled "Search people you follow" rather than
// implying a broader directory. Real-but-scoped, per Decision Log #58's
// "visually present, flagged, not omitted" convention for a
// backend-pending field, applied here to a backend-ABSENT one instead of
// silently disabled.
//
// Selecting a person calls POST /conversations (api/messaging.ts
// startConversation) -- find-or-create, so picking someone already
// messaged just resumes that thread. On success, navigates to
// /messages/:conversationId carrying `otherParticipant` via router state
// (ConversationPage.tsx's own header-identity fallback, since
// GET /conversations/:id doesn't exist).
//
// Restricted-pending exclusion is shown by absence, not new copy: a
// restricted-pending minor recipient (or a deactivated one) 404s at
// POST /conversations (Decision Log #12/#221) -- surfaced as the
// server's own generic "User not found" message, never a distinct
// "this person can't be messaged" state that would leak why.
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { startConversation, MessagingApiError } from "../../api/messaging";
import { getFollowing, type FollowUserSummary } from "../../api/users";
import { getStoredAccessToken, decodeAccessToken } from "../../lib/session";
import "./MessagesPage.css";

type LoadState = "loading" | "loaded" | "error" | "no-session";

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export default function NewConversationPage() {
  const token = getStoredAccessToken();
  const decoded = token ? decodeAccessToken(token) : null;
  const navigate = useNavigate();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [following, setFollowing] = useState<FollowUserSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [filter, setFilter] = useState("");
  const [startingId, setStartingId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !decoded) {
      setLoadState("no-session");
      return;
    }
    setLoadState("loading");
    try {
      const page = await getFollowing(token, decoded.sub);
      setFollowing(page.items);
      setCursor(page.nextCursor);
      setLoadState("loaded");
    } catch {
      setLoadState("error");
    }
  }, [token, decoded?.sub]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadMore() {
    if (!token || !decoded || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getFollowing(token, decoded.sub, cursor);
      setFollowing((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      /* keep what we have; the button stays and can be retried */
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleMessage(personId: string) {
    if (!token || startingId) return;
    setStartingId(personId);
    setStartError(null);
    try {
      const { conversation } = await startConversation(token, personId);
      navigate(`/messages/${conversation.id}`, { state: { otherParticipant: conversation.otherParticipant } });
    } catch (err) {
      setStartError(err instanceof MessagingApiError ? err.message : "Couldn't start that conversation.");
    } finally {
      setStartingId(null);
    }
  }

  if (loadState === "no-session" || !decoded) {
    return (
      <div className="messages-status" role="status">
        Log in to message people. <Link to="/login">Log in</Link>
      </div>
    );
  }

  const term = filter.trim().toLowerCase();
  const visible = term ? following.filter((p) => p.displayName.toLowerCase().includes(term)) : following;

  return (
    <div className="messages-page">
      <header className="messages-page__header">
        <Link to="/messages" className="conversation-page__back">
          ← Messages
        </Link>
        <h1 className="messages-page__title">New message</h1>
      </header>

      <div className="messages-search">
        <span className="messages-search__icon" aria-hidden="true">
          ⌕
        </span>
        <input
          type="search"
          className="messages-search__input"
          placeholder="Search people you follow"
          aria-label="Search people you follow"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <p className="messages-recipient-hint">
        PEOPLE YOU FOLLOW &mdash; there&rsquo;s no site-wide people search yet, so you can message anyone you follow.
      </p>

      {loadState === "loading" && (
        <p className="messages-status" role="status">
          Loading…
        </p>
      )}

      {loadState === "error" && (
        <p className="messages-status messages-status--error" role="alert">
          Couldn&rsquo;t load who you follow. Please try again shortly.
        </p>
      )}

      {loadState === "loaded" && visible.length === 0 && (
        <p className="messages-status" role="status">
          {following.length === 0 ? "You aren't following anyone yet." : "No one matches that search."}
        </p>
      )}

      {loadState === "loaded" && visible.length > 0 && (
        <ul className="messages-recipient-list">
          {visible.map((person) => (
            <li key={person.id} className="messages-recipient">
              <span className="messages-recipient__avatar" aria-hidden="true">
                {initialsFor(person.displayName)}
              </span>
              <span className="messages-recipient__name">{person.displayName}</span>
              <button
                type="button"
                className="messages-recipient__button"
                onClick={() => handleMessage(person.id)}
                disabled={startingId === person.id}
              >
                {startingId === person.id ? "Starting…" : "Message"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {cursor && loadState === "loaded" && (
        <button type="button" className="messages-load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}

      {startError && (
        <p className="messages-status messages-status--error" role="alert">
          {startError}
        </p>
      )}
    </div>
  );
}
