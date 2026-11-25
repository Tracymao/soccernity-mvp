// Home: the logged-out marketing landing page.
//
// ROUTING: this component IS the "/" index route (see src/app/router.tsx).
// Decision Log #152: "/" is exclusively the logged-out marketing page, and
// a signed-in visitor goes to the Community feed instead. If a session
// token exists (getStoredAccessToken()), HomePage redirects to /community
// and renders nothing else, so a signed-in visitor makes NO API requests
// from here. Otherwise it renders MarketingHome, which owns the data reads
// (hooks cannot follow an early return, hence the split). Session is read
// directly via src/lib/session.ts, the same way every other converted page
// does it.
//
// REAL DATA (Decision Log #556; hero card and strip rules Decision Log #570).
// Public reads with a plain useEffect (results are ignored after unmount):
//   - hero card: GET /sports/live-scores + GET /sports/fixtures?date=today&
//     status=finished, grouped by league into at most 3 tabs (HomeHeroCard.tsx).
//     Fetched on mount, then every 60 s only while the page is visible and the
//     card shows a live match. No live and no finished match today, or a failed
//     request, means NO card and the hero copy takes the full width.
//   - "Today's Fixtures" strip: GET /sports/fixtures?date=today&status=
//     scheduled, server league order, first 4, never live. When nothing is
//     scheduled it shows the most recent results (GET /sports/results/recent)
//     under "LATEST RESULTS"; when there are none either, the empty sentence;
//     an error hides the strip; loading shows 4 skeletons.
//   - listArticles() -> GET /articles feeds "Latest" (first article featured,
//     next three in the side list); empty or error hides the section.
// Nothing invented is shown: no grassroots data, no reading time, no view
// counts or popularity ranking. The "Why Soccernity" pillars, the closing
// CTA and the footer (rendered by FooterLayout, Decision Log #213) are
// unchanged.
//
// FIGMA: the hero card and the strip now follow the new frames (Figma PR
// #902, home hero live-scores card). Elsewhere the page still differs from the
// canonical frame 5204:6728 (Decision Log #46): there is no Talents clips
// section and the stories are real Blog articles (founder decision
// 2026-11-24). Club crests: a real logo when the API supplies a safe one,
// else the club's first letter (the same rule Sports Hub uses).
import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router";
import { listFixtures, listLiveScores, listRecentResults, type MatchListItem, type MatchPhase } from "../api/sports";
import { listArticles, type ArticleSummary } from "../api/blog";
import { formatDate } from "../lib/formatDate";
import { safeImageUrl } from "../lib/safeImageUrl";
import { getStoredAccessToken } from "../lib/session";
import { formatKickoffTime, monogramFor, phaseLabel, todayIso } from "./sports-hub/format";
import CoverMedia from "./blog/CoverMedia";
import { HeroCard, HeroSkeleton, buildHeroLeagues, type HeroLeague } from "./HomeHeroCard";
import "./HomePage.css";

const PILLARS = [
  {
    index: "01",
    title: "Grassroots first",
    body: "Much of the game is played outside any official record. Soccernity starts with the Sunday leagues, school pitches and informal teams that rarely get one.",
  },
  {
    index: "02",
    title: "A community around your game",
    body: "Follow players and teams, post about your matches, and talk football with the people who actually watched the same game you did.",
  },
  {
    index: "03",
    title: "The professional game, live.",
    body: "Scores, fixtures, standings and highlights from the leagues you already follow, in the same place as the football you actually play.",
  },
];

const STRIP_SIZE = 4;
const SIDE_STORY_COUNT = 3;

type Loadable<T> = { status: "loading" } | { status: "error" } | { status: "ready"; items: T[] };

function pillClass(status: MatchPhase): string {
  if (status === "live") return "home-pill home-pill--live";
  if (status === "finished") return "home-pill home-pill--ft";
  return "home-pill home-pill--upcoming";
}

function matchLine(match: MatchListItem): string {
  const finished = match.status === "finished";
  if (match.venue) return finished ? `${match.venue} · Full time` : match.venue;
  return finished ? "Full time" : `Kickoff ${formatKickoffTime(match.kickoffTime)}`;
}

function scoreText(score: number | null): string {
  return score === null ? "–" : String(score);
}

function Crest({ name, logo, small }: { name: string; logo: string | null; small?: boolean }) {
  const size = small ? " home-badge--sm" : "";
  const safeLogo = safeImageUrl(logo);
  if (safeLogo) {
    return <img className={`home-badge home-badge--img${size}`} src={safeLogo} alt="" aria-hidden="true" />;
  }
  return (
    <span className={`home-badge${size}`} aria-hidden="true">
      {monogramFor(name)}
    </span>
  );
}

