// "Fixtures" card -- desktop-only right-rail region of Community --
// Search & Trending, under "Trends for you". Figma source: desktop
// "Search page with trending topics" (2876:4628) -- card 2876:4648, title
// 2876:4653, refresh icon 2876:4670, rows 2876:4871 (home name / crest /
// kickoff time or score / crest / away name). The mobile frame
// (5780:8581) has no fixtures sidebar, so SearchTrendingPage.tsx only
// mounts this on desktop (nothing is fetched on mobile).
//
// Wired to the existing public GET /sports/fixtures?date= (api/sports.ts,
// the Sports module), date defaulting to today -- same UTC-day
// convention SportsHubPage.tsx's "Today" view uses (todayIso). No new
// endpoint. GET /sports/fixtures returns every league's matches for the
// day; the first page is cut to the first FIXTURES_COUNT rows (the Figma
// frame shows seven) -- no league is privileged, this is a compact
// "what's on today" glance, not a league table. Full browsing stays on
// /sports-hub.
//
// A row shows the score while the match is live or finished (the frame's
// own top row is the score variant) and the kickoff time otherwise.
// Crests use the vendor's logo when present and a monogram tile
// otherwise -- the same fallback SportsHubPage.tsx's TeamCrest uses. Each
// row links to its match-centre page.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { listFixtures, SportsApiError, type MatchSummary, type TeamRef } from "../../api/sports";
import { formatKickoffTime, monogramFor, todayIso } from "../sports-hub/format";
import refreshIcon from "../../assets/icons/trends-refresh.svg";

export const FIXTURES_COUNT = 7;

type LoadState = "loading" | "loaded" | "error";

function Crest({ team }: { team: TeamRef }) {
  if (team.logo) {
    return <img className="fixtures-card__crest" src={team.logo} alt="" aria-hidden="true" />;
  }
  return (
    <span className="fixtures-card__crest fixtures-card__crest--mono" aria-hidden="true">
      {monogramFor(team.name)}
    </span>
  );
}

function hasScore(match: MatchSummary): boolean {
  return (
    (match.status === "live" || match.status === "finished") &&
    match.homeScore !== null &&
    match.awayScore !== null
  );
}

export default function FixturesPanel() {
  const [items, setItems] = useState<MatchSummary[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  // Guards against an older, slower response overwriting a newer one.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setState((prev) => (prev === "loaded" ? prev : "loading"));
    setError(null);
    try {
      const page = await listFixtures(todayIso());
      if (id !== requestId.current) return;
      setItems(page.items.slice(0, FIXTURES_COUNT));
      setState("loaded");
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof SportsApiError ? err.message : "Couldn't load fixtures right now.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="trends-card" aria-labelledby="fixtures-title">
      <header className="trends-card__header">
        <h2 id="fixtures-title" className="trends-card__title">
          Fixtures
        </h2>
        <button type="button" className="trends-card__refresh" aria-label="Refresh fixtures" onClick={load}>
          <img src={refreshIcon} alt="" width={24} height={24} />
        </button>
      </header>

      {state === "loading" && items.length === 0 && (
        <p className="trends-card__status" role="status">
          Loading fixtures…
        </p>
      )}

      {state === "error" && (
        <p className="trends-card__status trends-card__status--error" role="alert">
          {error}
        </p>
      )}

      {state === "loaded" && items.length === 0 && (
        <p className="trends-card__status" role="status">
          No fixtures today.
        </p>
      )}

      {items.length > 0 && (
        <ul className="trends-card__list">
          {items.map((match) => (
            <li key={match.id} className="fixtures-card__row">
              <Link to={`/sports-hub/matches/${match.id}`} className="fixtures-card__link">
                <span className="fixtures-card__team fixtures-card__team--home">{match.homeTeam.name}</span>
                <Crest team={match.homeTeam} />
                <span className="fixtures-card__time">
                  {hasScore(match) ? `${match.homeScore} - ${match.awayScore}` : formatKickoffTime(match.kickoffTime)}
                </span>
                <Crest team={match.awayTeam} />
                <span className="fixtures-card__team fixtures-card__team--away">{match.awayTeam.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
