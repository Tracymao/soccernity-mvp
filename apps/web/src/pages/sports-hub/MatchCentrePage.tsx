// Match Centre — the drill-down screen the Sports Hub match list links
// into. Figma source: the "Match Details" / "Match Statistics" / "First
// Half Statistics" / "Second Half Statistics" / "Lineups" / "H2H" /
// "Standing" / "Video" / "Match Momentum" / "Live Commentary" family
// (desktop + mobile), "Soccernity-MVP" (weZWWqggy9j13eX8bhFgs6), from
// sprint-4/sports-hub-highlightly-data-redesign (Decision Log #311-322).
// Route: /sports-hub/matches/:matchId.
//
// NO LOGIN REQUIRED — every SportsService route is genuinely public,
// same as SportsHubPage.tsx. No site footer (a drill-down/detail page,
// same category as ClubFanPage/GrassrootsTeamPage/ContestPage — not in
// FooterLayout's own route list).
//
// IA, following the Figma redesign's own two-level tab system exactly
// (Decision Log #318): Level 1 — Match | H2H | Standings | Video. Level
// 2, sub-tabs of "Match" only — Summary | Statistics | Lineups |
// Momentum | Commentary. Momentum and Live Commentary are genuine
// backend additions beyond Section 4.6's literal endpoint list
// (services/api/src/modules/sports/README.md's own Decision Log
// candidates #4/#5) — built anyway, because without them these two
// designed sections have nothing to wire to.
//
// Every tab's data is fetched LAZILY, on first activation, and cached
// for the life of the page (Section 5.5 discipline — the same
// lazy-loaded-on-click precedent ProfilePage.tsx's Followers/Following
// lists already established), so opening the match summary never pays
// for stats/lineups/standings/video the visitor never looks at.
//
// Two real, confirmed Highlightly data gaps this page does NOT paper
// over (see api/sports.ts's own header comment / the backend README):
//   1. Match Statistics is TEAM-LEVEL only — no per-player box score
//      exists from this vendor. The Figma redesign's player box-score
//      table is NOT reproduced here; an honest disclosure note is shown
//      instead.
//   2. Standings rows carry no "form" (recent-results) field. The Figma
//      Standing screen's FORM column is NOT reproduced; a disclosure
//      note is shown instead.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
  getMatchById,
  getMatchStatistics,
  getMatchLineups,
  getMatchEvents,
  getMatchMomentum,
  getHeadToHead,
  getStandings,
  getHighlights,
  SportsApiError,
  type MatchSummary,
  type MatchStatistics,
  type Lineups,
  type MatchEvents,
  type Momentum,
  type HeadToHead,
  type Standings,
  type Highlights,
  type MatchEvent,
} from "../../api/sports";
import { formatKickoffFull, monogramFor, phaseClass, phaseLabel } from "./format";
import "./SportsHubPage.css";
import "./MatchCentrePage.css";

type Level1Tab = "match" | "h2h" | "standings" | "video";
type MatchSubTab = "summary" | "stats" | "lineups" | "momentum" | "commentary";

type Loadable<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; data: T }
  | { status: "error"; message: string };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof SportsApiError ? err.message : fallback;
}

// A tab's data, fetched once (lazily, on first activation) per matchId
// and cached thereafter — see this file's own header comment.
function useLazyTab<T>(matchId: string | undefined, active: boolean, loader: (id: string) => Promise<T>) {
  const [state, setState] = useState<Loadable<T>>({ status: "idle" });
  const [ownerId, setOwnerId] = useState<string | undefined>(matchId);

  if (ownerId !== matchId) {
    // matchId changed under this component instance (e.g. following a
    // head-to-head meeting link to another match) — reset to idle so
    // the new match's data gets fetched instead of showing stale data.
    setOwnerId(matchId);
    if (state.status !== "idle") setState({ status: "idle" });
  }

  const load = useCallback(() => {
    if (!matchId) return;
    setState({ status: "loading" });
    loader(matchId)
      .then((data) => setState({ status: "loaded", data }))
      .catch((err) => setState({ status: "error", message: errorMessage(err, "Couldn't load that.") }));
  }, [matchId, loader]);

  useEffect(() => {
    if (active && state.status === "idle") load();
  }, [active, state.status, load]);

  return [state, load] as const;
}

