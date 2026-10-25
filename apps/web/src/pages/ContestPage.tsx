// Contest -- "this month's contest": how it works, what is happening right now, the caller's own
// entry, and the winners so far.
//
// Figma: Contest Details 2155:1062 / mobile 5801:8635 ("How Contest works", "Task for this week",
// "Join Contest", "Contest rules ›", "View leaderboard ›") and Between Weeks 5802:9183 /
// 5815:8948 (+ the day-1 variant 6716:27347 / 6716:27491), rebuilt against the self-running
// Contest backend (backend/w7-contest, B-091; build register B-099, Decision Log #381-#406).
//
// LOGIN REQUIRED (Decision Log #129): no logged-out view. A visit with no session shows a "log in"
// prompt and calls nothing.
//
// What the page shows is driven by `calendarState` from GET /contest/current -- the clock-driven
// answer, not the old derived phase:
//   upcoming        before week 1 opens (including 00:00-08:00 on day 1: "Week 1 opens at 08:00")
//   week_entries    Phase 1: this week's task and "Join Contest"
//   week_voting     Phase 2: "Vote now" -> /contest/voting
//   week_forfeited  fewer than 3 entries: nothing to vote on
//   between_weeks   20:00 lock to the next 08:00 opening: the week's result and when the next opens
//   final_upload    days 22-24: finalists upload (non-finalists see the closed state in Create Post)
//   final_live      from the reveal: likes and comments rank the final
//   no_final / completed
//
// FORFEIT POP-UPS: on this page and on the Voting page only, every load, one per forfeited week,
// oldest first (ForfeitPopups.tsx).
//
// What is deliberately NOT shown: the minimum tally and placement-point settings (admin-only), any
// view or impression count, and the final's task text (it belongs at the bottom of the leaderboard
// page, #399 E3). Placement points per winner are not returned to users, so a result row shows the
// position and name only (the Figma "+500 pts" is not reproducible from data).
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { getCurrentContest, type CurrentContestResponse } from "../api/contest";
import { getStoredAccessToken } from "../lib/session";
import ContestRulesModal from "./contest/ContestRulesModal";
import ForfeitPopups from "./contest/ForfeitPopups";
import { londonClock, londonDayOfMonth, londonLongDate, ordinalPlace } from "./contest/contestTime";
import "./contest/ContestPage.css";

type LoadState = "loading" | "loaded" | "error" | "no-session";

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function WinnerRow({ name, label, to }: { name: string; label: string; to?: string }) {
  return (
    <li className="contest-winner">
      <span className="contest-winner__avatar" aria-hidden="true">
        {initialsFor(name)}
      </span>
      {to ? (
        <Link to={to} className="contest-winner__name contest-winner__name--link">
          {name}
        </Link>
      ) : (
        <span className="contest-winner__name">{name}</span>
      )}
      <span className="contest-winner__round">{label}</span>
    </li>
  );
}

