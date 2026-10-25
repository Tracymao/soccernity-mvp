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
// BACKEND STATE:
//   - OVERALL board: REAL. Wired to GET /leaderboard (Decision Log #292,
//     the materialized weekly rollup, refreshed every 15 minutes). The
//     endpoint returns { userId, displayName, points, rank } per row for
//     ONE ISO week (defaults to the current week), keyset-paginated, so the
//     board shows the current week only and pages with "Load more". It has
//     no club filter, no all-time period, and no per-row club or
//     weekly-change field, so on this tab: "By club" and "All-time" are
//     disabled with an inline note (never faked client-side), and the
//     Club / 7-day-change columns are not rendered.
//   - COMPETITION board: still illustrative -- the Competition data model
//     (Prediction / Commentary) does not exist (Decision Log #72/#73). See
//     ./leaderboard/leaderboardData.ts.
//   - CONTEST board: REAL. Wired to GET /contest/current and rendered by
//     ./leaderboard/ContestBoard.tsx against the self-running Contest
//     (backend/w7-contest, B-099): the clock-driven calendar state, weekly
//     winners with "Forfeited" in place of a forfeited week's names, the
//     week-4 final's live ranking and the crowned / "No winner this month"
//     states. `?tab=contest` deep-links this tab (used by the Contest page's
//     connector and the contest notifications).
//
// The CLUB filter's options are the caller's real joined clubs (Decision
// Log #128 ties "By club" to clubMemberships; GET /clubs, Decision Log
// #154, is the source). Its initial selection is the caller's real
// represented club from GET /users/:id (Decision Log #74, PATCH
// /users/:id/represented-club). Changing the dropdown here is a local view
// filter only: it does NOT write the represented club. The Settings
// selector owns that write. Wiring this control into the club-axis
// leaderboard is Decision Log #128's own follow-up, not built here.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { listClubs, ClubsApiError, type ClubSummary } from "../api/clubs";
import { getUser } from "../api/users";
import { getCurrentContest, type CurrentContestResponse } from "../api/contest";
import { getLeaderboard, type LeaderboardEntryView } from "../api/leaderboard";
import { decodeAccessToken, getStoredAccessToken } from "../lib/session";
import ContestBoard from "./leaderboard/ContestBoard";
import { COMPETITION_ROWS, initialsFor, type CompetitionType } from "./leaderboard/leaderboardData";
import "./leaderboard/LeaderboardPage.css";

type LoadState = "loading" | "loaded" | "error" | "no-session";
type BoardTab = "overall" | "contest" | "competition";
type Scope = "global" | "club";
type TimePeriod = "weekly" | "all-time";

function medalClass(rank: number): string | null {
  if (rank === 1) return "lb-medal lb-medal--1";
  if (rank === 2) return "lb-medal lb-medal--2";
  if (rank === 3) return "lb-medal lb-medal--3";
  return null;
}

