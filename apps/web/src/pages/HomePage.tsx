// Home -- the logged-out marketing landing page.
//
// Figma source: canonical frame 5204:6728 ("Home Page Desktop -- Premium
// Light, Sprint 2 Pass 2"), "Soccernity-MVP" file (weZWWqggy9j13eX8bhFgs6).
// Decision Log #46 confirms 5204:6728 is the canonical homepage;
// Decision Log #152 confirms "/" is exclusively the logged-out marketing
// page and that logged-in users route to the Community feed instead --
// there is no separate authenticated-homepage design, and none is built
// here.
//
// ROUTING: this component IS the "/" index route (see src/app/router.tsx).
// If a session token exists (getStoredAccessToken()), it redirects to
// /community -- the authenticated feed -- rather than rendering the
// marketing page. Otherwise it renders the marketing page as-is. Session
// is read directly via src/lib/session.ts, the same way every other
// converted page does it (no AuthContext exists yet -- see that file's
// header comment).
//
// EVERYTHING BELOW THE NAVBAR IS STATIC. Per the frame's own annotation
// zone (5214:6805) and Decision Log #6: there is no fixtures, news, or
// points/appearance data source anywhere in Build Plan Section 4, so the
// fixtures strip, talent clips, trending stories and the hero's live
// fixture card are all illustrative dummy content hardcoded to match the
// Figma frame -- deliberately NOT wired to anything, the same discipline
// ProfilePage.tsx applies to its own unbacked Posts/Media tabs. Club
// crests are rendered typographically (club-initial badges), also per the
// frame -- the crest-licensing question is sidestepped by design.
import { Link, Navigate } from "react-router";
import { getStoredAccessToken } from "../lib/session";
import "./HomePage.css";

interface Fixture {
  league: string;
  status: string;
  statusKind: "live" | "ft" | "upcoming";
  home: { name: string; initials: string; score: string };
  away: { name: string; initials: string; score: string };
  venue: string;
}

// Hardcoded to match Figma frame 5204:6728's "Today's Fixtures" module.
// Illustrative only -- no fixtures endpoint exists (Decision Log #6).
const FIXTURES: Fixture[] = [
  {
    league: "Lagos Sunday League",
    status: "LIVE",
    statusKind: "live",
    home: { name: "Ikoyi Rovers FC", initials: "IK", score: "2" },
    away: { name: "Surulere United", initials: "SU", score: "1" },
    venue: "Teslim Balogun Stadium · 78'",
  },
  {
    league: "Rivers Amateur Div 1",
    status: "LIVE",
    statusKind: "live",
    home: { name: "Port Harcourt Blues", initials: "PO", score: "0" },
    away: { name: "Aba Warriors", initials: "AB", score: "0" },
    venue: "Alfred Diete-Spiff · 34'",
  },
  {
    league: "Lagos Sunday League",
    status: "FT",
    statusKind: "ft",
    home: { name: "Yaba Athletic", initials: "YA", score: "3" },
    away: { name: "Ojota Rangers", initials: "OJ", score: "2" },
    venue: "Yaba College Ground · Full time",
  },
  {
    league: "Northern Grassroots Cup",
    status: "17:30",
    statusKind: "upcoming",
    home: { name: "Kaduna City FC", initials: "KA", score: "–" },
    away: { name: "Jos Highlanders", initials: "JO", score: "–" },
    venue: "Ahmadu Bello Stadium · Today",
  },
];

const PILLARS = [
  {
    index: "01",
    title: "Grassroots first",
    body: "Most players never appear in any official record anywhere. Soccernity starts with the Sunday leagues, school pitches and informal teams no database has ever counted.",
  },
  {
    index: "02",
    title: "A community around your game",
    body: "Follow players and teams, post about your matches, and talk football with the people who actually watched the same game you did.",
  },
  {
    index: "03",
    title: "A record that travels with you",
    body: "Log fixtures and results yourself and keep an appearance history that stays yours. Verified profiles and discovery tools arrive in a later phase.",
  },
];

