// Message — New Conversation (Recipient Picker). Figma source: cloned
// from the real Message pillar shell (`5708:8184` desktop / `5709:8354`
// mobile), per Decision Log #139's resolution of Decision Log #136: ONE
// screen combining a search field with a default "PEOPLE YOU FOLLOW"
// list, "Soccernity-MVP" file (weZWWqggy9j13eX8bhFgs6), from
// sprint-2/decision-log-133-137-followup (PR #128). Route: /messages/new.
//
// LOGIN REQUIRED, same family as MessagesPage.tsx.
//
// Real data: GET /search?scope=users (api/search.ts) -- closes Decision
// Log #139 for real. Section 4.7's Search & Discovery endpoint now
// exists (services/api/src/modules/search/), so the client-side filter
// over the caller's own follow list this page used to fall back to is
// gone -- the search field is a genuine site-wide people search,
// server-side, debounced (300ms), not a local filter. GET /search is
// genuinely public (no Authorization header sent) -- the LOGIN REQUIRED
// gate above is about which screen a logged-out visitor may reach, same
// distinction SearchTrendingPage.tsx's own header comment draws.
//
// There is no default/browse listing any more -- GET /search requires a
// real `q` (>= 2 trimmed chars, SearchQueryDto), so an empty field shows
// a plain "search for someone" prompt rather than the old default follow
// list.
//
// Selecting a person calls POST /conversations (api/messaging.ts
// startConversation) -- find-or-create, so picking someone already
// messaged just resumes that thread. On success, navigates to
// /messages/:conversationId carrying `otherParticipant` via router state
// (ConversationPage.tsx's own header-identity fallback, since
// GET /conversations/:id doesn't exist).
//
// Restricted-pending exclusion is shown by absence in TWO places, not
// new copy: search.service.ts's own VISIBLE_SEARCH_USER_FILTER already
// excludes a restricted-pending minor from ever appearing in these
// results at all (Decision Log #12/#139), and even if one somehow did,
// POST /conversations still 404s on them independently
// (Decision Log #12/#221) -- surfaced as the server's own generic "User
// not found" message, never a distinct "this person can't be messaged"
// state that would leak why.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { startConversation, MessagingApiError } from "../../api/messaging";
import { searchUsers, SearchApiError, type SearchUserResult } from "../../api/search";
import { getStoredAccessToken } from "../../lib/session";
import "./MessagesPage.css";

type SearchState = "idle" | "loading" | "loaded" | "error";

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export default function NewConversationPage() {
  const token = getStoredAccessToken();
  const navigate = useNavigate();

  const [queryInput, setQueryInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [people, setPeople] = useState<SearchUserResult[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [startingId, setStartingId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const runSearch = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    setActiveQuery(trimmed);
    // Mirrors the server's own minimum (SearchQueryDto / normalizeQuery,
    // 2 chars after trim) -- skip the call entirely rather than let every
    // one- or zero-character keystroke round-trip a guaranteed 400.
    if (trimmed.length < 2) {
      setSearchState("idle");
      setPeople([]);
      setCursor(null);
      setSearchError(null);
      return;
    }
    setSearchState("loading");
    setSearchError(null);
    try {
      const page = await searchUsers(trimmed);
      setPeople(page.items);
      setCursor(page.nextCursor);
      setSearchState("loaded");
    } catch (err) {
      setSearchError(err instanceof SearchApiError ? err.message : "Couldn't search right now.");
      setSearchState("error");
    }
  }, []);

  // Debounced re-query as the user types (300ms -- a real server round
  // trip, not a local filter, same "stop typing then search" feel
  // GrassrootsPage.tsx / SearchTrendingPage.tsx already use).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (queryInput.trim() === activeQuery) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(queryInput), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [queryInput, activeQuery, runSearch]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await searchUsers(activeQuery, cursor);
      setPeople((prev) => [...prev, ...page.items]);
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

  if (!token) {
    return (
      <div className="messages-status" role="status">
        Log in to message people. <Link to="/login">Log in</Link>
      </div>
    );
  }

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
          placeholder="Search people"
          aria-label="Search people"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
        />
      </div>

      {searchState === "idle" && (
        <p className="messages-status" role="status">
          Search for someone to message.
        </p>
      )}

      {searchState === "loading" && (
        <p className="messages-status" role="status">
          Searching…
        </p>
      )}

      {searchState === "error" && (
        <p className="messages-status messages-status--error" role="alert">
          {searchError}
        </p>
      )}

      {searchState === "loaded" && people.length === 0 && (
        <p className="messages-status" role="status">
          No one matches &ldquo;{activeQuery}&rdquo;.
        </p>
      )}

      {searchState === "loaded" && people.length > 0 && (
        <ul className="messages-recipient-list">
          {people.map((person) => (
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

      {cursor && searchState === "loaded" && (
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
