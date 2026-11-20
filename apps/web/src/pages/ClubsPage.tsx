// Clubs — Browse. Figma source: "Clubs — Browse — Desktop" (5841:9240) /
// "Clubs — Browse — Mobile" (5841:9306), "Soccernity-MVP" file
// (weZWWqggy9j13eX8bhFgs6), from sprint-2/club-pages-design (PR #142).
// Route: /clubs. Closes the code half of Decision Log #155 — Sprint 2's
// "Club Pages" scope shipped only the one-time onboarding join-picker
// (ClubPickerStep.tsx); this is the persistent, always-reachable version.
//
// Real data only (Build Plan Section 4.4, ClubsService.listClubs):
//   - GET /clubs, cursor-paginated "Load more"          (api/clubs.ts)
//   - each club's Join / Leave button                   (ClubJoinButton)
//
// The name filter is a client-side substring match over the pages already
// loaded — GET /clubs has NO text-search parameter (only league/country
// equality), so the field is labelled "Filter loaded clubs by name" and
// nothing implies a full-catalogue search. Same honest framing
// ClubPickerStep.tsx already uses.
//
// No-session handling mirrors ProfilePage.tsx / CommunityPage.tsx: a
// visit with no stored access token renders a "log in" prompt and never
// calls the API. GET /clubs is JwtAuthGuard-only (clubs.controller.ts).
//
// NOT here, and deliberately so:
//   - No Navbar entry point. The shared Navbar component has no Clubs
//     slot (Decision Log #156, still open) — that's shared-component work
//     touching every screen, out of this task's scope. These pages are
//     reachable by direct URL and via the Club Picker → Fan Page link
//     path; full in-app discoverability waits on #156.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { listClubs, ClubsApiError, type ClubSummary } from "../api/clubs";
import { getStoredAccessToken } from "../lib/session";
import ClubJoinButton from "./clubs/ClubJoinButton";
import "./clubs/ClubsPage.css";

type LoadState = "loading" | "loaded" | "error" | "no-session";

function initialFor(name: string): string {
  return name.trim()[0]?.toUpperCase() ?? "?";
}

function metaLine(club: ClubSummary): string {
  const place = [club.league, club.country].filter(Boolean).join(" • ");
  return place || "Independent";
}

function memberLine(count: number): string {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? "member" : "members"}`;
}

export default function ClubsPage() {
  const token = getStoredAccessToken();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [clubs, setClubs] = useState<ClubSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    if (!token) {
      setLoadState("no-session");
      return;
    }
    setLoadState("loading");
    try {
      const page = await listClubs(token);
      setClubs(page.items);
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
      const page = await listClubs(token, cursor);
      setClubs((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setLoadMoreError(err instanceof ClubsApiError ? err.message : "Couldn't load more clubs.");
    } finally {
      setLoadingMore(false);
    }
  }

  function applyToggle(clubId: string, next: { joined: boolean; memberCount: number }) {
    setClubs((prev) => prev.map((c) => (c.id === clubId ? { ...c, joined: next.joined, memberCount: next.memberCount } : c)));
  }

  if (loadState === "no-session") {
    return (
      <div className="clubs-status" role="status">
        Log in to browse clubs. <Link to="/login">Log in</Link>
      </div>
    );
  }

  const term = filter.trim().toLowerCase();
  const visibleClubs = term ? clubs.filter((c) => c.name.toLowerCase().includes(term)) : clubs;

  return (
    <div className="clubs-page">
      <header className="clubs-page__header">
        <h1 className="clubs-page__title">Clubs</h1>
        <p className="clubs-page__subtitle">
          Browse clubs on Soccernity and follow the ones you support — join or leave at any time.
        </p>
      </header>

      <div className="clubs-search">
        <span className="clubs-search__icon" aria-hidden="true">
          ⌕
        </span>
        <input
          type="search"
          className="clubs-search__input"
          placeholder="Filter loaded clubs by name"
          aria-label="Filter loaded clubs by name"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          disabled={loadState === "loading"}
        />
      </div>

      {loadState === "loading" && (
        <p className="clubs-status" role="status">
          Loading clubs…
        </p>
      )}

      {loadState === "error" && (
        <p className="clubs-status clubs-status--error" role="alert">
          Couldn&rsquo;t load clubs. Please try again shortly.
        </p>
      )}

      {loadState === "loaded" && visibleClubs.length === 0 && (
        <p className="clubs-status" role="status">
          {clubs.length === 0 ? "No clubs yet." : "No clubs match that filter."}
        </p>
      )}

      {loadState === "loaded" && visibleClubs.length > 0 && (
        <ul className="clubs-list">
          {visibleClubs.map((club) => (
            <li key={club.id} className="clubs-card">
              <Link to={`/clubs/${club.id}`} className="clubs-card__link">
                {club.logoUrl ? (
                  <img src={club.logoUrl} alt="" className="clubs-card__badge" width={48} height={48} />
                ) : (
                  <span className="clubs-card__badge clubs-card__badge--initial" aria-hidden="true">
                    {initialFor(club.name)}
                  </span>
                )}
                <span className="clubs-card__meta">
                  <span className="clubs-card__name">{club.name}</span>
                  <span className="clubs-card__place">{metaLine(club)}</span>
                  <span className="clubs-card__members">{memberLine(club.memberCount)}</span>
                </span>
              </Link>
              {token && (
                <ClubJoinButton
                  accessToken={token}
                  clubId={club.id}
                  joined={club.joined}
                  onToggled={(next) => applyToggle(club.id, next)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {cursor && loadState === "loaded" && (
        <button type="button" className="clubs-load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}

      {loadMoreError && (
        <p className="clubs-status clubs-status--error" role="alert">
          {loadMoreError}
        </p>
      )}
    </div>
  );
}
