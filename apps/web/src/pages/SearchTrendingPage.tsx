// Community — Search & Trending. Figma source: desktop "Search page with
// trending topics" (2876:4628), mobile "Community — Search & Trending —
// Mobile" (5780:8581), "Soccernity-MVP" file (weZWWqggy9j13eX8bhFgs6).
// Route: /search.
//
// SCOPE OF THIS PR: only the search field + filter chip tabs are built
// here, wired to the real GET /search (Build Plan Section 4.7,
// api/search.ts — resolves Decision Log #139's parked people-search need
// for NewConversationPage.tsx too, see that file's own updated header
// comment). Built desktop-only side cards: right-rail "Trends for you"
// (search/TrendsForYou.tsx, public GET /trending), left-rail "Trending
// News" (search/TrendingNewsPanel.tsx, GET /articles) and right-rail
// "Fixtures" (search/FixturesPanel.tsx, GET /sports/fixtures), and left-rail
// "Suggested" people (search/SuggestedPeoplePanel.tsx, GET /users/suggested,
// Follow via POST /users/:id/follow); the mobile frame has none of these
// sidebars, so they are not mounted (and never fetch) on mobile. The video
// carousel is still UNBUILT — rendered as honest, empty <PlaceholderSlot> regions (no
// fabricated sample data), left for separate follow-up PRs. The "For you"
// personalised feed content shown under the chips on both Figma frames is
// likewise not
// built here — no endpoint backs it, and it wasn't part of this task's
// scope either — so the results area shows either real search results or
// a plain "search above" prompt, never a fake feed.
//
// LOGIN REQUIRED, same family as CommunityPage.tsx / BanterPage.tsx —
// Decision Log #152's site-wide login-gating for the Community/Bants
// pillar. Both Figma frames confirm this: the mobile frame is built
// against `header 4 — mobile` (the logged-in Navbar variant) exclusively,
// with no logged-out counterpart anywhere in the file. GET /search itself
// carries no guard at all (it's a genuinely public endpoint,
// search.controller.ts), so the search call below never sends an
// Authorization header — the gate here is about which SCREEN a
// logged-out visitor may reach, not what the API requires.
//
// Filter chips (mobile: For you/Trending/News; desktop: For you/Trending/
// News/Sport) GENUINELY DIFFER between the two frames — not reconciled
// into one shared set. They are visual-only in this PR: clicking one
// changes which chip is highlighted, but doesn't change what's shown
// below, since none of the four tabs' own content (a personalised feed,
// a trending-posts feed, a news feed, a sport feed) is wired yet. A
// future PR can make them drive real content once that content exists.
//
// Desktop search field — a disclosed departure from the literal Figma
// node. The frame's own top search-field node (2896:4714) is leftover,
// stale composer content cloned from the Community Home Feed template
// before this page was repurposed: an avatar plus a `brand/navy`-filled
// box with `color/text/secondary` "What's happening?" placeholder text —
// navy-on-navy, genuinely illegible (confirmed via a live screenshot, not
// assumed). Reproducing that verbatim would ship a broken, unreadable
// search field. Built instead to match the MOBILE frame's own real
// search-field treatment (green-tint background, "Search players, clubs,
// posts…" placeholder, no avatar), scaled up for the desktop column width
// — the same fix the mobile build session for this page already applied
// to its own copy of this node (see CLAUDE.md's Decision Log #132 entry:
// "composer row → search field").
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  searchAll,
  searchUsers,
  searchClubs,
  searchPosts,
  SearchApiError,
  type SearchAllResult,
  type SearchClubResult,
  type SearchScope,
} from "../api/search";
import { getStoredAccessToken, decodeAccessToken } from "../lib/session";
import { useIsMobile } from "../layout/useIsMobile";
import TrendsForYou from "./search/TrendsForYou";
import TrendingNewsPanel from "./search/TrendingNewsPanel";
import FixturesPanel from "./search/FixturesPanel";
import SuggestedPeoplePanel from "./search/SuggestedPeoplePanel";
import "./search/SearchTrendingPage.css";

type SearchState = "idle" | "loading" | "loaded" | "error";

type FilterChip = "for-you" | "trending" | "news" | "sport";

const MOBILE_FILTERS: FilterChip[] = ["for-you", "trending", "news"];
const DESKTOP_FILTERS: FilterChip[] = ["for-you", "trending", "news", "sport"];