const TALENT_CLIPS = [
  { club: "IKOYI ROVERS FC", title: "Free-kick routine that won the Lagos derby", meta: "Midfielder · 17", length: "0:48" },
  { club: "SURULERE UNITED", title: "Back-post header in the 89th minute", meta: "Forward · 19", length: "1:12" },
  { club: "PORT HARCOURT BLUES", title: "Goal-line clearance to keep it level", meta: "Defender · 16", length: "0:36" },
];

const TOP_STORIES = [
  { rank: "01", title: "Kane joins the 250 club with a trademark finish", meta: "Premier League · 3 days ago" },
  { rank: "02", title: "Arsenal's title push tested by a resurgent Newcastle", meta: "Premier League · 4 days ago" },
  { rank: "03", title: "Grassroots cup final draws a record crowd in Surulere", meta: "Grassroots · 5 days ago" },
];

export default function HomePage() {
  // Decision Log #152: a signed-in visitor to "/" goes to the feed, not
  // the marketing page. `replace` so the marketing page isn't left in
  // history for the back button to land on.
  if (getStoredAccessToken()) {
    return <Navigate to="/community" replace />;
  }

  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-hero__copy">
          <span className="home-eyebrow home-eyebrow--on-navy">
            <span className="home-eyebrow__dot" aria-hidden="true" />
            BUILT FOR GRASSROOTS FOOTBALL
          </span>
          <h1 className="home-hero__title">
            Every match you play
            <br />
            deserves a record.
          </h1>
          <p className="home-hero__lede">
            Soccernity gives unaffiliated players, their teams and the communities around them a real football identity
            &mdash; fixtures, results and a history that actually travels with you.
          </p>
          <div className="home-cta-row">
            <Link to="/signup" className="home-btn home-btn--primary">
              Create your profile
            </Link>
            <Link to="/signup" className="home-btn home-btn--ghost-on-navy">
              Explore fixtures
            </Link>
          </div>
        </div>

        {/* Illustrative live-fixture card -- no fixtures data source
            exists (Decision Log #6). Hardcoded to match the Figma frame. */}
        <div className="home-hero__card" aria-hidden="true">
          <div className="home-fixture-card__meta">
            <span className="home-pill home-pill--live">LIVE</span>
            <span className="home-fixture-card__league">Lagos Sunday League&nbsp;&nbsp;·&nbsp;&nbsp;Matchday 12</span>
          </div>
          <div className="home-fixture-card__teams">
            <div className="home-team-row">
              <span className="home-badge">IK</span>
              <span className="home-team-row__name">Ikoyi Rovers FC</span>
              <span className="home-team-row__score">2</span>
            </div>
            <div className="home-team-row">
              <span className="home-badge">SU</span>
              <span className="home-team-row__name home-team-row__name--muted">Surulere United</span>
              <span className="home-team-row__score home-team-row__score--muted">1</span>
            </div>
          </div>
          <div className="home-hairline" />
          <p className="home-fixture-card__venue">Teslim Balogun Stadium&nbsp;&nbsp;·&nbsp;&nbsp;78'</p>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section__head">
          <div>
            <p className="home-eyebrow">TODAY'S FIXTURES</p>
            <h2 className="home-section__title">Matches happening right now</h2>
          </div>
          <span className="home-section__link home-section__link--outline">View all fixtures &rarr;</span>
        </div>
        <div className="home-fixture-grid">
          {FIXTURES.map((f) => (
            <article key={`${f.home.name}-${f.away.name}`} className="home-fixture">
              <div className="home-fixture__meta">
                <span className="home-fixture__league">{f.league}</span>
                <span className={`home-pill home-pill--${f.statusKind}`}>{f.status}</span>
              </div>
              <div className="home-fixture__teams">
                {[f.home, f.away].map((team) => (
                  <div key={team.name} className="home-team-row">
                    <span className="home-badge home-badge--sm">{team.initials}</span>
                    <span className="home-team-row__name">{team.name}</span>
                    <span className="home-team-row__score">{team.score}</span>
                  </div>
                ))}
              </div>
              <div className="home-hairline" />
              <p className="home-fixture__venue">{f.venue}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section home-section--surface home-section--center">
        <div className="home-section__head-centered">
          <p className="home-eyebrow">WHY SOCCERNITY</p>
          <h2 className="home-section__title">
            Football's biggest league is the one
            <br />
            nobody keeps records for.
          </h2>
          <p className="home-section__sub">
            Soccernity is built for the players outside the academy system &mdash; and for the fans, coaches and
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

      <section className="home-section">
        <div className="home-section__head">
          <div>
            <p className="home-eyebrow">TALENTS</p>
            <h2 className="home-section__title">Clips from this weekend</h2>
          </div>
          <span className="home-section__link home-section__link--outline">See all talents &rarr;</span>
        </div>
        <div className="home-clip-grid">
          {TALENT_CLIPS.map((c) => (
            <article key={c.title} className="home-clip">
              <div className="home-clip__media" aria-hidden="true">
                <span className="home-clip__play">&#9658;</span>
                <span className="home-clip__length">{c.length}</span>
              </div>
              <div className="home-clip__body">
                <span className="home-pill home-pill--tag">{c.club}</span>
                <p className="home-clip__title">{c.title}</p>
                <p className="home-clip__meta">{c.meta}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section home-section--surface">
        <div className="home-section__head">
          <div>
            <p className="home-eyebrow">TRENDING</p>
            <h2 className="home-section__title">What football is talking about</h2>
          </div>
          <span className="home-section__link home-section__link--navy">See more stories &rarr;</span>
        </div>
        <div className="home-editorial">
          <article className="home-featured">
            <div className="home-featured__media" aria-hidden="true">
              <span className="home-pill home-pill--tag home-pill--tag-green">PREMIER LEAGUE</span>
            </div>
            <div className="home-featured__body">
              <h3 className="home-featured__title">
                Zaha double helps Crystal Palace ease past Villa for first Premier League win
              </h3>
              <p className="home-featured__excerpt">
                Wilfried Zaha scored twice as Crystal Palace claimed their first league win of the season, easing the
                early pressure on a side that had taken just two points from their opening four fixtures.
              </p>
              <p className="home-featured__meta">Soccernity Sports Desk · 2 days ago · 4 min read</p>
            </div>
          </article>
          <aside className="home-story-list">
            <p className="home-eyebrow">TOP STORIES TODAY</p>
            {TOP_STORIES.map((s) => (
              <div key={s.rank} className="home-story">
                <span className="home-story__thumb" aria-hidden="true" />
                <div className="home-story__text">
                  <span className="home-pill home-pill--rank">{s.rank}</span>
                  <p className="home-story__title">{s.title}</p>
                  <p className="home-story__meta">{s.meta}</p>
                </div>
              </div>
            ))}
          </aside>
        </div>
      </section>

      <section className="home-closing">
        <p className="home-eyebrow home-eyebrow--on-navy">GET STARTED</p>
        <h2 className="home-closing__title">
          Start the record you should
          <br />
          have had all along.
        </h2>
        <p className="home-closing__sub">
          Free to join. Create your profile, add your team, and log your first fixture in a few minutes.
        </p>
        <div className="home-cta-row">
          <Link to="/signup" className="home-btn home-btn--primary">
            Create your profile
          </Link>
          <Link to="/signup" className="home-btn home-btn--ghost-on-navy">
            Browse grassroots teams
          </Link>
        </div>
      </section>

      {/* The site footer is rendered by FooterLayout (src/layout/
          FooterLayout.tsx), not inline here -- see src/app/router.tsx and
          Decision Log #213. */}
    </div>
  );
}
