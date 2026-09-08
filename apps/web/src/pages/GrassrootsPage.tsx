// Grassroots — Browse Teams. Figma source: "Grassroots — 11 Browse Teams
// — Desktop" (6402:18078) / "— Mobile" (6404:18180), "Soccernity-MVP"
// (weZWWqggy9j13eX8bhFgs6), from sprint-5/grassroots-teams-browse
// (Decision Log #265/#266). Route: /grassroots.
//
// Real data only (Build Plan Section 4.5, GrassrootsService.listTeams):
//   - GET /teams?city=, cursor-paginated "Load more"    (api/grassroots.ts)
//
// The search field is a CITY filter that RE-QUERIES the server (GET
// /teams?city= is a server-side exact-match equality filter), NOT the
// client-side substring filter ClubsPage uses — Section 4.5 defines no
// team-name text search. Debounced so a keystroke isn't a request.
//
// No Join / Leave action — GrassrootsTeam has no membership concept
// (Decision Log #265). The whole card is a <Link> to that team's public
// page.
//
// No-session handling mirrors ClubsPage / ClubFanPage: a visit with no
// stored access token renders a "log in" prompt and never calls the API.
// Every Grassroots GET is JwtAuthGuard-only, not public (Decision Log
// #269), even though Figma calls the team page a "Public Team Page".
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { listTeams, leagueTypeLabel, GrassrootsApiError, type GrassrootsTeam } from "../api/grassroots";
import { getStoredAccessToken } from "../lib/session";
import "./grassroots/GrassrootsPage.css";

type LoadState = "loading" | "loaded" | "error" | "no-session";

function monogramFor(name: string): string {
  return name.trim()[0]?.toUpperCase() ?? "?";
}

// "{city}  •  {type} team" — double-spaced around the bullet, matching the
// Figma identity line on frames 9-11.
function metaLine(team: GrassrootsTeam): string {
  return `${team.city}  •  ${leagueTypeLabel(team.leagueType)}`;
}

function TeamBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="grassroots-badge grassroots-badge--verified">
      <span aria-hidden="true">✓</span> VERIFIED TEAM
    </span>
  ) : (
    <span className="grassroots-badge grassroots-badge--unverified">COMMUNITY TEAM · UNVERIFIED</span>
  );
}

export default function GrassrootsPage() {
  const token = getStoredAccessToken();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [teams, setTeams] = useState<GrassrootsTeam[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  // The city typed into the search field, and the city the current
  // `teams` list was actually fetched for (so an empty result can say
  // "No teams in {activeCity} yet" vs "No teams registered yet").
  const [cityInput, setCityInput] = useState("");
  const [activeCity, setActiveCity] = useState("");

  const load = useCallback(
    async (city: string) => {
      if (!token) {
        setLoadState("no-session");
        return;
      }
      setLoadState("loading");
      try {
        const trimmed = city.trim();
        const page = await listTeams(token, trimmed ? { city: trimmed } : undefined);
        setTeams(page.items);
        setCursor(page.nextCursor);
        setActiveCity(trimmed);
        setLoadState("loaded");
      } catch {
        setLoadState("error");
      }
    },
    [token],
  );

  // Initial load.
  useEffect(() => {
    load("");
  }, [load]);

  // Debounced re-query as the city is typed (300ms, matching a plain
  // "stop typing then search" feel — this is a real server round trip,
  // not a local filter).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!token) return;
    if (cityInput.trim() === activeCity) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(cityInput), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [cityInput, activeCity, token, load]);

  async function loadMore() {
    if (!token || !cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await listTeams(token, {
        cursor,
        ...(activeCity ? { city: activeCity } : {}),
      });
      setTeams((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setLoadMoreError(err instanceof GrassrootsApiError ? err.message : "Couldn't load more teams.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (loadState === "no-session") {
    return (
      <div className="grassroots-status" role="status">
        Log in to browse grassroots teams. <Link to="/login">Log in</Link>
      </div>
    );
  }

  return (
    <div className="grassroots-page">
      <header className="grassroots-page__header">
        <h1 className="grassroots-page__title">Teams</h1>
        <p className="grassroots-page__subtitle">
          Browse grassroots teams registered on Soccernity. Search by city to find teams near you, then open a
          team to see its fixtures and results.
        </p>
      </header>

      <div className="grassroots-search">
        <span className="grassroots-search__icon" aria-hidden="true">
          ⌕
        </span>
        <input
          type="search"
          className="grassroots-search__input"
          placeholder="Search teams by city"
          aria-label="Search teams by city"
          value={cityInput}
          onChange={(e) => setCityInput(e.target.value)}
        />
      </div>

      {loadState === "loading" && (
        <p className="grassroots-status" role="status">
          Loading teams…
        </p>
      )}

      {loadState === "error" && (
        <p className="grassroots-status grassroots-status--error" role="alert">
          Couldn&rsquo;t load teams. Please try again shortly.
        </p>
      )}

      {loadState === "loaded" && teams.length === 0 && (
        <div className="grassroots-empty">
          {activeCity ? (
            <>
              <p className="grassroots-empty__title">No teams in {activeCity} yet</p>
              <p className="grassroots-empty__body">
                No grassroots teams have registered in this city yet. Try another city, or register your own team
                to start logging fixtures and results.
              </p>
            </>
          ) : (
            <>
              <p className="grassroots-empty__title">No teams registered yet</p>
              <p className="grassroots-empty__body">
                No grassroots teams have been registered on Soccernity yet. Be the first — register your team to
                start logging fixtures and results.
              </p>
            </>
          )}
        </div>
      )}

      {loadState === "loaded" && teams.length > 0 && (
        <ul className="grassroots-list">
          {teams.map((team) => (
            <li key={team.id}>
              <Link to={`/grassroots/${team.id}`} className="grassroots-card">
                <div className="grassroots-card__row">
                  <span className="grassroots-card__monogram" aria-hidden="true">
                    {monogramFor(team.name)}
                  </span>
                  <span className="grassroots-card__info">
                    <span className="grassroots-card__name">{team.name}</span>
                    <span className="grassroots-card__meta">{metaLine(team)}</span>
                    <TeamBadge verified={team.verified} />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {cursor && loadState === "loaded" && (
        <button type="button" className="grassroots-load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}

      {loadMoreError && (
        <p className="grassroots-status grassroots-status--error" role="alert">
          {loadMoreError}
        </p>
      )}
    </div>
  );
}