const FILTER_LABELS: Record<FilterChip, string> = {
  "for-you": "For you",
  trending: "Trending",
  news: "News",
  sport: "Sport",
};

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function clubPlace(club: SearchClubResult): string {
  const place = [club.league, club.country].filter(Boolean).join(" • ");
  return place || "Independent";
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// Honest, empty placeholder for a region this PR deliberately does not
// build — no fabricated sample content, matching this task's own
// instruction not to fake trending topics / trending news / suggested
// people / fixtures / video carousel.
function PlaceholderSlot({ title }: { title: string }) {
  return (
    <div className="search-page__placeholder">
      <p className="search-page__placeholder-title">{title}</p>
      <p className="search-page__placeholder-note">Not built yet — coming in a follow-up PR.</p>
    </div>
  );
}

export default function SearchTrendingPage() {
  const token = getStoredAccessToken();
  const decoded = token ? decodeAccessToken(token) : null;
  const isMobile = useIsMobile();

  const [activeFilter, setActiveFilter] = useState<FilterChip>("for-you");

  const [queryInput, setQueryInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [results, setResults] = useState<SearchAllResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<Record<SearchScope, boolean>>({
    users: false,
    clubs: false,
    posts: false,
  });

  const runSearch = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    setActiveQuery(trimmed);
    // Mirrors the server's own minimum (SearchQueryDto / normalizeQuery,
    // 2 chars after trim) — skip the call entirely rather than let every
    // one- or zero-character keystroke round-trip a guaranteed 400.
    if (trimmed.length < 2) {
      setSearchState("idle");
      setResults(null);
      setSearchError(null);
      return;
    }
    setSearchState("loading");
    setSearchError(null);
    try {
      const page = await searchAll(trimmed);
      setResults(page);
      setSearchState("loaded");
    } catch (err) {
      setSearchError(err instanceof SearchApiError ? err.message : "Couldn't search right now.");
      setSearchState("error");
    }
  }, []);

  // Debounced re-query as the user types (300ms — a real server round
  // trip, not a local filter, same "stop typing then search" feel
  // GrassrootsPage.tsx's own city filter and BanterPage.tsx's own room
  // search already use).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (queryInput.trim() === activeQuery) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(queryInput), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [queryInput, activeQuery, runSearch]);

  async function loadMoreUsers() {
    if (!results?.users.nextCursor || loadingMore.users) return;
    setLoadingMore((prev) => ({ ...prev, users: true }));
    try {
      const page = await searchUsers(activeQuery, results.users.nextCursor);
      setResults((prev) => (prev ? { ...prev, users: { items: [...prev.users.items, ...page.items], nextCursor: page.nextCursor } } : prev));
    } catch {
      /* keep what we have; the button stays and can be retried */
    } finally {
      setLoadingMore((prev) => ({ ...prev, users: false }));
    }
  }

  async function loadMoreClubs() {
    if (!results?.clubs.nextCursor || loadingMore.clubs) return;
    setLoadingMore((prev) => ({ ...prev, clubs: true }));
    try {
      const page = await searchClubs(activeQuery, results.clubs.nextCursor);
      setResults((prev) => (prev ? { ...prev, clubs: { items: [...prev.clubs.items, ...page.items], nextCursor: page.nextCursor } } : prev));
    } catch {
      /* keep what we have; the button stays and can be retried */
    } finally {
      setLoadingMore((prev) => ({ ...prev, clubs: false }));
    }
  }

  async function loadMorePosts() {
    if (!results?.posts.nextCursor || loadingMore.posts) return;
    setLoadingMore((prev) => ({ ...prev, posts: true }));
    try {
      const page = await searchPosts(activeQuery, results.posts.nextCursor);
      setResults((prev) => (prev ? { ...prev, posts: { items: [...prev.posts.items, ...page.items], nextCursor: page.nextCursor } } : prev));
    } catch {
      /* keep what we have; the button stays and can be retried */
    } finally {
      setLoadingMore((prev) => ({ ...prev, posts: false }));
    }
  }

  if (!token || !decoded) {
    return (
      <div className="search-page-status" role="status">
        Log in to search Soccernity. <Link to="/login">Log in</Link>
      </div>
    );
  }

  const filters = isMobile ? MOBILE_FILTERS : DESKTOP_FILTERS;
  const noResults = results && results.users.items.length === 0 && results.clubs.items.length === 0 && results.posts.items.length === 0;

  return (
    <div className="search-page">
      <div className="search-page__layout">
        {!isMobile && (
          <aside className="search-page__rail search-page__rail--left">
            <TrendingNewsPanel />
            <SuggestedPeoplePanel accessToken={token} currentUserId={decoded.sub} />
          </aside>
        )}

        <div className="search-page__main">
          <div className="search-page__field">
            <input
              type="search"
              className="search-page__input"
              placeholder="Search players, clubs, posts…"
              aria-label="Search players, clubs, posts"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
            />
          </div>

          <div className="search-page__filters" role="tablist" aria-label="Content filter">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={activeFilter === f}
                className={`search-page__chip${activeFilter === f ? " search-page__chip--active" : ""}`}
                onClick={() => setActiveFilter(f)}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>

          {!isMobile && <PlaceholderSlot title="Videos from Leaderboard" />}

          {searchState === "idle" && (
            <p className="search-page__status" role="status">
              Search for players, clubs, or posts above.
            </p>
          )}

          {searchState === "loading" && (
            <p className="search-page__status" role="status">
              Searching…
            </p>
          )}

          {searchState === "error" && (
            <p className="search-page__status search-page__status--error" role="alert">
              {searchError}
            </p>
          )}

          {searchState === "loaded" && results && noResults && (
            <p className="search-page__status" role="status">
              No results for &ldquo;{activeQuery}&rdquo;.
            </p>
          )}

          {searchState === "loaded" && results && !noResults && (
            <div className="search-page__results">
              <section className="search-page__group">
                <h2 className="search-page__group-title">People</h2>
                {results.users.items.length === 0 ? (
                  <p className="search-page__group-empty">No people found.</p>
                ) : (
                  <ul className="search-page__user-list">
                    {results.users.items.map((u) => (
                      <li key={u.id} className="search-page__user-row">
                        <span className="search-page__avatar" aria-hidden="true">
                          {initialsFor(u.displayName)}
                        </span>
                        <span className="search-page__user-name">{u.displayName}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {results.users.nextCursor && (
                  <button type="button" className="search-page__load-more" onClick={loadMoreUsers} disabled={loadingMore.users}>
                    {loadingMore.users ? "Loading…" : "Load more people"}
                  </button>
                )}
              </section>

              <section className="search-page__group">
                <h2 className="search-page__group-title">Clubs</h2>
                {results.clubs.items.length === 0 ? (
                  <p className="search-page__group-empty">No clubs found.</p>
                ) : (
                  <ul className="search-page__club-list">
                    {results.clubs.items.map((c) => (
                      <li key={c.id}>
                        <Link to={`/clubs/${c.id}`} className="search-page__club-row">
                          {c.logoUrl ? (
                            <img src={c.logoUrl} alt="" className="search-page__club-badge" width={40} height={40} />
                          ) : (
                            <span className="search-page__club-badge search-page__club-badge--initial" aria-hidden="true">
                              {c.name.trim()[0]?.toUpperCase() ?? "?"}
                            </span>
                          )}
                          <span className="search-page__club-meta">
                            <span className="search-page__club-name">{c.name}</span>
                            <span className="search-page__club-place">{clubPlace(c)}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {results.clubs.nextCursor && (
                  <button type="button" className="search-page__load-more" onClick={loadMoreClubs} disabled={loadingMore.clubs}>
                    {loadingMore.clubs ? "Loading…" : "Load more clubs"}
                  </button>
                )}
              </section>

              <section className="search-page__group">
                <h2 className="search-page__group-title">Posts</h2>
                {results.posts.items.length === 0 ? (
                  <p className="search-page__group-empty">No posts found.</p>
                ) : (
                  <ul className="search-page__post-list">
                    {results.posts.items.map((p) => (
                      <li key={p.id} className="search-page__post-row">
                        <div className="search-page__post-header">
                          <span className="search-page__avatar" aria-hidden="true">
                            {initialsFor(p.author.displayName)}
                          </span>
                          <span className="search-page__post-author">{p.author.displayName}</span>
                          <span className="search-page__post-time">{relativeTime(p.createdAt)}</span>
                        </div>
                        <p className="search-page__post-text">{p.contentText}</p>
                        <div className="search-page__post-stats">
                          <span>{p.commentCount} comments</span>
                          <span>{p.likeCount} likes</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {results.posts.nextCursor && (
                  <button type="button" className="search-page__load-more" onClick={loadMorePosts} disabled={loadingMore.posts}>
                    {loadingMore.posts ? "Loading…" : "Load more posts"}
                  </button>
                )}
              </section>
            </div>
          )}
        </div>

        {!isMobile && (
          <aside className="search-page__rail search-page__rail--right">
            <TrendsForYou />
            <FixturesPanel />
          </aside>
        )}
      </div>
    </div>
  );
}
