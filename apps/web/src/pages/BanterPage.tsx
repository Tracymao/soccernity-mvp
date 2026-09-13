// Banter ("Bants"). Figma source: "Bants homepage - All feed" (2256:6802)
// + "Bants - search result" (2448:2179), "Soccernity-MVP" file
// (weZWWqggy9j13eX8bhFgs6). Route: /banter (nav label "Bants" -- Decision
// Log #163).
//
// LOGIN REQUIRED. Decision Log #152 establishes site-wide login-gating
// for the Community/Bants family of screens; this mirrors
// CommunityPage.tsx's no-session handling exactly -- a visit with no
// stored access token renders a "log in" prompt and never calls
// anything.
//
// UPDATED (sprint-3/banter-messaging-to-code): the room list is now REAL.
// BanterModule is merged in services/api (sprint-3/banter-rooms-backend;
// Decision Log #275/#276) -- api/banter.ts hits GET /banter-rooms,
// GET /banter-rooms/search, GET /banter-rooms/mine, POST /banter-rooms,
// POST/DELETE /banter-rooms/:id/join. Clicking a room goes to
// /banter/:roomId (BanterRoomPage.tsx) -- the room feed + posting, which
// has no dedicated Figma frame (flagged there, built plain, same
// precedent as ClubFanPage/EditProfileModal's "no screen exists, built
// plain" convention).
//
// STILL DUMMY DATA (unchanged, no endpoint exists for any of this): the
// caller's own profile card is the one real piece in the left rail (name
// via GET /users/:id, unchanged); Trending News, Fixtures (Decision Log
// #6) and Suggested are all illustrative sample content -- see
// ./banter/banterData.ts's own header comment.
//
// SEARCH: "All" rooms uses the REAL server-side ?q= filter
// (GET /banter-rooms, debounced 300ms -- GrassrootsPage's own city-filter
// precedent), since a real search endpoint now exists. "My Bants" has no
// server-side q param (GET /banter-rooms/mine takes none) -- that tab
// filters the already-loaded "mine" page client-side instead, the same
// judgment call ClubsPage.tsx makes for its own client-side name filter.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  listRooms,
  getMyRooms,
  createRoom,
  BanterApiError,
  type BanterRoom,
  type BanterRoomScopeType,
} from "../api/banter";
import { getUser, type UserProfile } from "../api/users";
import { decodeAccessToken, getStoredAccessToken } from "../lib/session";
import BanterJoinButton from "./banter/BanterJoinButton";
import { TRENDS, FIXTURES, SUGGESTED } from "./banter/banterData";
import "./banter/BanterPage.css";

type LoadState = "loading" | "loaded" | "error" | "no-session";
type Category = "all" | "mine";

const SCOPE_OPTIONS: { value: BanterRoomScopeType; label: string }[] = [
  { value: "club", label: "Club" },
  { value: "league", label: "League" },
  { value: "country", label: "Country" },
  { value: "topic", label: "Topic" },
];

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function scopeLabel(scopeType: BanterRoomScopeType): string {
  return SCOPE_OPTIONS.find((o) => o.value === scopeType)?.label ?? scopeType;
}

