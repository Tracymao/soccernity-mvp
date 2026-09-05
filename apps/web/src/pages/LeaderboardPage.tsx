// Leaderboard. Figma source: "Leaderboard Page Desktop" (5171:6633),
// "Soccernity-MVP" file (weZWWqggy9j13eX8bhFgs6) -- built across
// Decision Log #61-69 (Contest tab phases, rank medals) and #128-130
// (the club/scope/points-model founder resolution that cleared this
// screen for conversion).
//
// LOGIN REQUIRED -- no logged-out view (Decision Log #129). A visit with
// no stored access token renders a "log in" prompt and never calls
// anything, the same shape ClubsPage.tsx / CommunityPage.tsx use.
//
// BACKEND STATE, confirmed live before writing this (not assumed):
// services/api/src/modules/leaderboard/README.md is a placeholder only
// ("Build target: Sprint 6... Not yet implemented") -- there is no
// GET /leaderboard endpoint, and no Contest/Competition entity exists
// anywhere in prisma/schema.prisma. Per the standing rule that backend
// work is paused, none of this page's ranking data is wired to a real
// endpoint -- see ./leaderboard/leaderboardData.ts for the full
// disclosure. This mirrors the exact discipline HomePage.tsx already
// uses for its own illustrative FIXTURES/TALENT_CLIPS content.
//
// The ONE piece of real data on this page is the CLUB filter's options:
// Decision Log #128 ties the "By club" scope to the caller's real
// `User.clubMemberships`, and GET /clubs (already live, Decision Log
// #154) is the real source for "which clubs is this user a member of."
// There is, however, no live endpoint for the single explicitly-selected
// "represented club" Decision Log #74/#128 describes (no schema column,
// no endpoint -- see CLAUDE.md's "Backend requirements parked" list).
// Per this task's own instruction, that selector is wired against a
// typed stub instead of blocking the page: the dropdown lists the
// caller's REAL joined clubs, but which one is "represented" lives only
// in this component's local state, not persisted anywhere. Flagged as a
// new Decision Log entry (see this PR's description) rather than left
// undocumented.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { listClubs, ClubsApiError, type ClubSummary } from "../api/clubs";
import { getStoredAccessToken } from "../lib/session";
import {
  OVERALL_ROWS,
  CONTEST_ROWS,
  COMPETITION_ROWS,
  TOTAL_RANKED_PLAYERS,
  initialsFor,
  type LeaderboardRow,
  type CompetitionType,
} from "./leaderboard/leaderboardData";
import "./leaderboard/LeaderboardPage.css";

type LoadState = "loading" | "loaded" | "error" | "no-session";
type BoardTab = "overall" | "contest" | "competition";
type Scope = "global" | "club";
type TimePeriod = "weekly" | "all-time";

function changeLabel(change: number | null): string {
  if (change === null) return "—";
  return change > 0 ? `+${change}` : `${change}`;
}

function changeClass(change: number | null): string {
  if (change === null) return "lb-change lb-change--flat";
  return change > 0 ? "lb-change lb-change--up" : "lb-change lb-change--down";
}

function medalClass(rank: number): string | null {
  if (rank === 1) return "lb-medal lb-medal--1";
  if (rank === 2) return "lb-medal lb-medal--2";
  if (rank === 3) return "lb-medal lb-medal--3";
  return null;
}