export default function LeaderboardPage() {
  const token = getStoredAccessToken();
  const [searchParams] = useSearchParams();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [tab, setTab] = useState<BoardTab>(searchParams.get("tab") === "contest" ? "contest" : "overall");
  const [scope, setScope] = useState<Scope>("global");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("all-time");
  const [competitionType, setCompetitionType] = useState<CompetitionType>("prediction");

  // Real data: the caller's own club memberships, via the already-live
  // GET /clubs (Decision Log #154's per-caller `joined` field). Used only
  // to populate the CLUB filter -- see this file's header comment.
  const [myClubs, setMyClubs] = useState<ClubSummary[]>([]);
  const [representedClubId, setRepresentedClubId] = useState<string | null>(null);
  const [clubsError, setClubsError] = useState(false);

  // Real data: the Contest tab is wired to GET /contest/current
  // (sprint-2/contest-data-model-backend). Its derived phase and real
  // weeklyWinners / monthlyStandings drive the Contest tab (Decision Log
  // #61/#70/#71) -- a submitted contest entry that gets judged shows up
  // here as a weekly winner. null = not loaded / failed.
  const [contest, setContest] = useState<CurrentContestResponse | null>(null);
  const [contestError, setContestError] = useState(false);

  // Real data: the Overall board, GET /leaderboard (Decision Log #292). One
  // page at a time; "Load more" appends the next keyset page (the ClubsPage
  // pattern). A failed first fetch degrades to an inline message on the
  // Overall tab only -- it never blocks the page.
  const [overallRows, setOverallRows] = useState<LeaderboardEntryView[]>([]);
  const [overallCursor, setOverallCursor] = useState<string | null>(null);
  const [overallError, setOverallError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);

  const myUserId = useMemo(() => (token ? (decodeAccessToken(token)?.sub ?? null) : null), [token]);

  const load = useCallback(async () => {
    if (!token) {
      setLoadState("no-session");
      return;
    }
    setLoadState("loading");
    try {
      const page = await listClubs(token);
      setMyClubs(page.items.filter((c) => c.joined));
    } catch (err) {
      // A failed clubs fetch shouldn't block the whole board -- Global
      // scope and the tables still render; only the "By club" option
      // becomes unavailable.
      setClubsError(err instanceof ClubsApiError);
    }
    if (myUserId) {
      try {
        const profile = await getUser(token, myUserId);
        setRepresentedClubId(profile.representedClub?.id ?? null);
      } catch {
        // Leaves the CLUB filter with no represented club selected; the
        // board itself is unaffected.
      }
    }
    try {
      setContest(await getCurrentContest(token));
    } catch {
      setContestError(true);
    }
    setLoadState("loaded");
  }, [token, myUserId]);

  // Decision Log #128 -- "By club" on the Overall board is the viewer's OWN
  // represented club. Scope "club" with no represented club is shown as an
  // explicit note (clubScopeUnavailable), never as a silent global fallback.
  const clubScopeActive = scope === "club";
  const clubScopeUnavailable = clubScopeActive && representedClubId === null;
  const boardClubId = clubScopeActive ? representedClubId : null;

  useEffect(() => {
    if (!token || clubScopeUnavailable) return;
    let cancelled = false;
    getLeaderboard(token, { clubId: boardClubId ?? undefined })
      .then((page) => {
        if (cancelled) return;
        setOverallRows(page.items);
        setOverallCursor(page.nextCursor);
        setOverallError(false);
        setLoadMoreError(false);
      })
      .catch(() => {
        if (!cancelled) setOverallError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, boardClubId, clubScopeUnavailable]);

  async function loadMoreOverall() {
    if (!token || !overallCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const page = await getLeaderboard(token, { cursor: overallCursor, clubId: boardClubId ?? undefined });
      setOverallRows((prev) => [...prev, ...page.items]);
      setOverallCursor(page.nextCursor);
    } catch {
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    load();
  }, [load]);

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

  // GET /leaderboard has no all-time support, so on the Overall tab the
  // time period is always Weekly. Club scope IS supported there (Decision
  // Log #128), for the viewer's own represented club only.
  const overall = tab === "overall";
  const scopeValue: Scope = scope;
  const periodValue: TimePeriod = overall ? "weekly" : timePeriod;

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
          <p className="lb-meta__muted">
            {tab === "competition"
              ? "Competition board shows sample data for now"
              : tab === "contest"
                ? "Contest board — live data"
                : "Overall board — live data, current week"}
          </p>
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
              aria-checked={scopeValue === "global"}
              className={scopeValue === "global" ? "lb-segment lb-segment--active" : "lb-segment"}
              onClick={() => setScope("global")}
            >
              Global
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={scopeValue === "club"}
              disabled={overall && representedClubId === null}
              title={
                overall && representedClubId === null
                  ? "Choose a club to represent in Settings to see the club board"
                  : undefined
              }
              className={scopeValue === "club" ? "lb-segment lb-segment--active" : "lb-segment"}
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
            disabled={overall || scope !== "club" || myClubs.length === 0}
            value={representedClubId ?? ""}
            onChange={(e) => setRepresentedClubId(e.target.value || null)}
          >
            {myClubs.length === 0 && <option value="">No clubs joined yet</option>}
            {myClubs.length > 0 && representedClubId === null && <option value="">No represented club</option>}
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
              aria-checked={periodValue === "weekly"}
              className={periodValue === "weekly" ? "lb-segment lb-segment--active" : "lb-segment"}
              onClick={() => setTimePeriod("weekly")}
            >
              Weekly
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={periodValue === "all-time"}
              disabled={overall}
              title={overall ? "The Overall board is weekly only for now" : undefined}
              className={periodValue === "all-time" ? "lb-segment lb-segment--active" : "lb-segment"}
              onClick={() => setTimePeriod("all-time")}
            >
              All-time
            </button>
          </div>
        </div>
      </div>

      {overall && (
        <p className="lb-note">
          The Overall board ranks this week only. The all-time view isn&rsquo;t supported yet, so it&rsquo;s
          switched off here.
        </p>
      )}

      {overall && representedClubId === null && (
        <p className="lb-status lb-status--inline" role="status">
          You don&rsquo;t represent a club yet, so the club board isn&rsquo;t available.{" "}
          <Link to="/settings/account/club-representation">Choose a club to represent</Link>
        </p>
      )}

      {!overall && scope === "club" && myClubs.length === 0 && (
        <p className="lb-status lb-status--inline" role="status">
          {clubsError
            ? "Couldn't load your clubs — showing Global instead."
            : "You haven't joined a club yet, so club scope has nothing to show. "}
          <Link to="/clubs">Browse clubs</Link>
        </p>
      )}

      {tab === "contest" && <ContestBoard contest={contest} contestError={contestError} />}

      {tab === "overall" &&
        !clubScopeUnavailable &&
        (overallError ? (
          <p className="lb-status lb-status--inline" role="alert">
            Couldn&rsquo;t load the leaderboard right now. Please try again later.
          </p>
        ) : (
          <table className="lb-table">
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Player</th>
                <th scope="col">Points</th>
              </tr>
            </thead>
            <tbody>
              {overallRows.length === 0 && (
                <tr>
                  <td colSpan={3} className="lb-empty">
                    No ranked players this week yet.
                  </td>
                </tr>
              )}
              {overallRows.map((row) => {
                const isYou = row.userId === myUserId;
                return (
                  <tr key={row.userId} className={isYou ? "lb-row lb-row--you" : "lb-row"}>
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
                          {initialsFor(row.publicName)}
                        </span>
                        <span className="lb-player__name">
                          {row.publicName}
                          {isYou && <span className="lb-you-tag">You</span>}
                        </span>
                      </div>
                    </td>
                    <td className="lb-points">{row.points.toLocaleString("en-GB")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}

      {tab === "competition" && (
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

      {tab === "competition" && (
        <p className="lb-note">
          The Competition board (Prediction / Commentary) isn&rsquo;t live yet &mdash; this table shows sample
          data.
        </p>
      )}

      {tab === "overall" && !clubScopeUnavailable && !overallError && overallCursor && (
        <button type="button" className="lb-load-more" onClick={loadMoreOverall} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}

      {tab === "overall" && loadMoreError && (
        <p className="lb-status lb-status--inline" role="alert">
          Couldn&rsquo;t load more players.
        </p>
      )}

      <p className="lb-note">
        Restricted-pending accounts (guardian consent still pending) and minors under review do not appear on this
        board, per Soccernity&rsquo;s safeguarding rules.
      </p>
    </div>
  );
}
