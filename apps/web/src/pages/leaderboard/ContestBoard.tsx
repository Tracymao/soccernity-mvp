// The Leaderboard "Contest" tab (build register B-099; Decision Log #61/#70/#71 as amended by #381-#406).
// Figma: the Contest-tab states on Leaderboard Page Desktop 5171:6633 / mobile 5540:7264 -- Vacant,
// weekly fill (Week 1 / Weeks 1-2 / Weeks 1-3 winners in), Forfeited (6659:25987 / 6659:26981),
// Week 4 Final Uploading (6659:26310 / 6659:27163), Live ranking from the reveal (5524:7512 /
// 5541:7527), Crowned (5524:7836 / 5541:7750) and No Winner This Month (6659:26636 / 6659:27348).
//
// Driven by `calendarState` from GET /contest/current (the clock-driven answer). Rules this tab
// follows:
//   - A FORFEITED week is written "Forfeited" in place of its three winner names, and shows NO
//     pop-up (#403 item 9: pop-ups belong to the Contest details and Voting pages).
//   - The week-4 FINAL TASK text sits at the bottom, on the uploading and live-ranking states only
//     (#403 item 10); the API already withholds it elsewhere, and this component only prints it in
//     those two states.
//   - Finalists' entries are hidden until the reveal at 00:00 on day 25, so the uploading state
//     lists WHO the finalists are, never what they posted. From the reveal the ranking is likes +
//     comments (`points`); names open the finalist's profile (#404 item 15).
//   - The minimum tally and every view / impression figure are admin-only and never appear.
//   - Winner rows carry only { week, position, name } (no club, no points), so the Figma "CLUB" and
//     "WEEKLY POINTS" columns are omitted rather than filled with dummy data.
import type { ReactElement } from "react";
import { Link } from "react-router";
import type { ContestFinalRankingRow, CurrentContestResponse } from "../../api/contest";
import { londonClock, londonDayOfMonth, londonLongDate, ordinalPlace } from "../contest/contestTime";
import { initialsFor } from "./leaderboardData";

function medalClass(rank: number): string | null {
  if (rank === 1) return "lb-medal lb-medal--1";
  if (rank === 2) return "lb-medal lb-medal--2";
  if (rank === 3) return "lb-medal lb-medal--3";
  return null;
}

function Player({ userId, name, sub }: { userId: string; name: string; sub?: string }) {
  return (
    <div className="lb-player">
      <span className="lb-avatar" aria-hidden="true">
        {initialsFor(name)}
      </span>
      <span className="lb-player__text">
        <Link to={`/users/${userId}`} className="lb-player__name lb-player__name--link">
          {name}
        </Link>
        {sub && <span className="lb-player__handle">{sub}</span>}
      </span>
    </div>
  );
}

function bannerFor(contest: CurrentContestResponse): string | null {
  const state = contest.calendarState;
  if (!state) return null;
  switch (state.kind) {
    case "upcoming":
      return `Week 1 opens at ${londonClock(state.opensAt)} on ${londonLongDate(state.opensAt)}.`;
    case "week_entries":
      return state.weekNumber === 1
        ? "Week 1 entries are open. The board fills as each week's votes lock."
        : `Week ${state.weekNumber} entries are open. Winners so far are below.`;
    case "week_voting":
      return `Week ${state.weekNumber} voting is open. Votes lock at ${londonClock(state.locksAt)}.`;
    case "week_forfeited":
      return `Week ${state.weekNumber} was forfeited: there is nothing to vote on.`;
    case "between_weeks": {
      const day = londonDayOfMonth(state.nextOpensAt);
      return `Week ${state.afterWeek} is decided. ${state.nextWeek === 4 ? "The final" : `Week ${state.nextWeek}`} opens at ${londonClock(state.nextOpensAt)}${day ? ` on day ${day}` : ""}.`;
    }
    case "final_upload":
      return `WEEK 4 FINAL · FINALISTS ARE UPLOADING. Entries stay hidden until the reveal at ${londonClock(state.revealsAt)} on ${londonLongDate(state.revealsAt)}.`;
    case "final_live":
      return "WEEK 4 FINAL · LIVE. Likes and comments decide the ranking until the end of the month.";
    case "no_final":
      return "No final this month: no weekly winner came through.";
    case "completed":
      return contest.finalOutcome === "no_winner"
        ? "No winner this month."
        : "Monthly winners decided. These are this month's overall top 3 from the Week 4 final.";
    default:
      return null;
  }
}