function TeamRows({ match, small, muteAway }: { match: MatchListItem; small?: boolean; muteAway?: boolean }) {
  return (
    <>
      <div className="home-team-row">
        <Crest name={match.homeTeam.name} logo={match.homeTeam.logo} small={small} />
        <span className="home-team-row__name">{match.homeTeam.name}</span>
        <span className="home-team-row__score">{scoreText(match.homeScore)}</span>
      </div>
      <div className="home-team-row">
        <Crest name={match.awayTeam.name} logo={match.awayTeam.logo} small={small} />
        <span className={`home-team-row__name${muteAway ? " home-team-row__name--muted" : ""}`}>
          {match.awayTeam.name}
        </span>
        <span className={`home-team-row__score${muteAway ? " home-team-row__score--muted" : ""}`}>
          {scoreText(match.awayScore)}
        </span>
      </div>
    </>
  );
}

type StripState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: MatchListItem[]; latest: boolean };

const REFRESH_MS = 60_000;

function FixtureStrip({ state }: { state: StripState }) {
  if (state.status === "error") return null;
  const latest = state.status === "ready" && state.latest;
  return (
    <section className="home-section" aria-labelledby="home-fixtures-title">
      <div className="home-section__head">
        <div>
          <p className="home-eyebrow">{latest ? "LATEST RESULTS" : "TODAY'S FIXTURES"}</p>
          <h2 id="home-fixtures-title" className="home-section__title">
            {latest ? "Latest results" : "Matches today"}
          </h2>
        </div>
        <Link to="/sports-hub" className="home-section__link home-section__link--outline">
          View all fixtures &rarr;
        </Link>
      </div>
      {state.status === "loading" ? (
        <div className="home-fixture-grid" aria-busy="true">
          {Array.from({ length: STRIP_SIZE }, (_, i) => (
            <div key={i} className="home-fixture home-skeleton" data-testid="fixture-skeleton" />
          ))}
        </div>
      ) : state.items.length === 0 ? (
        <p className="home-empty">
          No matches today. See <Link to="/sports-hub">all fixtures on Sports Hub</Link>.
        </p>
      ) : (
        <div className="home-fixture-grid">
          {state.items.slice(0, STRIP_SIZE).map((match) => (
            <Link key={match.id} to={`/sports-hub/matches/${match.id}`} className="home-fixture">
              <div className="home-fixture__meta">
                <span className="home-fixture__league">{match.competition}</span>
                <span className={pillClass(match.status)}>{phaseLabel(match)}</span>
              </div>
              <div className="home-fixture__teams">
                <TeamRows match={match} small />
              </div>
              <div className="home-hairline" />
              <p className="home-fixture__venue">{matchLine(match)}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function LatestStories({ state }: { state: Loadable<ArticleSummary> }) {
  if (state.status === "error") return null;
  if (state.status === "ready" && state.items.length === 0) return null;

  const loading = state.status === "loading";
  const featured = state.status === "ready" ? state.items[0] : null;
  const side = state.status === "ready" ? state.items.slice(1, 1 + SIDE_STORY_COUNT) : [];

  return (
    <section className="home-section home-section--surface" aria-labelledby="home-latest-title">
      <div className="home-section__head">
        <div>
          <p className="home-eyebrow">LATEST</p>
          <h2 id="home-latest-title" className="home-section__title">
            From the Blog
          </h2>
        </div>
        <Link to="/blog" className="home-section__link home-section__link--navy">
          See more stories &rarr;
        </Link>
      </div>
      <div className="home-editorial" aria-busy={loading || undefined}>
        {featured ? (
          <article className="home-featured">
            <div
              className={
                featured.coverImage
                  ? "home-featured__mediawrap"
                  : "home-featured__mediawrap home-featured__mediawrap--no-cover"
              }
            >
              <CoverMedia coverImage={featured.coverImage} className="home-featured__media" />
              <span className="home-pill home-pill--tag home-pill--tag-green home-featured__tag">
                {featured.category.name}
              </span>
            </div>
            <div className="home-featured__body">
              <h3 className="home-featured__title">
                <Link to={`/blog/${featured.id}`}>{featured.title}</Link>
              </h3>
              <p className="home-featured__excerpt">{featured.excerpt}</p>
              <p className="home-featured__meta">
                {featured.author} · {formatDate(featured.publishedAt)}
              </p>
            </div>
          </article>
        ) : (
          <div className="home-featured home-skeleton home-skeleton--featured" data-testid="article-skeleton" />
        )}
        <aside className="home-story-list">
          {loading
            ? Array.from({ length: SIDE_STORY_COUNT }, (_, i) => (
                <div key={i} className="home-story home-skeleton home-skeleton--story" data-testid="article-skeleton" />
              ))
            : side.map((article) => (
                <Link key={article.id} to={`/blog/${article.id}`} className="home-story">
                  <CoverMedia coverImage={article.coverImage} className="home-story__thumb" />
                  <div className="home-story__text">
                    <p className="home-story__title">{article.title}</p>
                    <p className="home-story__meta">
                      {article.category.name} · {formatDate(article.publishedAt)}
                    </p>
                  </div>
                </Link>
              ))}
        </aside>
      </div>
    </section>
  );
}

type HeroState = { status: "loading" } | { status: "hidden" } | { status: "ready"; leagues: HeroLeague[] };

function MarketingHome() {
  const [strip, setStrip] = useState<StripState>({ status: "loading" });
  const [hero, setHero] = useState<HeroState>({ status: "loading" });
  const [articles, setArticles] = useState<Loadable<ArticleSummary>>({ status: "loading" });
  const hasLive = useRef(false);

  useEffect(() => {
    let active = true;
    const today = todayIso();

    async function loadHero() {
      try {
        const [live, finished] = await Promise.all([
          listLiveScores(),
          listFixtures(today, { status: "finished", limit: 50 }),
        ]);
        if (!active) return;
        const leagues = buildHeroLeagues(live.items, finished.items);
        hasLive.current = leagues.some((l) => l.hasLive);
        setHero(leagues.length === 0 ? { status: "hidden" } : { status: "ready", leagues });
      } catch {
        if (!active) return;
        hasLive.current = false;
        setHero((prev) => (prev.status === "ready" ? prev : { status: "hidden" }));
      }
    }

    async function loadStrip() {
      try {
        const scheduled = await listFixtures(today, { status: "scheduled", limit: STRIP_SIZE });
        if (!active) return;
        if (scheduled.items.length > 0) {
          setStrip({ status: "ready", items: scheduled.items, latest: false });
          return;
        }
        const recent = await listRecentResults({ limit: STRIP_SIZE });
        if (active) setStrip({ status: "ready", items: recent.items, latest: recent.items.length > 0 });
      } catch {
        if (active) setStrip({ status: "error" });
      }
    }

    void loadHero();
    void loadStrip();
    listArticles()
      .then((page) => {
        if (active) setArticles({ status: "ready", items: page.items });
      })
      .catch(() => {
        if (active) setArticles({ status: "error" });
      });

    // Refresh the card every 60 s, only while the tab is visible and a match is live.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && hasLive.current) void loadHero();
    }, REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const showCard = hero.status !== "hidden";

  return (
    <div className="home">
      <section className={`home-hero${showCard ? "" : " home-hero--solo"}`}>
        <div className="home-hero__copy">
          <span className="home-eyebrow home-eyebrow--on-navy">
            <span className="home-eyebrow__dot" aria-hidden="true" />
            WHERE THE WHOLE GAME LIVES
          </span>
          <h1 className="home-hero__title">
            Every match you play
            <br />
            deserves a record.
          </h1>
          <p className="home-hero__lede">
            Live scores and stories from the football you watch, and a real home for the teams and communities
            playing it every weekend.
          </p>
          <div className="home-cta-row">
            <Link to="/signup" className="home-btn home-btn--primary">
              Create your profile
            </Link>
            <Link to="/sports-hub" className="home-btn home-btn--ghost-on-navy">
              Explore fixtures
            </Link>
          </div>
        </div>
        {hero.status === "loading" ? <HeroSkeleton /> : null}
        {hero.status === "ready" ? <HeroCard leagues={hero.leagues} /> : null}
      </section>

      <FixtureStrip state={strip} />

      <section className="home-section home-section--surface home-section--center">
        <div className="home-section__head-centered">
          <p className="home-eyebrow">WHY SOCCERNITY</p>
          <h2 className="home-section__title">
            So much of football happens where no one keeps the record.
          </h2>
          <p className="home-section__sub">
            Soccernity is built for the players outside the academy system, and for the fans, coaches and
            communities who already show up for them every weekend.
          </p>
        </div>
        <div className="home-pillar-grid">
          {PILLARS.map((p) => (
            <article key={p.index} className="home-pillar">
              <span className="home-pillar__badge">{p.index}</span>
              <h3 className="home-pillar__title">{p.title}</h3>
              <p className="home-pillar__body">{p.body}</p>
            </article>
          ))}
        </div>
      </section>

      <LatestStories state={articles} />

      <section className="home-closing">
        <p className="home-eyebrow home-eyebrow--on-navy">GET STARTED</p>
        <h2 className="home-closing__title">
          Start the record you should have had all along.
        </h2>
        <p className="home-closing__sub">
          Free to join. Create your profile, follow the football you love, and register your team when you're ready
          to make it official.
        </p>
        <div className="home-cta-row">
          <Link to="/signup" className="home-btn home-btn--primary">
            Create your profile
          </Link>
          <Link to="/signup" className="home-btn home-btn--ghost-on-navy">
            Register your team
          </Link>
        </div>
      </section>

      {/* The site footer is rendered by FooterLayout (src/layout/
          FooterLayout.tsx), not inline here -- see src/app/router.tsx and
          Decision Log #213. */}
    </div>
  );
}

export default function HomePage() {
  // Decision Log #152: a signed-in visitor to "/" goes to the feed, not
  // the marketing page. `replace` so the marketing page isn't left in
  // history for the back button to land on. MarketingHome is never
  // mounted for them, so no request is made.
  if (getStoredAccessToken()) {
    return <Navigate to="/community" replace />;
  }
  return <MarketingHome />;
}