function TeamCrest({ name, logo, size = 40 }: { name: string; logo: string | null; size?: number }) {
  if (logo) {
    return <img className="mc-crest" style={{ width: size, height: size }} src={logo} alt="" aria-hidden="true" />;
  }
  return (
    <span className="mc-crest mc-crest--mono" style={{ width: size, height: size }} aria-hidden="true">
      {monogramFor(name)}
    </span>
  );
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mc-section">
      {title && <h2 className="mc-section__title">{title}</h2>}
      {children}
    </section>
  );
}

function StatusMessage({ tone = "info", children }: { tone?: "info" | "error"; children: ReactNode }) {
  return (
    <p className={tone === "error" ? "mc-status mc-status--error" : "mc-status"} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button type="button" className="mc-retry" onClick={onRetry}>
      Try again
    </button>
  );
}

// ---------- Match Summary (sub tab) ----------

function isGoalEvent(e: MatchEvent): boolean {
  return e.type.toLowerCase() === "goal";
}

function MatchSummaryTab({ match, events }: { match: MatchSummary; events: Loadable<MatchEvents> }) {
  return (
    <Section title="Match summary">
      <dl className="mc-facts">
        <div>
          <dt>Competition</dt>
          <dd>{match.competition}{match.league.round ? ` · ${match.league.round}` : ""}</dd>
        </div>
        <div>
          <dt>Kickoff</dt>
          <dd>{formatKickoffFull(match.kickoffTime)}</dd>
        </div>
        {match.venue && (
          <div>
            <dt>Venue</dt>
            <dd>{match.venue}</dd>
          </div>
        )}
      </dl>

      <h3 className="mc-subheading">Goals</h3>
      {events.status === "idle" || events.status === "loading" ? (
        <StatusMessage>Loading match events…</StatusMessage>
      ) : events.status === "error" ? (
        <StatusMessage tone="error">Couldn&rsquo;t load this match&rsquo;s events.</StatusMessage>
      ) : (
        (() => {
          const goals = events.data.items.filter(isGoalEvent);
          if (goals.length === 0) return <StatusMessage>No goals yet.</StatusMessage>;
          return (
            <ul className="mc-goal-list">
              {goals.map((g, i) => (
                <li key={i}>
                  <span className="mc-goal__minute">{g.displayMinute}</span>
                  <span className="mc-goal__side">{g.side === "home" ? match.homeTeam.name : g.side === "away" ? match.awayTeam.name : ""}</span>
                  <span className="mc-goal__player">
                    {g.player ?? "Unknown scorer"}
                    {g.assist ? ` (assist: ${g.assist})` : ""}
                  </span>
                </li>
              ))}
            </ul>
          );
        })()
      )}
    </Section>
  );
}

// ---------- Statistics (sub tab) ----------