function WeeklyTable({ contest }: { contest: CurrentContestResponse }) {
  const rows: ReactElement[] = [];
  for (const week of [1, 2, 3]) {
    const round = contest.rounds.find((r) => r.weekNumber === week);
    if (round?.forfeited) {
      rows.push(
        <tr key={`w${week}`} className="lb-row lb-row--forfeited">
          <td>Week {week}</td>
          <td>
            <span className="lb-forfeited">Forfeited</span>
          </td>
        </tr>,
      );
      continue;
    }
    for (const w of contest.weeklyWinners.filter((x) => x.weekNumber === week)) {
      rows.push(
        <tr key={w.entryId} className="lb-row">
          <td>
            Week {week}
            <span className="lb-player__handle"> · {ordinalPlace(w.position)} place</span>
          </td>
          <td>
            <Player userId={w.userId} name={w.publicName} />
          </td>
        </tr>,
      );
    }
  }
  if (rows.length === 0) return null;
  return (
    <table className="lb-table">
      <thead>
        <tr>
          <th scope="col">Weekly round</th>
          <th scope="col">Winner</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
  );
}

function FinalRankingTable({ rows }: { rows: ContestFinalRankingRow[] }) {
  return (
    <table className="lb-table" data-testid="final-ranking">
      <thead>
        <tr>
          <th scope="col">Rank</th>
          <th scope="col">Finalist</th>
          <th scope="col">Points</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.entryId} className="lb-row">
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
              <Player userId={row.userId} name={row.publicName} />
            </td>
            <td>{row.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ContestBoard({
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

  const state = contest.calendarState;
  const banner = bannerFor(contest);
  const kind = state?.kind;
  const finalTask =
    kind === "final_upload" || kind === "final_live"
      ? (contest.rounds.find((r) => r.weekNumber === 4)?.task ?? null)
      : null;

  let body: ReactElement;
  if (kind === "completed" && contest.monthlyStandings.length > 0) {
    body = (
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
                <Player userId={s.userId} name={s.publicName} sub={`${ordinalPlace(s.position)} · Monthly winner`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else if (kind === "final_live" && contest.finalRanking && contest.finalRanking.length > 0) {
    body = <FinalRankingTable rows={contest.finalRanking} />;
  } else if (kind === "final_upload") {
    body =
      contest.finalists.length > 0 ? (
        <ul className="lb-finalists" data-testid="finalists-list">
          {contest.finalists.map((f) => (
            <li key={f.userId} className="lb-finalists__row">
              <Player userId={f.userId} name={f.publicName} sub="Finalist" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="lb-status lb-status--inline" role="status">
          The finalists are being confirmed.
        </p>
      );
  } else if (contest.weeklyWinners.length > 0 || contest.rounds.some((r) => r.forfeited)) {
    body = <WeeklyTable contest={contest} />;
  } else if (kind === "no_final" || kind === "completed") {
    body = (
      <p className="lb-status lb-status--inline" role="status">
        {kind === "completed" && contest.finalOutcome !== "no_winner" ? "This month's contest is over." : "No winner this month."}
      </p>
    );
  } else {
    body = (
      <p className="lb-status lb-status--inline" role="status">
        The first weekly round is running now. Weekly winners land here as each week&rsquo;s votes lock.{" "}
        <Link to="/contest">View this week&rsquo;s contest &rsaquo;</Link>
      </p>
    );
  }

  return (
    <div className="lb-contest">
      {banner && (
        <p className="lb-contest__banner" role="status">
          {banner}
        </p>
      )}

      {body}

      {finalTask && (
        <section className="lb-contest__final-task" aria-label="The final's task">
          <p className="lb-contest__final-task-title">Task for the final</p>
          <p className="lb-contest__final-task-body">{finalTask}</p>
        </section>
      )}

      <p className="lb-contest__footer">
        <Link to="/contest">View this week&rsquo;s contest &rsaquo;</Link>
      </p>
    </div>
  );
}
