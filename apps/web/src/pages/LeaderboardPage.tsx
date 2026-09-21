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
//   - CONTEST board: REAL, as of sprint-2/contest-posting-flow-to-code.
//     Wired to GET /contest/current (sprint-2/contest-data-model-backend),
//     rendering the derived phase (vacant -> week_1 -> weeks_1_2 ->
//     weeks_1_3 -> final_live -> crowned) and the real weeklyWinners /
//     monthlyStandings (Decision Log #61/#70/#71). A submitted contest
//     entry that gets judged appears here as a weekly winner. See
//     ContestBoard below. `?tab=contest` deep-links this tab (used by the
//     Contest page's connector).
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
import { Link, useSearchParams } from "react-router";
import { listClubs, ClubsApiError, type ClubSummary } from "../api/clubs";
import { getCurrentContest, type CurrentContestResponse } from "../api/contest";
import { getLeaderboard, type LeaderboardEntryView } from "../api/leaderboard";
import { decodeAccessToken, getStoredAccessToken } from "../lib/session";
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

function ordinal(position: number): string {
  return position === 1 ? "1st" : position === 2 ? "2nd" : position === 3 ? "3rd" : `${position}th`;
}

const CONTEST_PHASE_BANNER: Record<string, string> = {
  vacant: "Week 1 round in progress — weekly winners run on the Contest page",
  week_1: "Week 1 winners are in. The board fills as weeks 2 and 3 close.",
  weeks_1_2: "Weeks 1–2 winners are in. Week 3 closes next.",
  weeks_1_3: "All weekly rounds complete. Every weekly winner goes through to the Week 4 Level 1 final.",
  final_live: "LEVEL 1 FINAL · LIVE — every weekly winner is competing for the month's overall top 3.",
  crowned: "Monthly winners decided. These are this month's overall top 3 from the Week 4 Level 1 final.",
};

// The Contest board — wired to GET /contest/current (Decision Log #61/#70/#71). Shows
// the derived phase and the real weekly / monthly winners. Winner rows carry only
// { weekNumber, position, displayName, postId } (the endpoint has no club or points
// field for a winner), so the Figma "CLUB" / "WEEKLY POINTS" columns are deliberately
// omitted rather than filled with dummy data — the same honesty ProfilePage.tsx applies
// to its unbacked fields. Scope / club / time-period filters do not apply here (nothing
// to filter on) — kept visible only to match the Figma filter bar.
function ContestBoard({
  contest,
  contestError,
}: {
  contest: CurrentContestResponse | null;
  contestError: boolean;
}) {
  if (contestError || !contest) {
    return (
      <p className="lb-status lb-status--inline" role="alert">
        Couldn&rsquo;t load the contest right now. <Link to="/contest">Open the Contest page</Link>
      </p>
    );
  }

  if (!contest.cycle) {
    return (
      <p className="lb-status lb-status--inline" role="status">
        No contest is running right now. <Link to="/contest">See how Contest works</Link>
      </p>
    );
  }

  const banner = contest.phase ? CONTEST_PHASE_BANNER[contest.phase] : null;
  const crowned = contest.phase === "crowned" && contest.monthlyStandings.length > 0;
  const hasWeekly = contest.weeklyWinners.length > 0;

  return (
    <div className="lb-contest">
      {banner && (
        <p className="lb-contest__banner" role="status">
          {banner}
        </p>
      )}

      {crowned ? (
        <table className="lb-table">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Player</th>
            </tr>
          </thead>
          <tbody>
            {contest.monthlyStandings.map((s) => (
              <tr key={s.userId} className="lb-row">
                <td>
                  {medalClass(s.position) ? (
                    <span className={medalClass(s.position) as string} aria-hidden="true">
                      {s.position}
                    </span>
                  ) : (
                    s.position
                  )}
                </td>
                <td>
                  <div className="lb-player">
                    <span className="lb-avatar" aria-hidden="true">
                      {initialsFor(s.displayName)}
                    </span>
                    <span className="lb-player__text">
                      <span className="lb-player__name">{s.displayName}</span>
                      <span className="lb-player__handle">{ordinal(s.position)} · Monthly winner</span>
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : hasWeekly ? (
        <table className="lb-table">
          <thead>
            <tr>
              <th scope="col">Weekly round</th>
              <th scope="col">Winner</th>
            </tr>
          </thead>
          <tbody>
            {contest.weeklyWinners.map((w) => (
              <tr key={w.entryId} className="lb-row">
                <td>
                  Week {w.weekNumber}
                  <span className="lb-player__handle"> · {ordinal(w.position)} place</span>
                </td>
                <td>
                  <div className="lb-player">
                    <span className="lb-avatar" aria-hidden="true">
                      {initialsFor(w.displayName)}
                    </span>
                    <span className="lb-player__name">{w.displayName}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="lb-status lb-status--inline" role="status">
          The first weekly round is running now. Weekly winners land here as each round closes.{" "}
          <Link to="/contest">View this week&rsquo;s contest &rsaquo;</Link>
        </p>
      )}

      <p className="lb-contest__footer">
        <Link to="/contest">View this week&rsquo;s contest &rsaquo;</Link>
      </p>
    </div>
  );
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
      const joined = page.items.filter((c) => c.joined);
      setMyClubs(joined);
      setRepresentedClubId((prev) => prev ?? joined[0]?.id ?? null);
    } catch (err) {
      // A failed clubs fetch shouldn't block the whole board -- Global
      // scope and the tables still render; only the "By club" option
      // becomes unavailable.
      setClubsError(err instanceof ClubsApiError);
    }
    try {
      setContest(await getCurrentContest(token));
    } catch {
      setContestError(true);
    }
    try {
      const page = await getLeaderboard(token);
      setOverallRows(page.items);
      setOverallCursor(page.nextCursor);
      setOverallError(false);
    } catch {
      setOverallError(true);
    }
    setLoadState("loaded");
  }, [token]);

  async function loadMoreOverall() {
    if (!token || !overallCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const page = await getLeaderboard(token, { cursor: overallCursor });
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

  // GET /leaderboard has no club or all-time support, so on the Overall tab
  // those two options are disabled and the effective view is always
  // Global + Weekly. Other tabs keep their existing behaviour.
  const overall = tab === "overall";
  const scopeValue: Scope = overall ? "global" : scope;
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
              ? "Competition board uses illustrative data — no data model yet"
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
              disabled={overall}
              title={overall ? "Club scope isn't supported on the Overall board yet" : undefined}
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
          The Overall board ranks this week only. Club scope and the all-time view aren&rsquo;t supported yet, so
          those options are switched off here.
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
                          {initialsFor(row.displayName)}
                        </span>
                        <span className="lb-player__name">
                          {row.displayName}
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
          The Competition board (Prediction / Commentary) has no data model yet &mdash; this table is illustrative
          (Decision Log #72/#73).
        </p>
      )}

      {tab === "overall" && !overallError && overallCursor && (
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