function StatisticsTab({ stats, onRetry }: { stats: Loadable<MatchStatistics>; onRetry: () => void }) {
  if (stats.status === "idle" || stats.status === "loading") {
    return <StatusMessage>Loading team statistics…</StatusMessage>;
  }
  if (stats.status === "error") {
    return (
      <div>
        <StatusMessage tone="error">Couldn&rsquo;t load this match&rsquo;s statistics.</StatusMessage>
        <RetryButton onRetry={onRetry} />
      </div>
    );
  }

  const { home, away } = stats.data;
  if (!home || !away) {
    return <StatusMessage>Team statistics aren&rsquo;t available for this match yet.</StatusMessage>;
  }

  const awayByLabel = new Map(away.statistics.map((s) => [s.label, s.value]));

  return (
    <Section>
      <div className="mc-stats-header">
        <span className="mc-stats-header__team">{home.team.name}</span>
        <span className="mc-stats-header__team mc-stats-header__team--right">{away.team.name}</span>
      </div>
      <ul className="mc-stat-rows">
        {home.statistics.map((row) => {
          const awayValue = awayByLabel.get(row.label) ?? null;
          const homeNum = typeof row.value === "number" ? row.value : null;
          const awayNum = typeof awayValue === "number" ? awayValue : null;
          const total = (homeNum ?? 0) + (awayNum ?? 0);
          const homePct = total > 0 && homeNum != null ? (homeNum / total) * 100 : 50;
          return (
            <li key={row.label} className="mc-stat-row">
              <span className="mc-stat-row__value mc-stat-row__value--home">{row.value ?? "—"}</span>
              <span className="mc-stat-row__bar">
                <span className="mc-stat-row__bar-fill" style={{ width: `${homePct}%` }} />
              </span>
              <span className="mc-stat-row__label">{row.label}</span>
              <span className="mc-stat-row__bar mc-stat-row__bar--away">
                <span className="mc-stat-row__bar-fill mc-stat-row__bar-fill--away" style={{ width: `${100 - homePct}%` }} />
              </span>
              <span className="mc-stat-row__value">{awayValue ?? "—"}</span>
            </li>
          );
        })}
      </ul>
      <StatusMessage>
        Team totals only — per-player statistics aren&rsquo;t available from this data source.
      </StatusMessage>
    </Section>
  );
}

// ---------- Lineups (sub tab) ----------