export default function LeaderboardPage() {
  const token = getStoredAccessToken();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [tab, setTab] = useState<BoardTab>("overall");
  const [scope, setScope] = useState<Scope>("global");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("all-time");
  const [competitionType, setCompetitionType] = useState<CompetitionType>("prediction");

  // Real data: the caller's own club memberships, via the already-live
  // GET /clubs (Decision Log #154's per-caller `joined` field). Used only
  // to populate the CLUB filter -- see this file's header comment.
  const [myClubs, setMyClubs] = useState<ClubSummary[]>([]);
  const [representedClubId, setRepresentedClubId] = useState<string | null>(null);
  const [clubsError, setClubsError] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoadState("no-session");
      return;
    }
    setLoadState("loading");
    try {
      const page = await listClubs(token);
      const joined = page.items.filter((c) => c.joined);
      setMyClubs(joined);
      setRepresentedClubId((prev) => prev ?? joined[0]?.id ?? null);
      setLoadState("loaded");
    } catch (err) {
      // A failed clubs fetch shouldn't block the whole board -- Global
      // scope and the (dummy) tables still render; only the "By club"
      // option becomes unavailable.
      setClubsError(err instanceof ClubsApiError);
      setLoadState("loaded");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const representedClub = useMemo(
    () => myClubs.find((c) => c.id === representedClubId) ?? null,
    [myClubs, representedClubId],
  );

  if (loadState === "no-session") {
    return (
      <div className="lb-status" role="status">
        Log in to see the Leaderboard. <Link to="/login">Log in</Link>
      </div>
    );
  }

  if (loadState === "loading") {
    return (
      <div className="lb-status" role="status">
        Loading the leaderboard…
      </div>
    );
  }

  const rows: LeaderboardRow[] =
    tab === "overall" ? OVERALL_ROWS : tab === "contest" ? CONTEST_ROWS : [];

  // Club-scope filtering is applied to the (dummy) dataset client-side --
  // there is no real per-club leaderboard query to call. Illustrative
  // only, same disclosure as leaderboardData.ts.
  const visibleRows =
    scope === "club" && representedClub ? rows.filter((r) => r.club === representedClub.name) : rows;

  const competitionRows = COMPETITION_ROWS[competitionType];

  return (
    <div className="lb-page">
      <header className="lb-header">
        <div>
          <h1 className="lb-title">Leaderboard</h1>
          <p className="lb-subtitle">See how you stack up against players across Soccernity.</p>
        </div>
        <div className="lb-meta">
          <p>Points update every 15 minutes</p>
          <p className="lb-meta__muted">This board uses illustrative data — Sprint 6 scope</p>
        </div>
      </header>

      <div className="lb-tabs" role="tablist" aria-label="Leaderboard board">
        {(["overall", "contest", "competition"] as BoardTab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? "lb-tab lb-tab--active" : "lb-tab"}
            onClick={() => setTab(t)}
          >
            {t === "overall" ? "Overall" : t === "contest" ? "Contest" : "Competition"}
          </button>
        ))}
      </div>

      <div className="lb-filter-bar">
        <div className="lb-filter">
          <span className="lb-filter__label">1 · SCOPE</span>
          <div className="lb-segmented" role="radiogroup" aria-label="Scope">
            <button
              type="button"
              role="radio"
              aria-checked={scope === "global"}
              className={scope === "global" ? "lb-segment lb-segment--active" : "lb-segment"}
              onClick={() => setScope("global")}
            >
              Global
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={scope === "club"}
              className={scope === "club" ? "lb-segment lb-segment--active" : "lb-segment"}
              onClick={() => setScope("club")}
            >
              By club
            </button>
          </div>
        </div>

        <div className="lb-filter">
          <span className="lb-filter__label">2 · CLUB</span>
          <select
            className="lb-dropdown"
            aria-label="Club"
            disabled={scope !== "club" || myClubs.length === 0}
            value={representedClubId ?? ""}
            onChange={(e) => setRepresentedClubId(e.target.value || null)}
          >
            {myClubs.length === 0 && <option value="">No clubs joined yet</option>}
            {myClubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {tab === "competition" && (
          <div className="lb-filter">
            <span className="lb-filter__label">3 · COMPETITION TYPE</span>
            <select
              className="lb-dropdown"
              aria-label="Competition type"
              value={competitionType}
              onChange={(e) => setCompetitionType(e.target.value as CompetitionType)}
            >
              <option value="prediction">Prediction</option>
              <option value="commentary">Commentary</option>
            </select>
          </div>
        )}

        <div className="lb-filter">
          <span className="lb-filter__label">4 · TIME PERIOD</span>
          <div className="lb-segmented" role="radiogroup" aria-label="Time period">
            <button
              type="button"
              role="radio"
              aria-checked={timePeriod === "weekly"}
              className={timePeriod === "weekly" ? "lb-segment lb-segment--active" : "lb-segment"}
              onClick={() => setTimePeriod("weekly")}
            >
              Weekly
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={timePeriod === "all-time"}
              className={timePeriod === "all-time" ? "lb-segment lb-segment--active" : "lb-segment"}
              onClick={() => setTimePeriod("all-time")}
            >
              All-time
            </button>
          </div>
        </div>
      </div>

      {scope === "club" && myClubs.length === 0 && (
        <p className="lb-status lb-status--inline" role="status">
          {clubsError
            ? "Couldn't load your clubs — showing Global instead."
            : "You haven't joined a club yet, so club scope has nothing to show. "}
          <Link to="/clubs">Browse clubs</Link>
        </p>
      )}

      {tab !== "competition" ? (
        <table className="lb-table">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Player</th>
              <th scope="col">Club</th>
              <th scope="col">7-day change</th>
              <th scope="col">Points</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={5} className="lb-empty">
                  No ranked players match this filter yet.
                </td>
              </tr>
            )}
            {visibleRows.map((row) => (
              <tr key={row.rank} className={row.isYou ? "lb-row lb-row--you" : "lb-row"}>
                <td>
                  {medalClass(row.rank) ? (
                    <span className={medalClass(row.rank) as string} aria-hidden="true">
                      {row.rank}
                    </span>
                  ) : (
                    row.rank
                  )}
                </td>
                <td>
                  <div className="lb-player">
                    <span className="lb-avatar" aria-hidden="true">
                      {initialsFor(row.name)}
                    </span>
                    <span className="lb-player__text">
                      <span className="lb-player__name">
                        {row.name}
                        {row.isYou && <span className="lb-you-tag">You</span>}
                      </span>
                      <span className="lb-player__handle">{row.handle}</span>
                    </span>
                  </div>
                </td>
                <td>{row.club}</td>
                <td className={changeClass(row.weeklyChange)}>{changeLabel(row.weeklyChange)}</td>
                <td className="lb-points">{row.points.toLocaleString("en-GB")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="lb-table">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Player</th>
              <th scope="col">Club</th>
              <th scope="col">{competitionType === "prediction" ? "Accuracy" : "Votes"}</th>
              <th scope="col">Score</th>
            </tr>
          </thead>
          <tbody>
            {competitionRows.map((row) => (
              <tr key={row.rank} className="lb-row">
                <td>
                  {medalClass(row.rank) ? (
                    <span className={medalClass(row.rank) as string} aria-hidden="true">
                      {row.rank}
                    </span>
                  ) : (
                    row.rank
                  )}
                </td>
                <td>
                  <div className="lb-player">
                    <span className="lb-avatar" aria-hidden="true">
                      {initialsFor(row.name)}
                    </span>
                    <span className="lb-player__text">
                      <span className="lb-player__name">{row.name}</span>
                      <span className="lb-player__handle">{row.handle}</span>
                    </span>
                  </div>
                </td>
                <td>{row.club}</td>
                <td>{row.metric}</td>
                <td className="lb-points">{row.score.toLocaleString("en-GB")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === "overall" && (
        <p className="lb-pagination">
          Showing {visibleRows.length} of {TOTAL_RANKED_PLAYERS.toLocaleString("en-GB")} ranked players
        </p>
      )}

      <p className="lb-note">
        Restricted-pending accounts (guardian consent still pending) and minors under review do not appear on this
        board, per Soccernity&rsquo;s safeguarding rules.
      </p>
    </div>
  );
}
