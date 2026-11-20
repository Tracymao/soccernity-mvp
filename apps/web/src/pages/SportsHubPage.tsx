// Sports Hub / Livescores. Figma source: "Sports Page" (1009:673, logged
// in) / (205:2, logged out), "Soccernity-MVP" file
// (weZWWqggy9j13eX8bhFgs6). Route: /sports-hub.
//
// NO LOGIN REQUIRED -- unlike Leaderboard/Banter, this screen has both a
// Logged In and a Logged Out canonical Figma frame, and the content
// itself (scores, league list) doesn't depend on the caller's identity.
// The shared Header already renders the correct logged-in/out chrome
// (messages+avatar vs. Login button) -- this page's own content is
// identical either way, matching BlogPage's same-content-both-states
// precedent. Every SportsService route is also genuinely public, the
// same JwtAuthGuard-free posture (see services/api/src/modules/sports/
// README.md's own "Guard -- none, deliberately" section).
//
// B-070 (Decision Log #472): a SIGNED-IN person also gets a kickoff-alert bell on
// each match card (sports-hub/KickoffAlertButton.tsx). The list reads send the
// access token when a session exists so each match carries that person's own
// `kickoffAlert` flag (api/sports.ts); a logged-out visitor sees exactly what they
// always did, with no control.
//
// REAL DATA as of sprint-4/sports-hub-frontend-wiring (Decision Log #6
// resolved -- Highlightly -- by sprint-4/sports-hub-highlightly-backend).
// "Live" reads GET /sports/live-scores; "Today" reads
// GET /sports/fixtures?date=<today>. There is no dedicated
// "list leagues" endpoint, so the league sidebar is derived from whatever
// leagues have actually appeared across the matches this page has loaded
// so far (accumulated across loads, not just the current filtered view,
// so picking a league doesn't shrink the sidebar down to one entry) --
// a disclosed limitation, not a bug. Selecting a league re-queries the
// server (GET .../?league=), the same "server-side filter, not a client
// substring match" pattern GrassrootsPage's city search already
// established -- this codebase has no client-side-only filtering
// precedent for a resource this large. The search box above the league
// list IS a plain client-side substring filter over that accumulated
// league list (matching the original UI), not a second server call.
//
// "Most Recent Stories" stays illustrative sample content -- no
// news/story endpoint exists (see ./sports-hub/sportsHubData.ts).
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  listLiveScores,
  listFixtures,
  SportsApiError,
  type MatchListItem,
} from "../api/sports";
import { useAccessToken } from "../lib/AuthContext";
import { RECENT_STORIES } from "./sports-hub/sportsHubData";
import { matchHasStarted, monogramFor, phaseClass, phaseLabel, todayIso } from "./sports-hub/format";
import { KickoffAlertButton, KickoffAlertError, useKickoffAlert } from "./sports-hub/KickoffAlertButton";
import "./sports-hub/SportsHubPage.css";

type ViewMode = "live" | "today";
type LoadState = "loading" | "loaded" | "error";

interface LeagueOption {
  id: string;
  name: string;
}

function TeamCrest({ name, logo }: { name: string; logo: string | null }) {
  if (logo) {
    return <img className="sh-match__crest" src={logo} alt="" aria-hidden="true" />;
  }
  return (
    <span className="sh-match__crest sh-match__crest--mono" aria-hidden="true">
      {monogramFor(name)}
    </span>
  );
}

// One match card. The kickoff-alert button (B-070) is a SIBLING of the link, not inside it
// (a button inside an anchor is invalid and a click would navigate), laid over the card's right
// edge. Only a signed-in person gets it; the match list itself is public.
function MatchRow({ match: m, signedIn }: { match: MatchListItem; signedIn: boolean }) {
  const alert = useKickoffAlert({
    matchId: m.id,
    initialOn: m.kickoffAlert === true,
    started: matchHasStarted(m),
  });
  return (
    <li>
      <div className="sh-match-row">
        <Link
          to={`/sports-hub/matches/${m.id}`}
          className={signedIn ? "sh-match sh-match--with-alert" : "sh-match"}
        >
          <span className={phaseClass(m.status)}>{phaseLabel(m)}</span>
          <TeamCrest name={m.homeTeam.name} logo={m.homeTeam.logo} />
          <span className="sh-match__team">{m.homeTeam.name}</span>
          <span className="sh-match__score">{m.homeScore ?? "-"}</span>
          <span className="sh-match__score">{m.awayScore ?? "-"}</span>
          <span className="sh-match__team">{m.awayTeam.name}</span>
          <TeamCrest name={m.awayTeam.name} logo={m.awayTeam.logo} />
        </Link>
        {signedIn && (
          <div className="sh-match-row__alert">
            <KickoffAlertButton alert={alert} variant="icon" />
          </div>
        )}
      </div>
      {signedIn && <KickoffAlertError alert={alert} />}
    </li>
  );
}