function LineupList({ label, players }: { label: string; players: Lineups["home"]["startingXI"] }) {
  if (players.length === 0) return null;
  return (
    <div className="mc-lineup-list">
      <h4>{label}</h4>
      <ul>
        {players.map((p, i) => (
          <li key={p.id ?? i}>
            {p.number != null && <span className="mc-lineup-list__number">{p.number}</span>}
            <span>{p.name}</span>
            {p.position && <span className="mc-lineup-list__position">{p.position}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TeamLineupCard({ lineup }: { lineup: Lineups["home"] }) {
  return (
    <div className="mc-lineup-card">
      <div className="mc-lineup-card__head">
        <TeamCrest name={lineup.team.name} logo={lineup.team.logo} size={28} />
        <span>{lineup.team.name}</span>
        {lineup.formation && <span className="mc-lineup-card__formation">{lineup.formation}</span>}
      </div>
      {lineup.coach && <p className="mc-lineup-card__coach">Coach: {lineup.coach}</p>}
      <LineupList label="Starting XI" players={lineup.startingXI} />
      <LineupList label="Substitutes" players={lineup.substitutes} />
      <LineupList label="Missing players" players={lineup.missingPlayers} />
    </div>
  );
}

function LineupsTab({ lineups, onRetry }: { lineups: Loadable<Lineups>; onRetry: () => void }) {
  if (lineups.status === "idle" || lineups.status === "loading") {
    return <StatusMessage>Loading lineups…</StatusMessage>;
  }
  if (lineups.status === "error") {
    return (
      <div>
        <StatusMessage tone="error">Couldn&rsquo;t load this match&rsquo;s lineups.</StatusMessage>
        <RetryButton onRetry={onRetry} />
      </div>
    );
  }

  const { home, away, substitutions } = lineups.data;
  if (home.startingXI.length === 0 && away.startingXI.length === 0) {
    return <StatusMessage>Lineups aren&rsquo;t available for this match yet.</StatusMessage>;
  }

  return (
    <Section>
      <div className="mc-lineups">
        <TeamLineupCard lineup={home} />
        <TeamLineupCard lineup={away} />
      </div>

      {substitutions.length > 0 && (
        <>
          <h3 className="mc-subheading">Substitutions</h3>
          <ul className="mc-subs-list">
            {substitutions.map((s, i) => (
              <li key={i}>
                <span className="mc-subs-list__minute">{s.minute}&rsquo;</span>
                <span className="mc-subs-list__side">{s.side === "home" ? home.team.name : s.side === "away" ? away.team.name : ""}</span>
                <span>
                  {s.playerOff ?? "?"} → {s.playerOn ?? "?"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

// ---------- Momentum (sub tab) ----------

function MomentumTab({ momentum, homeTeamName, awayTeamName, onRetry }: {
  momentum: Loadable<Momentum>;
  homeTeamName: string;
  awayTeamName: string;
  onRetry: () => void;
}) {
  if (momentum.status === "idle" || momentum.status === "loading") {
    return <StatusMessage>Loading match momentum…</StatusMessage>;
  }
  if (momentum.status === "error") {
    return (
      <div>
        <StatusMessage tone="error">Couldn&rsquo;t load match momentum.</StatusMessage>
        <RetryButton onRetry={onRetry} />
      </div>
    );
  }

  const { bars, markers } = momentum.data;
  if (bars.length === 0) {
    return <StatusMessage>Not enough match event data yet to chart momentum.</StatusMessage>;
  }

  const maxAbs = bars.reduce((max, b) => Math.max(max, Math.abs(b.home), Math.abs(b.away)), 1);

  return (
    <Section title="Match momentum">
      <div className="mc-momentum-legend">
        <span><span className="mc-momentum-legend__swatch mc-momentum-legend__swatch--home" /> {homeTeamName}</span>
        <span><span className="mc-momentum-legend__swatch mc-momentum-legend__swatch--away" /> {awayTeamName}</span>
      </div>
      <div className="mc-momentum-chart" role="img" aria-label="Match momentum chart">
        {bars.map((bar) => (
          <div className="mc-momentum-chart__col" key={bar.minute}>
            <div className="mc-momentum-chart__home" style={{ height: `${(Math.max(bar.home, 0) / maxAbs) * 100}%` }} />
            <div className="mc-momentum-chart__baseline" />
            <div className="mc-momentum-chart__away" style={{ height: `${(Math.max(-bar.away, 0) / maxAbs) * 100}%` }} />
          </div>
        ))}
      </div>
      {markers.length > 0 && (
        <ul className="mc-momentum-markers">
          {markers.map((m, i) => (
            <li key={i}>
              <span className="mc-momentum-markers__minute">{m.minute}&rsquo;</span>
              <span>{m.label}</span>
            </li>
          ))}
        </ul>
      )}
      <StatusMessage>
        Momentum is a derived estimate based on goals and cards, not a measure of shots or possession.
      </StatusMessage>
    </Section>
  );
}

// ---------- Commentary (sub tab) ----------

function CommentaryTab({ events, onRetry }: { events: Loadable<MatchEvents>; onRetry: () => void }) {
  if (events.status === "idle" || events.status === "loading") {
    return <StatusMessage>Loading match events…</StatusMessage>;
  }
  if (events.status === "error") {
    return (
      <div>
        <StatusMessage tone="error">Couldn&rsquo;t load this match&rsquo;s events.</StatusMessage>
        <RetryButton onRetry={onRetry} />
      </div>
    );
  }

  const items = events.data.items;
  return (
    <Section title="Live commentary">
      <p className="mc-commentary__disclosure">
        This is an automated match-event feed, not written commentary — every entry is generated directly
        from timestamped match data. There is no commentator and no editorial narration.
      </p>
      {items.length === 0 ? (
        <StatusMessage>No match events yet.</StatusMessage>
      ) : (
        <ul className="mc-commentary-list">
          {items.map((e, i) => (
            <li key={i}>
              <span className="mc-commentary-list__minute">{e.displayMinute}</span>
              <span className="mc-commentary-list__badge">{e.type}</span>
              <span className="mc-commentary-list__body">
                {e.player ?? ""}
                {e.assist ? ` (assist: ${e.assist})` : ""}
                {e.detail ? ` — ${e.detail}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------- H2H (level 1 tab) ----------

function HeadToHeadTab({ h2h, onRetry }: { h2h: Loadable<HeadToHead>; onRetry: () => void }) {
  if (h2h.status === "idle" || h2h.status === "loading") {
    return <StatusMessage>Loading head-to-head record…</StatusMessage>;
  }
  if (h2h.status === "error") {
    return (
      <div>
        <StatusMessage tone="error">Couldn&rsquo;t load this head-to-head record.</StatusMessage>
        <RetryButton onRetry={onRetry} />
      </div>
    );
  }

  const { meetings, aggregate } = h2h.data;
  if (aggregate.played === 0) {
    return <StatusMessage>No previous meetings between these two teams yet.</StatusMessage>;
  }

  return (
    <Section title="Head to head">
      <dl className="mc-facts mc-facts--h2h">
        <div>
          <dt>Played</dt>
          <dd>{aggregate.played}</dd>
        </div>
        <div>
          <dt>Home team wins</dt>
          <dd>{aggregate.homeTeamWins}</dd>
        </div>
        <div>
          <dt>Draws</dt>
          <dd>{aggregate.draws}</dd>
        </div>
        <div>
          <dt>Away team wins</dt>
          <dd>{aggregate.awayTeamWins}</dd>
        </div>
        <div>
          <dt>Goals</dt>
          <dd>
            {aggregate.homeTeamGoals} – {aggregate.awayTeamGoals}
          </dd>
        </div>
      </dl>

      <h3 className="mc-subheading">Previous meetings</h3>
      <ul className="mc-match-list">
        {meetings.map((m) => (
          <li key={m.id}>
            <Link to={`/sports-hub/matches/${m.id}`} className="mc-match-row">
              <span className={phaseClass(m.status)}>{phaseLabel(m)}</span>
              <span className="mc-match-row__team">{m.homeTeam.name}</span>
              <span className="mc-match-row__score">{m.homeScore ?? "-"}</span>
              <span className="mc-match-row__score">{m.awayScore ?? "-"}</span>
              <span className="mc-match-row__team">{m.awayTeam.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------- Standings (level 1 tab) ----------

function StandingsTab({ standings, homeTeamId, awayTeamId, onRetry }: {
  standings: Loadable<Standings>;
  homeTeamId: string;
  awayTeamId: string;
  onRetry: () => void;
}) {
  if (standings.status === "idle" || standings.status === "loading") {
    return <StatusMessage>Loading standings…</StatusMessage>;
  }
  if (standings.status === "error") {
    return (
      <div>
        <StatusMessage tone="error">{standings.message}</StatusMessage>
        <RetryButton onRetry={onRetry} />
      </div>
    );
  }

  if (standings.data.groups.length === 0) {
    return <StatusMessage>Standings aren&rsquo;t available for this league yet.</StatusMessage>;
  }

  return (
    <Section title="Standings">
      {standings.data.groups.map((group, gi) => (
        <div key={gi} className="mc-standings-group">
          {group.name && <h3 className="mc-subheading">{group.name}</h3>}
          <table className="mc-standings-table">
            <thead>
              <tr>
                <th>#</th>
                <th className="mc-standings-table__team-col">Team</th>
                <th>P</th>
                <th>W</th>
                <th>D</th>
                <th>L</th>
                <th>GF</th>
                <th>GA</th>
                <th>GD</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => {
                const highlighted = row.team.id === homeTeamId || row.team.id === awayTeamId;
                return (
                  <tr key={row.team.id || row.position} className={highlighted ? "mc-standings-table__row--highlight" : undefined}>
                    <td>{row.position}</td>
                    <td className="mc-standings-table__team-col">
                      <span className="mc-standings-table__team">
                        <TeamCrest name={row.team.name} logo={row.team.logo} size={20} />
                        {row.team.name}
                      </span>
                    </td>
                    <td>{row.played}</td>
                    <td>{row.won}</td>
                    <td>{row.drawn}</td>
                    <td>{row.lost}</td>
                    <td>{row.goalsFor}</td>
                    <td>{row.goalsAgainst}</td>
                    <td>{row.goalDifference}</td>
                    <td>
                      <strong>{row.points}</strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      <StatusMessage>Recent-form data isn&rsquo;t available from this data source yet.</StatusMessage>
    </Section>
  );
}

// ---------- Video (level 1 tab) ----------

function VideoTab({ highlights, onRetry }: { highlights: Loadable<Highlights>; onRetry: () => void }) {
  if (highlights.status === "idle" || highlights.status === "loading") {
    return <StatusMessage>Loading video clips…</StatusMessage>;
  }
  if (highlights.status === "error") {
    return (
      <div>
        <StatusMessage tone="error">Couldn&rsquo;t load video clips for this match.</StatusMessage>
        <RetryButton onRetry={onRetry} />
      </div>
    );
  }

  const items = highlights.data.items;
  if (items.length === 0) {
    return <StatusMessage>No video clips for this match yet.</StatusMessage>;
  }

  return (
    <Section title="Video">
      <ul className="mc-video-grid">
        {items.map((h) => (
          <li key={h.id} className="mc-video-card">
            <a href={h.embedUrl ?? h.url} target="_blank" rel="noreferrer" className="mc-video-card__thumb">
              {h.thumbnailUrl ? (
                <img src={h.thumbnailUrl} alt="" />
              ) : (
                <span className="mc-video-card__placeholder" aria-hidden="true">▶</span>
              )}
            </a>
            <p className="mc-video-card__title">{h.title}</p>
            <p className="mc-video-card__meta">
              {h.type}
              {h.source ? ` · ${h.source}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------- Page ----------

const LEVEL1_TABS: { key: Level1Tab; label: string }[] = [
  { key: "match", label: "Match" },
  { key: "h2h", label: "H2H" },
  { key: "standings", label: "Standings" },
  { key: "video", label: "Video" },
];

const SUB_TABS: { key: MatchSubTab; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "stats", label: "Statistics" },
  { key: "lineups", label: "Lineups" },
  { key: "momentum", label: "Momentum" },
  { key: "commentary", label: "Commentary" },
];

export default function MatchCentrePage() {
  const { matchId } = useParams<{ matchId: string }>();
  const [searchParams] = useSearchParams();

  const [tab, setTab] = useState<Level1Tab>(
    LEVEL1_TABS.some((t) => t.key === searchParams.get("tab")) ? (searchParams.get("tab") as Level1Tab) : "match",
  );
  const [sub, setSub] = useState<MatchSubTab>(
    SUB_TABS.some((t) => t.key === searchParams.get("sub")) ? (searchParams.get("sub") as MatchSubTab) : "summary",
  );

  const [matchState, setMatchState] = useState<Loadable<MatchSummary>>({ status: "idle" });

  const loadMatch = useCallback(() => {
    if (!matchId) return;
    setMatchState({ status: "loading" });
    getMatchById(matchId)
      .then((data) => setMatchState({ status: "loaded", data }))
      .catch((err) =>
        setMatchState({
          status: "error",
          message: err instanceof SportsApiError && err.status === 404 ? "Match not found." : errorMessage(err, "Couldn't load this match."),
        }),
      );
  }, [matchId]);

  useEffect(() => {
    loadMatch();
  }, [loadMatch]);

  const summaryActive = tab === "match" && sub === "summary";
  const statsActive = tab === "match" && sub === "stats";
  const lineupsActive = tab === "match" && sub === "lineups";
  const momentumActive = tab === "match" && sub === "momentum";
  const commentaryActive = tab === "match" && sub === "commentary";
  const h2hActive = tab === "h2h";
  const videoActive = tab === "video";

  const [events, retryEvents] = useLazyTab(matchId, summaryActive || commentaryActive, getMatchEvents);
  const [stats, retryStats] = useLazyTab(matchId, statsActive, getMatchStatistics);
  const [lineups, retryLineups] = useLazyTab(matchId, lineupsActive, getMatchLineups);
  const [momentum, retryMomentum] = useLazyTab(matchId, momentumActive, getMatchMomentum);
  const [h2h, retryH2h] = useLazyTab(matchId, h2hActive, getHeadToHead);
  const [highlights, retryHighlights] = useLazyTab(matchId, videoActive, getHighlights);

  // Standings needs the loaded match's own league/season — not just
  // matchId — so it can't use the generic hook above.
  const [standings, setStandings] = useState<Loadable<Standings>>({ status: "idle" });
  const standingsActive = tab === "standings";

  const loadStandings = useCallback(() => {
    if (matchState.status !== "loaded") return;
    const { league } = matchState.data;
    if (!league.id) {
      setStandings({ status: "error", message: "Standings aren't available for this match — no league information." });
      return;
    }
    setStandings({ status: "loading" });
    getStandings(league.id, league.season ?? undefined)
      .then((data) => setStandings({ status: "loaded", data }))
      .catch((err) => setStandings({ status: "error", message: errorMessage(err, "Couldn't load standings.") }));
  }, [matchState]);

  useEffect(() => {
    if (standingsActive && standings.status === "idle") loadStandings();
  }, [standingsActive, standings.status, loadStandings]);

  if (matchState.status === "idle" || matchState.status === "loading") {
    return (
      <div className="mc-page">
        <StatusMessage>Loading match…</StatusMessage>
      </div>
    );
  }

  if (matchState.status === "error") {
    return (
      <div className="mc-page">
        <Link to="/sports-hub" className="mc-back">
          ← Sports Hub
        </Link>
        <StatusMessage tone="error">{matchState.message}</StatusMessage>
      </div>
    );
  }

  const match = matchState.data;

  return (
    <div className="mc-page">
      <Link to="/sports-hub" className="mc-back">
        ← Sports Hub
      </Link>

      <header className="mc-header">
        <p className="mc-header__competition">
          {match.competition}
          {match.league.round ? ` · ${match.league.round}` : ""}
        </p>
        <div className="mc-header__row">
          <div className="mc-header__team">
            <TeamCrest name={match.homeTeam.name} logo={match.homeTeam.logo} size={48} />
            <span>{match.homeTeam.name}</span>
          </div>
          <div className="mc-header__score">
            <span>{match.homeScore ?? "-"}</span>
            <span>–</span>
            <span>{match.awayScore ?? "-"}</span>
          </div>
          <div className="mc-header__team mc-header__team--away">
            <span>{match.awayTeam.name}</span>
            <TeamCrest name={match.awayTeam.name} logo={match.awayTeam.logo} size={48} />
          </div>
        </div>
        <p className={phaseClass(match.status)}>{phaseLabel(match)}</p>
      </header>

      <nav className="mc-tabs" aria-label="Match sections">
        {LEVEL1_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-selected={tab === t.key}
            className={tab === t.key ? "mc-tab mc-tab--active" : "mc-tab"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "match" && (
        <nav className="mc-subtabs" aria-label="Match content">
          {SUB_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-selected={sub === t.key}
              className={sub === t.key ? "mc-subtab mc-subtab--active" : "mc-subtab"}
              onClick={() => setSub(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}

      <div className="mc-content">
        {summaryActive && <MatchSummaryTab match={match} events={events} />}
        {statsActive && <StatisticsTab stats={stats} onRetry={retryStats} />}
        {lineupsActive && <LineupsTab lineups={lineups} onRetry={retryLineups} />}
        {momentumActive && (
          <MomentumTab momentum={momentum} homeTeamName={match.homeTeam.name} awayTeamName={match.awayTeam.name} onRetry={retryMomentum} />
        )}
        {commentaryActive && <CommentaryTab events={events} onRetry={retryEvents} />}
        {h2hActive && <HeadToHeadTab h2h={h2h} onRetry={retryH2h} />}
        {standingsActive && (
          <StandingsTab standings={standings} homeTeamId={match.homeTeam.id} awayTeamId={match.awayTeam.id} onRetry={loadStandings} />
        )}
        {videoActive && <VideoTab highlights={highlights} onRetry={retryHighlights} />}
      </div>
    </div>
  );
}
