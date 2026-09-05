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
// precedent.
//
// BACKEND STATE, confirmed live before writing this: services/api/src/
// modules/sports/README.md is a placeholder only ("Sprint 4... Not yet
// implemented"), and Decision Log #6 (sports-data vendor) is still open
// and explicitly blocks Sprint 4. There is no fixtures/scores/leagues
// endpoint anywhere. Every league, match and story below is illustrative
// dummy data (see ./sports-hub/sportsHubData.ts) -- the same discipline
// HomePage.tsx applies to its own FIXTURES constant, for the identical
// reason (Decision Log #6).
//
// The league sidebar and search box filter the dummy match list
// client-side only -- there is no real query to call.
import { useMemo, useState } from "react";
import { LEAGUES, MATCHES, RECENT_STORIES, type MatchRow } from "./sports-hub/sportsHubData";
import "./sports-hub/SportsHubPage.css";

function statusClass(status: MatchRow["status"]): string {
  if (status === "live") return "sh-status sh-status--live";
  if (status === "ht") return "sh-status sh-status--ht";
  return "sh-status sh-status--ft";
}

export default function SportsHubPage() {
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filteredLeagues = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? LEAGUES.filter((l) => l.name.toLowerCase().includes(term)) : LEAGUES;
  }, [search]);

  const visibleMatches = selectedLeague ? MATCHES.filter((m) => m.league === selectedLeague) : MATCHES;

  return (
    <div className="sh-page">
      <aside className="sh-sidebar">
        <div className="sh-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            placeholder="Search league"
            aria-label="Search league"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <p className="sh-sidebar__title">Sort by league</p>
        <ul className="sh-league-list">
          <li>
            <button
              type="button"
              className={selectedLeague === null ? "sh-league sh-league--active" : "sh-league"}
              onClick={() => setSelectedLeague(null)}
            >
              All leagues
            </button>
          </li>
          {filteredLeagues.map((league) => (
            <li key={league.id}>
              <button
                type="button"
                className={selectedLeague === league.id ? "sh-league sh-league--active" : "sh-league"}
                onClick={() => setSelectedLeague(league.id)}
              >
                {league.name}
              </button>
            </li>
          ))}
          {filteredLeagues.length === 0 && <li className="sh-league-empty">No leagues match that search.</li>}
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
          <span className="sh-pill sh-pill--active">Live</span>
          <span className="sh-pill">Today</span>
        </div>

        <p className="sh-section-title">
          {selectedLeague ? LEAGUES.find((l) => l.id === selectedLeague)?.name : "Premier League"}
        </p>

        <ul className="sh-match-list">
          {visibleMatches.length === 0 && <li className="sh-league-empty">No matches for this league yet.</li>}
          {visibleMatches.map((m) => (
            <li key={m.id} className="sh-match">
              <span className={statusClass(m.status)}>{m.statusLabel}</span>
              <span className="sh-match__team">{m.home}</span>
              <span className="sh-match__score">{m.homeScore}</span>
              <span className="sh-match__score">{m.awayScore}</span>
              <span className="sh-match__team">{m.away}</span>
            </li>
          ))}
        </ul>

        <p className="sh-disclosure">
          Livescores are illustrative — Soccernity has not yet selected a sports-data vendor (Decision Log #6).
        </p>
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
