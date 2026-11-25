// The logged-out Home hero card: today's live matches and today's finished
// matches, grouped by league into at most three tabs. Pure view: the data
// reads and the 60-second refresh live in HomePage (MarketingHome). Rules
// (founder spec, Figma pass 2026-11-25):
//   - leagues keep the server order (live-scores and fixtures arrive ranked);
//     leagues are merged by rank, ties by first appearance
//   - max 3 tabs, a 4th "More" chip links to Sports Hub when more leagues
//   - a single league shows no tabs, just its name under the title
//   - default tab: the first tab with a live match, else the first tab
//   - rows per tab: live first (server order), then finished, newest first;
//     at most 3
//   - "{n} live now" pill only while at least one match is live
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router";
import type { MatchListItem } from "../api/sports";
import { safeImageUrl } from "../lib/safeImageUrl";
import { monogramFor } from "./sports-hub/format";

export const HERO_MAX_TABS = 3;
export const HERO_MAX_ROWS = 3;
const TAB_LABEL_MAX = 22;

export interface HeroLeague {
  key: string;
  name: string;
  hasLive: boolean;
  rows: MatchListItem[];
}

function leagueKey(match: MatchListItem): string {
  return match.league.id ?? match.league.name ?? match.competition;
}

function leagueName(match: MatchListItem): string {
  return match.league.name ?? match.competition;
}

// Group today's live and finished matches by league, in the server's league order.
export function buildHeroLeagues(live: MatchListItem[], finished: MatchListItem[]): HeroLeague[] {
  const seen = new Set<string>();
  const all: MatchListItem[] = [];
  for (const m of [...live.filter((x) => x.status === "live"), ...finished.filter((x) => x.status === "finished")]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    all.push(m);
  }
  const groups = new Map<
    string,
    { name: string; rank: number; order: number; live: MatchListItem[]; done: MatchListItem[] }
  >();
  all.forEach((m, order) => {
    const key = leagueKey(m);
    let g = groups.get(key);
    if (!g) {
      g = { name: leagueName(m), rank: m.league.rank ?? Number.POSITIVE_INFINITY, order, live: [], done: [] };
      groups.set(key, g);
    }
    (m.status === "live" ? g.live : g.done).push(m);
  });
  return [...groups.entries()]
    .sort((a, b) => a[1].rank - b[1].rank || a[1].order - b[1].order)
    .map(([key, g]) => ({
      key,
      name: g.name,
      hasLive: g.live.length > 0,
      rows: [...g.live, ...[...g.done].sort((x, y) => Date.parse(y.kickoffTime) - Date.parse(x.kickoffTime))],
    }));
}

function truncate(name: string): string {
  return name.length > TAB_LABEL_MAX ? `${name.slice(0, TAB_LABEL_MAX - 1).trimEnd()}…` : name;
}

function scoreText(score: number | null): string {
  return score === null ? "–" : String(score);
}

function Crest({ name, logo }: { name: string; logo: string | null }) {
  const safe = safeImageUrl(logo);
  if (safe) return <img className="home-hero-crest home-hero-crest--img" src={safe} alt="" aria-hidden="true" />;
  return (
    <span className="home-hero-crest" aria-hidden="true">
      {monogramFor(name)}
    </span>
  );
}

function Row({ match }: { match: MatchListItem }) {
  const live = match.status === "live";
  return (
    <Link to={`/sports-hub/matches/${match.id}`} className="home-hero-row">
      <span className="home-hero-row__team home-hero-row__team--home">
        <span className="home-hero-row__name">{match.homeTeam.name}</span>
        <Crest name={match.homeTeam.name} logo={match.homeTeam.logo} />
      </span>
      <span className="home-hero-row__mid">
        <span className="home-hero-row__score">
          {scoreText(match.homeScore)} – {scoreText(match.awayScore)}
        </span>
        {live ? (
          <span className="home-hero-pill home-hero-pill--live">{match.statusDetail ?? "Live"}</span>
        ) : (
          <span className="home-hero-pill home-hero-pill--ft">FT</span>
        )}
      </span>
      <span className="home-hero-row__team home-hero-row__team--away">
        <Crest name={match.awayTeam.name} logo={match.awayTeam.logo} />
        <span className="home-hero-row__name">{match.awayTeam.name}</span>
      </span>
    </Link>
  );
}

export function HeroSkeleton() {
  return (
    <div className="home-hero__card home-hero-card" aria-busy="true" data-testid="hero-skeleton">
      <div className="home-hero-card__head">
        <span className="home-skeleton home-hero-skel home-hero-skel--title" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="home-skeleton home-hero-skel home-hero-skel--row" />
      ))}
    </div>
  );
}

export function HeroCard({ leagues }: { leagues: HeroLeague[] }) {
  const uid = useId();
  const tabs = leagues.slice(0, HERO_MAX_TABS);
  const hasMore = leagues.length > HERO_MAX_TABS;
  const defaultKey = (tabs.find((l) => l.hasLive) ?? tabs[0]).key;
  const [picked, setPicked] = useState<string | null>(null);
  const activeKey = picked && tabs.some((t) => t.key === picked) ? picked : defaultKey;
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.key === activeKey),
  );
  const active = tabs[activeIndex];
  const liveCount = leagues.reduce((n, l) => n + l.rows.filter((r) => r.status === "live").length, 0);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    setPicked(tabs[next].key);
    tabRefs.current[tabs[next].key]?.focus();
  }

  const single = tabs.length === 1;

  return (
    <section className="home-hero__card home-hero-card" aria-labelledby={`${uid}-title`}>
      <div className="home-hero-card__head">
        <h2 id={`${uid}-title`} className="home-hero-card__title">
          Today’s matches
        </h2>
        {liveCount > 0 ? (
          <span className="home-hero-livepill">
            <span className="home-hero-livepill__dot" aria-hidden="true" />
            {liveCount} live now
          </span>
        ) : null}
      </div>
      {single ? (
        <p className="home-hero-card__league">{tabs[0].name}</p>
      ) : (
        <div className="home-hero-tabs" role="tablist" aria-label="Leagues">
          {tabs.map((t, i) => (
            <button
              key={t.key}
              ref={(el) => {
                tabRefs.current[t.key] = el;
              }}
              type="button"
              role="tab"
              id={`${uid}-tab-${i}`}
              aria-selected={t.key === activeKey}
              aria-controls={`${uid}-panel`}
              aria-label={t.name}
              title={t.name}
              tabIndex={t.key === activeKey ? 0 : -1}
              className={`home-hero-tab${t.key === activeKey ? " home-hero-tab--active" : ""}`}
              onClick={() => setPicked(t.key)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {truncate(t.name)}
            </button>
          ))}
          {hasMore ? (
            <Link to="/sports-hub" className="home-hero-tab home-hero-tab--more">
              More
            </Link>
          ) : null}
        </div>
      )}
      <div
        className="home-hero-rows"
        role={single ? undefined : "tabpanel"}
        id={`${uid}-panel`}
        aria-labelledby={single ? undefined : `${uid}-tab-${activeIndex}`}
      >
        {active.rows.slice(0, HERO_MAX_ROWS).map((m) => (
          <Row key={m.id} match={m} />
        ))}
      </div>
      <div className="home-hairline" />
      <div className="home-hero-card__foot">
        <p className="home-hero-card__caption">Plus Bants, Blog stories and the community around every match.</p>
        <Link to="/sports-hub" className="home-hero-card__link">
          View all scores &rarr;
        </Link>
      </div>
    </section>
  );
}