export default function SportsHubPage() {
  const signedIn = useAccessToken() !== null;
  const [viewMode, setViewMode] = useState<ViewMode>("live");
  const [leagueFilter, setLeagueFilter] = useState<string | null>(null);
  const [leagueSearch, setLeagueSearch] = useState("");

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  // Accumulated across every load (see header comment) so the sidebar
  // stays browsable once a league filter narrows `matches` down.
  const [knownLeagues, setKnownLeagues] = useState<LeagueOption[]>([]);

  function mergeKnownLeagues(items: MatchListItem[]) {
    setKnownLeagues((prev) => {
      const map = new Map(prev.map((l) => [l.id, l.name]));
      for (const m of items) {
        if (m.league.id && m.league.name) map.set(m.league.id, m.league.name);
      }
      return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  const load = useCallback(async (mode: ViewMode, league: string | null) => {
    setLoadState("loading");
    try {
      const page =
        mode === "live"
          ? await listLiveScores(league ? { league } : undefined)
          : await listFixtures(todayIso(), league ? { league } : undefined);
      setMatches(page.items);
      setCursor(page.nextCursor);
      mergeKnownLeagues(page.items);
      setLoadState("loaded");
    } catch {
      setLoadState("error");
    }
  }, []);

  // `signedIn` is a dependency on purpose: the three reads only fill in each match's `kickoffAlert`
  // for a request that carries the access token, so signing in or out re-reads the list.
  useEffect(() => {
    load(viewMode, leagueFilter);
  }, [load, viewMode, leagueFilter, signedIn]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page =
        viewMode === "live"
          ? await listLiveScores({ ...(leagueFilter ? { league: leagueFilter } : {}), cursor })
          : await listFixtures(todayIso(), { ...(leagueFilter ? { league: leagueFilter } : {}), cursor });
      setMatches((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
      mergeKnownLeagues(page.items);
    } catch (err) {
      setLoadMoreError(err instanceof SportsApiError ? err.message : "Couldn't load more matches.");
    } finally {
      setLoadingMore(false);
    }
  }

  const filteredLeagueOptions = leagueSearch.trim()
    ? knownLeagues.filter((l) => l.name.toLowerCase().includes(leagueSearch.trim().toLowerCase()))
    : knownLeagues;

  const selectedLeagueName = leagueFilter ? knownLeagues.find((l) => l.id === leagueFilter)?.name : null;

  function emptyMessage(): string {
    if (selectedLeagueName) {
      return viewMode === "live"
        ? `No live matches in ${selectedLeagueName} right now.`
        : `No matches in ${selectedLeagueName} today.`;
    }
    return viewMode === "live" ? "No live matches right now." : "No matches today.";
  }

  return (
    <div className="sh-page">
      <aside className="sh-sidebar">
        <div className="sh-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            placeholder="Search league"
            aria-label="Search league"
            value={leagueSearch}
            onChange={(e) => setLeagueSearch(e.target.value)}
          />
        </div>
        <p className="sh-sidebar__title">Sort by league</p>
        <ul className="sh-league-list">
          <li>
            <button
              type="button"
              className={leagueFilter === null ? "sh-league sh-league--active" : "sh-league"}
              onClick={() => setLeagueFilter(null)}
            >
              All leagues
            </button>
          </li>
          {filteredLeagueOptions.map((league) => (
            <li key={league.id}>
              <button
                type="button"
                className={leagueFilter === league.id ? "sh-league sh-league--active" : "sh-league"}
                onClick={() => setLeagueFilter(league.id)}
              >
                {league.name}
              </button>
            </li>
          ))}
          {filteredLeagueOptions.length === 0 && <li className="sh-league-empty">No leagues match that search.</li>}
        </ul>
      </aside>

      <main className="sh-main">
        <header className="sh-main__header">
          <h1 className="sh-title">Livescores</h1>
          <div className="sh-tabs">
            <span className="sh-tab sh-tab--active">Scores</span>
            <span className="sh-tab">News</span>
          </div>
        </header>

        <div className="sh-filters">
          <button
            type="button"
            className={viewMode === "live" ? "sh-pill sh-pill--active" : "sh-pill"}
            onClick={() => setViewMode("live")}
          >
            Live
          </button>
          <button
            type="button"
            className={viewMode === "today" ? "sh-pill sh-pill--active" : "sh-pill"}
            onClick={() => setViewMode("today")}
          >
            Today
          </button>
        </div>

        <p className="sh-section-title">{selectedLeagueName ?? "All matches"}</p>

        {loadState === "loading" && (
          <p className="sh-page-status" role="status">
            Loading matches…
          </p>
        )}

        {loadState === "error" && (
          <p className="sh-page-status sh-page-status--error" role="alert">
            Couldn&rsquo;t load matches. Please try again shortly.
          </p>
        )}

        {loadState === "loaded" && (
          <ul className="sh-match-list">
            {matches.length === 0 && <li className="sh-league-empty">{emptyMessage()}</li>}
            {matches.map((m) => (
              <MatchRow key={m.id} match={m} signedIn={signedIn} />
            ))}
          </ul>
        )}

        {cursor && loadState === "loaded" && (
          <button type="button" className="sh-load-more" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}

        {loadMoreError && (
          <p className="sh-page-status sh-page-status--error" role="alert">
            {loadMoreError}
          </p>
        )}
      </main>

      <aside className="sh-stories">
        <p className="sh-sidebar__title">Most Recent Stories</p>
        {RECENT_STORIES.map((s) => (
          <div key={s.title} className="sh-story">
            <div className="sh-story__thumb" aria-hidden="true" />
            <div>
              <p className="sh-story__title">{s.title}</p>
              <p className="sh-story__meta">{s.meta}</p>
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}