function StateSection({ data }: { data: CurrentContestResponse }) {
  const state = data.calendarState;
  const round = data.activeRound;

  if (!data.cycle || !state) {
    return (
      <section className="contest-section">
        <h2 className="contest-section__title">No contest right now</h2>
        <p className="contest-section__body">
          There&rsquo;s no contest running at the moment. The next one starts at the beginning of the month.
        </p>
      </section>
    );
  }

  switch (state.kind) {
    case "upcoming":
      return (
        <section className="contest-section">
          <h2 className="contest-section__title">Week 1 opens at {londonClock(state.opensAt)}</h2>
          <p className="contest-section__body">
            The first weekly challenge opens on {londonLongDate(state.opensAt)} at {londonClock(state.opensAt)}.
            Check back then to join.
          </p>
        </section>
      );

    case "week_entries": {
      const task = round?.task ?? data.rounds.find((r) => r.weekNumber === state.weekNumber)?.task ?? null;
      return (
        <section className="contest-section">
          <h2 className="contest-section__title">Task for this week</h2>
          <p className="contest-section__body">
            Week {state.weekNumber} is live. {task}
          </p>
          <p className="contest-section__body">
            Entries close {londonLongDate(state.entriesCloseAt)} at {londonClock(state.entriesCloseAt)}. You can enter
            once per week.
          </p>
          {data.callerEntry ? (
            <p className="contest-entry contest-entry--done" role="status">
              Your entry for week {data.callerEntry.weekNumber} is in. It&rsquo;s locked for this round &mdash; you can
              enter again when next week&rsquo;s challenge opens.
            </p>
          ) : data.callerCanEnter ? (
            <Link className="contest-cta" to="/community?compose=contest">
              Join Contest
            </Link>
          ) : null}
        </section>
      );
    }

    case "week_voting":
      return (
        <section className="contest-section">
          <h2 className="contest-section__title">Voting is open</h2>
          <p className="contest-section__body">
            Week {state.weekNumber}&rsquo;s top entries are up for a vote. Votes alone decide the week&rsquo;s top 3.
            Voting closes at {londonClock(state.locksAt)} on {londonLongDate(state.locksAt)}.
          </p>
          <Link className="contest-cta" to="/contest/voting">
            Vote now
          </Link>
        </section>
      );

    case "week_forfeited": {
      const reason = data.rounds.find((r) => r.weekNumber === state.weekNumber)?.forfeitReason;
      return (
        <section className="contest-section">
          <h2 className="contest-section__title">Week {state.weekNumber} was forfeited</h2>
          <p className="contest-section__body">
            {reason ? `${reason} ` : ""}There is nothing to vote on this week.
          </p>
        </section>
      );
    }

    case "between_weeks": {
      const winners = data.weeklyWinners.filter((w) => w.weekNumber === state.afterWeek);
      const day = londonDayOfMonth(state.nextOpensAt);
      return (
        <section className="contest-section">
          <h2 className="contest-section__title">Between weeks</h2>
          <p className="contest-section__body">
            Voting for this week&rsquo;s challenge closed. This week&rsquo;s result is below. The next week opens at{" "}
            {londonClock(state.nextOpensAt)}.
          </p>
          <div className="contest-result" data-testid="between-weeks-result">
            <p className="contest-result__title">This week&rsquo;s result</p>
            {state.result === "forfeited" || winners.length === 0 ? (
              <p className="contest-result__row">Week {state.afterWeek} was forfeited.</p>
            ) : (
              <ul className="contest-result__list">
                {winners.map((w) => (
                  <li key={w.entryId} className="contest-result__row">
                    <span>{ordinalPlace(w.position)}</span> <span>{w.publicName}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="contest-result__note">
              {state.nextWeek === 4 ? "The final" : "The next week"} opens at {londonClock(state.nextOpensAt)}
              {day ? ` on day ${day}` : ""}.
            </p>
          </div>
          <Link className="contest-cta" to="/leaderboard?tab=contest">
            View this week&rsquo;s results &rsaquo;
          </Link>
        </section>
      );
    }

    case "final_upload":
      return (
        <section className="contest-section">
          <h2 className="contest-section__title">Week 4 final: finalists are uploading</h2>
          <p className="contest-section__body">
            Finalists upload a new video on days 22&ndash;24. Entries stay hidden from everyone but their owner until
            the reveal at {londonClock(state.revealsAt)} on {londonLongDate(state.revealsAt)}.
          </p>
          {data.callerFinalEntry ? (
            <p className="contest-entry contest-entry--done" role="status">
              Your final entry is in. Only you can see it until the reveal.
            </p>
          ) : data.callerCanEnter ? (
            <Link className="contest-cta" to="/community?compose=contest">
              Upload your final entry
            </Link>
          ) : null}
        </section>
      );

    case "final_live":
      return (
        <section className="contest-section">
          <h2 className="contest-section__title">The final is live</h2>
          <p className="contest-section__body">
            Every finalist&rsquo;s entry is now visible. Likes and comments decide the final ranking until the end of
            the month. Follow the live order on the Leaderboard&rsquo;s Contest tab.
          </p>
        </section>
      );

    case "no_final":
      return (
        <section className="contest-section">
          <h2 className="contest-section__title">No final this month</h2>
          <p className="contest-section__body">
            No weekly winner came through this month, so there is no Week 4 final.
          </p>
        </section>
      );

    case "completed":
      return (
        <section className="contest-section">
          <h2 className="contest-section__title">This month&rsquo;s contest is over</h2>
          <p className="contest-section__body">
            {data.finalOutcome === "no_winner"
              ? "No winner this month."
              : "See the month's overall top 3 below and on the Leaderboard."}
          </p>
        </section>
      );

    default:
      return null;
  }
}

export default function ContestPage() {
  const token = getStoredAccessToken();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [data, setData] = useState<CurrentContestResponse | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoadState("no-session");
      return;
    }
    setLoadState("loading");
    try {
      setData(await getCurrentContest(token));
      setLoadState("loaded");
    } catch {
      setLoadState("error");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadState === "no-session") {
    return (
      <div className="contest-status" role="status">
        Log in to see this month&rsquo;s contest. <Link to="/login">Log in</Link>
      </div>
    );
  }

  if (loadState === "loading") {
    return (
      <div className="contest-status" role="status">
        Loading the contest…
      </div>
    );
  }

  if (loadState === "error" || !data) {
    return (
      <div className="contest-status contest-status--error" role="alert">
        Couldn&rsquo;t load the contest. Please try again shortly.
      </div>
    );
  }

  const { cycle, weeklyWinners, monthlyStandings } = data;

  return (
    <div className="contest-page">
      {/* One pop-up per forfeited week, oldest first, on every load. */}
      <ForfeitPopups weeks={data.forfeitedWeeks} />

      <header className="contest-hero">
        <p className="contest-hero__eyebrow">This month&rsquo;s</p>
        <h1 className="contest-hero__title">{cycle?.title ?? "Contest"}</h1>
        {cycle?.description && <p className="contest-section__body">{cycle.description}</p>}
      </header>

      <section className="contest-section">
        <h2 className="contest-section__title">How Contest works</h2>
        <p className="contest-section__body">
          Contest runs monthly, in four rounds. In weeks 1&ndash;3, a new weekly skill challenge opens: post your video
          entry, and the community votes. Each week produces a top 3 &mdash; nine weekly winners across the month
          (fewer if a week is forfeited). In week 4, every weekly winner competes head-to-head in the Week 4 final for
          the month&rsquo;s overall top 3, tracked live on the Leaderboard&rsquo;s Contest tab.
        </p>
      </section>

      <StateSection data={data} />

      {weeklyWinners.length > 0 && (
        <section className="contest-section">
          <h2 className="contest-section__title">Weekly winners so far</h2>
          <ul className="contest-winners">
            {weeklyWinners.map((w) => (
              <WinnerRow
                key={w.entryId}
                name={w.publicName}
                label={`Week ${w.weekNumber} · ${ordinalPlace(w.position)}`}
                to={`/users/${w.userId}`}
              />
            ))}
          </ul>
        </section>
      )}

      {monthlyStandings.length > 0 && (
        <section className="contest-section">
          <h2 className="contest-section__title">Monthly winners</h2>
          <ul className="contest-winners">
            {monthlyStandings.map((s) => (
              <WinnerRow
                key={s.userId}
                name={s.publicName}
                label={`${ordinalPlace(s.position)} · Monthly winner`}
                to={`/users/${s.userId}`}
              />
            ))}
          </ul>
        </section>
      )}

      <p className="contest-footnote">
        {/* Figma: "Contest rules ›" chevron link (6245:14767 desktop / 6245:14768 mobile), same
            convention as "View leaderboard ›". Opens the rules modal (Decision Log #227) -- a
            <button>, not a link, since it opens an in-page overlay rather than navigating. */}
        <button type="button" className="contest-footnote__link" onClick={() => setRulesOpen(true)}>
          Contest rules &rsaquo;
        </button>
      </p>

      <p className="contest-footnote">
        <Link to="/leaderboard?tab=contest">View leaderboard &rsaquo;</Link>
      </p>

      {rulesOpen && <ContestRulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  );
}
