// Contest — "this month's contest": how it works, the current week's task, the caller's
// own entry status, and the weekly/monthly winners so far.
//
// Figma source: "Contest" details frame (2155:1062, "How Contest works" / "Task for
// this week" / "Join Contest"), plus the Leaderboard Contest-tab connectors
// ("View this week's contest ›") that point here (Decision Log #61/#70/#71).
//
// LOGIN REQUIRED — no logged-out view, same as LeaderboardPage (Decision Log #129,
// everything Contest/Leaderboard-adjacent is login-gated). A visit with no session
// renders a "log in" prompt and never calls anything.
//
// Wired to GET /contest/current (api/contest.ts, sprint-2/contest-data-model-backend).
// The real Contest mechanic runs monthly in four rounds — weeks 1–3 are weekly skill
// challenges (post a video entry, community votes, each week produces a top 3), and
// week 4 is the Level 1 final where every weekly winner competes for the month's
// overall top 3, tracked on the Leaderboard's Contest tab. The derived phase (vacant →
// week_1 → weeks_1_2 → weeks_1_3 → final_live → crowned) drives what this page shows.
//
// Entries are submitted from the Community composer's "Contest" mode — this page's CTA
// deep-links there via /community?compose=contest. GET /contest/current has no endpoint
// that lists a round's entries, so this page shows the caller's OWN entry status
// (callerEntry) and the judged weekly/monthly winners, not a gallery of every entry.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { getCurrentContest, type CurrentContestResponse, type ContestPhase } from "../api/contest";
import { getStoredAccessToken } from "../lib/session";
import ContestRulesModal from "./contest/ContestRulesModal";
import "./contest/ContestPage.css";

type LoadState = "loading" | "loaded" | "error" | "no-session";

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function phaseHeadline(phase: ContestPhase | null, data: CurrentContestResponse): string {
  switch (phase) {
    case "vacant":
    case "week_1":
    case "weeks_1_2":
    case "weeks_1_3":
      return data.activeRound
        ? `Week ${data.activeRound.weekNumber} is live`
        : "Between weekly rounds";
    case "final_live":
      return "Week 4 — Level 1 final is live";
    case "crowned":
      return "This month's winners are decided";
    default:
      return "No contest is running right now";
  }
}

function phaseBody(phase: ContestPhase | null, data: CurrentContestResponse): string {
  switch (phase) {
    case "vacant":
    case "week_1":
    case "weeks_1_2":
    case "weeks_1_3":
      if (data.activeRound) {
        const closes = formatDate(data.activeRound.closesAt);
        return `Record a short clip of this week's challenge and post it as your contest entry.${
          closes ? ` Entries close ${closes}.` : ""
        } This week's top 3 go through to the Week 4 Level 1 final. You can enter once per week.`;
      }
      return "The next weekly round hasn't opened yet. Check back soon.";
    case "final_live":
      return "Every weekly winner from this month is competing head-to-head now. Follow the live order on the Leaderboard's Contest tab.";
    case "crowned":
      return "The Level 1 final is over. See the month's overall top 3 below and on the Leaderboard.";
    default:
      return "There's no contest cycle running at the moment. The next one starts at the beginning of the month.";
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

  const { phase, cycle, isAcceptingEntries, callerEntry, weeklyWinners, monthlyStandings } = data;

  return (
    <div className="contest-page">
      <header className="contest-hero">
        <p className="contest-hero__eyebrow">This month&rsquo;s</p>
        <h1 className="contest-hero__title">{cycle?.title ?? "Contest"}</h1>
      </header>

      <section className="contest-section">
        <h2 className="contest-section__title">How Contest works</h2>
        <p className="contest-section__body">
          Contest runs monthly, in four rounds. In weeks 1&ndash;3, a new weekly skill challenge opens: post your video
          entry, and the community votes. Each week produces a top 3 &mdash; nine weekly winners across the month (a
          little more or fewer if there are ties). In week 4, every weekly winner competes head-to-head in the Level 1
          final for the month&rsquo;s overall top 3, tracked live on the Leaderboard&rsquo;s Contest tab.
        </p>
      </section>

      <section className="contest-section">
        <div className="contest-phase">
          <span className="contest-phase__pill">{phaseHeadline(phase, data)}</span>
        </div>
        <p className="contest-section__body">{phaseBody(phase, data)}</p>

        {callerEntry ? (
          <p className="contest-entry contest-entry--done" role="status">
            Your entry for week {callerEntry.weekNumber} is in. It&rsquo;s locked for this round &mdash; you can enter
            again when next week&rsquo;s challenge opens.
          </p>
        ) : isAcceptingEntries ? (
          <Link className="contest-cta" to="/community?compose=contest">
            Enter this week&rsquo;s contest
          </Link>
        ) : null}
      </section>

      {weeklyWinners.length > 0 && (
        <section className="contest-section">
          <h2 className="contest-section__title">Weekly winners so far</h2>
          <ul className="contest-winners">
            {weeklyWinners.map((w) => (
              <li key={w.entryId} className="contest-winner">
                <span className="contest-winner__avatar" aria-hidden="true">
                  {initialsFor(w.displayName)}
                </span>
                <span className="contest-winner__name">{w.displayName}</span>
                <span className="contest-winner__round">
                  Week {w.weekNumber} &middot; {w.position === 1 ? "1st" : w.position === 2 ? "2nd" : "3rd"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {monthlyStandings.length > 0 && (
        <section className="contest-section">
          <h2 className="contest-section__title">Monthly winners</h2>
          <ul className="contest-winners">
            {monthlyStandings.map((s) => (
              <li key={s.userId} className="contest-winner">
                <span className="contest-winner__avatar" aria-hidden="true">
                  {initialsFor(s.displayName)}
                </span>
                <span className="contest-winner__name">{s.displayName}</span>
                <span className="contest-winner__round">
                  {s.position === 1 ? "1st" : s.position === 2 ? "2nd" : "3rd"} &middot; Monthly winner
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="contest-footnote">
        {/* Figma: "Contest rules ›" chevron link (6245:14767 desktop /
            6245:14768 mobile), same convention as "View leaderboard ›".
            Opens the rules modal (Decision Log #227) — a <button>, not a
            link, since it opens an in-page overlay rather than navigating. */}
        <button type="button" className="contest-footnote__link" onClick={() => setRulesOpen(true)}>
          Contest rules &rsaquo;
        </button>
      </p>

      <p className="contest-footnote">
        <Link to="/leaderboard?tab=contest">View the Contest leaderboard &rarr;</Link>
      </p>

      {rulesOpen && <ContestRulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  );
}
