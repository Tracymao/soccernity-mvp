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
// REAL DATA (founder decision, 2026-11-24, Decision Log #556). Two public
// reads fire once on mount, with the same plain useEffect pattern Sports
// Hub and Blog use (results are ignored after unmount, no library):
//   - listFixtures(todayIso())  -> GET /sports/fixtures?date=  (api/sports.ts)
//     One call feeds BOTH the hero card and the "Matches today" strip.
//   - listArticles()            -> GET /articles               (api/blog.ts)
//     One call feeds the "Latest" section (the first article is featured,
//     the next three are the side list).
// Fixture order: live first, then scheduled by kickoff ascending, then
// finished by kickoff descending, then postponed and cancelled last. The
// strip shows the first 4. The hero card shows the first live, scheduled
// or finished match (never postponed or cancelled), or no card at all.
// States: while fixtures load the strip shows 4 skeleton cards and the hero
// card is absent; an empty day shows one sentence linking to Sports Hub; a
// fixtures error hides the whole strip and the hero card; the hero copy
// then takes the full width. Articles: loading shows skeletons, an empty
// list or an error hides the whole Latest section.
// Nothing invented is shown: no grassroots data, no reading time, no view
// counts or popularity ranking. The "Why Soccernity" pillars, the closing
// CTA and the footer (rendered by FooterLayout, Decision Log #213) are
// unchanged.
//
// DIVERGENCE FROM FIGMA: the canonical frame 5204:6728 (Decision Log #46)
// still draws hardcoded sample fixtures, a Talents clips section and a
// "Trending" stories block. By founder decision of 2026-11-24 the code
// deliberately differs: it shows real Sports Hub fixtures and real Blog
// stories, and the Talents section is removed. The Figma frame is NOT
// updated by this change. Club crests: a real logo when the API supplies a
// safe one, else the club's first letter (the same rule Sports Hub uses).
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { listFixtures, type MatchListItem, type MatchPhase } from "../api/sports";
import { listArticles, type ArticleSummary } from "../api/blog";
import { formatDate } from "../lib/formatDate";
import { safeImageUrl } from "../lib/safeImageUrl";
import { getStoredAccessToken } from "../lib/session";
import { formatKickoffTime, monogramFor, phaseLabel, todayIso } from "./sports-hub/format";
import CoverMedia from "./blog/CoverMedia";
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

// Display order: live, then scheduled (soonest first), then finished (most
// recent first), then postponed and cancelled. Stable within a group.
function statusGroup(status: MatchPhase): number {
  if (status === "live") return 0;
  if (status === "scheduled") return 1;
  if (status === "finished") return 2;
  return 3;
}

export function sortFixtures(items: MatchListItem[]): MatchListItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ga = statusGroup(a.item.status);
      const gb = statusGroup(b.item.status);
      if (ga !== gb) return ga - gb;
      const ta = Date.parse(a.item.kickoffTime);
      const tb = Date.parse(b.item.kickoffTime);
      if (ga === 2 && ta !== tb) return tb - ta;
      if (ga !== 0 && ta !== tb) return ta - tb;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

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

function HeroMatchCard({ match }: { match: MatchListItem }) {
  return (
    <Link to={`/sports-hub/matches/${match.id}`} className="home-hero__card">
      <div className="home-fixture-card__meta">
        <span className="home-fixture-card__league">{match.competition}</span>
        <span className={pillClass(match.status)}>{phaseLabel(match)}</span>
      </div>
      <div className="home-fixture-card__teams">
        <TeamRows match={match} />
      </div>
      <div className="home-hairline" />
      <p className="home-fixture-card__venue">{matchLine(match)}</p>
    </Link>
  );
}

function FixtureStrip({ state }: { state: Loadable<MatchListItem> }) {
  if (state.status === "error") return null;
  return (
    <section className="home-section" aria-labelledby="home-fixtures-title">
      <div className="home-section__head">
        <div>
          <p className="home-eyebrow">TODAY'S FIXTURES</p>
          <h2 id="home-fixtures-title" className="home-section__title">
            Matches today
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

function MarketingHome() {
  const [fixtures, setFixtures] = useState<Loadable<MatchListItem>>({ status: "loading" });
  const [articles, setArticles] = useState<Loadable<ArticleSummary>>({ status: "loading" });

  useEffect(() => {
    let active = true;
    listFixtures(todayIso())
      .then((page) => {
        if (active) setFixtures({ status: "ready", items: sortFixtures(page.items) });
      })
      .catch(() => {
        if (active) setFixtures({ status: "error" });
      });
    listArticles()
      .then((page) => {
        if (active) setArticles({ status: "ready", items: page.items });
      })
      .catch(() => {
        if (active) setArticles({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, []);

  const heroMatch =
    fixtures.status === "ready"
      ? (fixtures.items.find((m) => m.status === "live" || m.status === "scheduled" || m.status === "finished") ?? null)
      : null;

  return (
    <div className="home">
      <section className={`home-hero${heroMatch ? "" : " home-hero--solo"}`}>
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
        {heroMatch ? <HeroMatchCard match={heroMatch} /> : null}
      </section>

      <FixtureStrip state={fixtures} />

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
          Start the record you should
          <br />
          have had all along.
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