export default function BanterPage() {
  const token = getStoredAccessToken();
  const decoded = token ? decodeAccessToken(token) : null;
  const navigate = useNavigate();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [category, setCategory] = useState<Category>("all");
  const [queryInput, setQueryInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [rooms, setRooms] = useState<BanterRoom[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createScope, setCreateScope] = useState<BanterRoomScopeType>("topic");
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !decoded) return;
    let cancelled = false;
    getUser(token, decoded.sub)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        /* non-fatal -- the identity card falls back to a generic label */
      });
    return () => {
      cancelled = true;
    };
  }, [token, decoded?.sub]);

  const load = useCallback(
    async (cat: Category, q: string) => {
      if (!token) {
        setLoadState("no-session");
        return;
      }
      setLoadState("loading");
      try {
        const trimmed = q.trim();
        const page =
          cat === "mine" ? await getMyRooms(token) : await listRooms(token, trimmed ? { q: trimmed } : undefined);
        setRooms(page.items);
        setCursor(page.nextCursor);
        setActiveQuery(trimmed);
        setLoadState("loaded");
      } catch {
        setLoadState("error");
      }
    },
    [token],
  );

  // Switching category always starts a fresh, unfiltered fetch for that
  // category -- selectCategory() (below) clears queryInput at the same
  // time, so this and the debounce effect never race.
  useEffect(() => {
    load(category, "");
  }, [category, token, load]);

  // Debounced re-query as the search box is typed, "All" only (a real
  // server round trip -- GrassrootsPage's own city-filter precedent).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!token || category !== "all") return;
    if (queryInput.trim() === activeQuery) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load("all", queryInput), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [queryInput, activeQuery, category, token, load]);

  function selectCategory(next: Category) {
    if (next === category) return;
    setCategory(next);
    setQueryInput("");
  }

  async function loadMore() {
    if (!token || !cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page =
        category === "mine"
          ? await getMyRooms(token, cursor)
          : await listRooms(token, { cursor, ...(activeQuery ? { q: activeQuery } : {}) });
      setRooms((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setLoadMoreError(err instanceof BanterApiError ? err.message : "Couldn't load more rooms.");
    } finally {
      setLoadingMore(false);
    }
  }

  function applyToggle(roomId: string, next: { joined: boolean; memberCount: number }) {
    setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, joined: next.joined, memberCount: next.memberCount } : r)));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!token || createPending) return;
    const name = createName.trim();
    if (!name) return;
    setCreatePending(true);
    setCreateError(null);
    try {
      const room = await createRoom(token, { name, scopeType: createScope });
      navigate(`/banter/${room.id}`);
    } catch (err) {
      setCreateError(err instanceof BanterApiError ? err.message : "Couldn't create that room.");
    } finally {
      setCreatePending(false);
    }
  }

  if (!token || !decoded) {
    return (
      <div className="banter-status" role="status">
        Log in to join the conversation on Bants. <Link to="/login">Log in</Link>
      </div>
    );
  }

  const term = queryInput.trim().toLowerCase();
  // "All" rooms are already server-filtered by activeQuery; "My Bants"
  // has no server-side q param, so it's filtered client-side here.
  const visibleRooms = category === "mine" && term ? rooms.filter((r) => r.name.toLowerCase().includes(term)) : rooms;
  const displayName = profile?.displayName ?? "You";

  return (
    <div className="banter">
      <div className="banter__left">
        <div className="banter-card banter-profile">
          <span className="banter-profile__avatar" aria-hidden="true">
            {initialsFor(displayName)}
          </span>
          <p className="banter-profile__name">{displayName}</p>
          <p className="banter-profile__handle">Bants profile</p>
          <div className="banter-profile__stats">
            <span>
              <strong>—</strong> Followers
            </span>
            <span>
              <strong>—</strong> Posts
            </span>
            <span>
              <strong>—</strong> Following
            </span>
          </div>
          <Link to="/profile" className="banter-profile__link">
            View profile
          </Link>
          <p className="banter-profile__note">Follower/post counts aren&rsquo;t part of Bants yet.</p>
        </div>

        <div className="banter-card">
          <p className="banter-card__title">Trending News</p>
          <p className="banter-card__note">Sample &mdash; no news endpoint yet</p>
          {TRENDS.slice(0, 3).map((t) => (
            <div key={t.topic} className="banter-trend">
              <span>{t.topic}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="banter__center">
        <div className="banter-hero">
          <h1 className="banter-hero__title">Banter Rooms</h1>
          <p className="banter-hero__lede">
            Have fun, create and engage in conversations around your favourite teams, events and players.
          </p>
          {!createOpen && (
            <button type="button" className="banter-hero__cta" onClick={() => setCreateOpen(true)}>
              Create a room
            </button>
          )}
        </div>

        {createOpen && (
          <form className="banter-create" onSubmit={handleCreate}>
            <label className="banter-create__field">
              Room name
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Chelsea vs Arsenal — Matchday Chat"
                minLength={2}
                maxLength={120}
                required
              />
            </label>
            <label className="banter-create__field">
              Scope
              <select value={createScope} onChange={(e) => setCreateScope(e.target.value as BanterRoomScopeType)}>
                {SCOPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="banter-create__actions">
              <button type="submit" className="banter-create__submit" disabled={createPending || !createName.trim()}>
                {createPending ? "Creating…" : "Create room"}
              </button>
              <button
                type="button"
                className="banter-create__cancel"
                onClick={() => {
                  setCreateOpen(false);
                  setCreateError(null);
                }}
              >
                Cancel
              </button>
            </div>
            {createError && (
              <p className="banter-create__error" role="alert">
                {createError}
              </p>
            )}
          </form>
        )}

        <div className="banter-search">
          <span className="banter-search__icon" aria-hidden="true">
            ⌕
          </span>
          <input
            type="search"
            className="banter-search__input"
            placeholder={category === "mine" ? "Filter your rooms by name" : "Search rooms by name"}
            aria-label={category === "mine" ? "Filter your rooms by name" : "Search rooms by name"}
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
          />
        </div>

        {term && (
          <p className="banter-search-result">
            Result showing for &ldquo;{queryInput}&rdquo; ({visibleRooms.length})
          </p>
        )}

        <div className="banter-categories" role="tablist" aria-label="Bants categories">
          <button
            type="button"
            role="tab"
            aria-selected={category === "all"}
            className={category === "all" ? "banter-category banter-category--active" : "banter-category"}
            onClick={() => selectCategory("all")}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={category === "mine"}
            className={category === "mine" ? "banter-category banter-category--active" : "banter-category"}
            onClick={() => selectCategory("mine")}
          >
            My Bants
          </button>
        </div>

        {loadState === "loading" && (
          <p className="banter-status banter-status--inline" role="status">
            Loading rooms…
          </p>
        )}

        {loadState === "error" && (
          <p className="banter-status banter-status--inline" role="alert">
            Couldn&rsquo;t load rooms. Please try again shortly.
          </p>
        )}

        {loadState === "loaded" && (
          <ul className="banter-room-list">
            {visibleRooms.length === 0 && (
              <li className="banter-empty">
                {category === "mine" ? "You haven't joined any rooms yet." : "No rooms match that search."}
              </li>
            )}
            {visibleRooms.map((room) => (
              <li key={room.id} className="banter-room">
                <Link to={`/banter/${room.id}`} className="banter-room__link">
                  <span className="banter-room__avatar" aria-hidden="true">
                    {initialsFor(room.name)}
                  </span>
                  <span className="banter-room__text">
                    <span className="banter-room__name">{room.name}</span>
                    <span className="banter-room__meta">
                      {scopeLabel(room.scopeType)} &middot; {room.memberCount.toLocaleString("en-GB")} members
                    </span>
                  </span>
                </Link>
                <BanterJoinButton
                  accessToken={token}
                  roomId={room.id}
                  joined={room.joined}
                  onToggled={(next) => applyToggle(room.id, next)}
                />
              </li>
            ))}
          </ul>
        )}

        {cursor && loadState === "loaded" && (
          <button type="button" className="banter-load-more" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}

        {loadMoreError && (
          <p className="banter-status banter-status--inline" role="alert">
            {loadMoreError}
          </p>
        )}
      </div>

      <div className="banter__right">
        <div className="banter-card">
          <p className="banter-card__title">Fixtures</p>
          <p className="banter-card__note">Sample &mdash; no fixtures endpoint yet (Decision Log #6)</p>
          {FIXTURES.map((f, i) => (
            <div key={`${f.home}-${f.away}-${i}`} className="banter-fixture">
              <span>{f.home}</span>
              <span className="banter-fixture__time">{f.kickoff}</span>
              <span>{f.away}</span>
            </div>
          ))}
        </div>

        <div className="banter-card">
          <p className="banter-card__title">Suggested</p>
          <p className="banter-card__note">Sample &mdash; no suggestions endpoint yet</p>
          {SUGGESTED.map((s) => (
            <div key={s.handle} className="banter-suggest">
              <span className="banter-suggest__avatar" aria-hidden="true">
                {initialsFor(s.name)}
              </span>
              <span className="banter-suggest__text">
                <span className="banter-suggest__name">{s.name}</span>
                <span className="banter-suggest__handle">{s.handle}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
