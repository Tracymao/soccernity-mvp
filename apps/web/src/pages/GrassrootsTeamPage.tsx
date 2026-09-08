// Grassroots — Public Team Page. Figma source: "Grassroots — 9 Public
// Team Page (Verified) — Desktop" (6373:17444) / "— 10 Public Team Page
// (No Fixtures, Unverified) — Desktop" (6374:17501) and their mobile
// pairs, "Soccernity-MVP" (weZWWqggy9j13eX8bhFgs6), from
// sprint-5/grassroots-record-keeping-screens (Decision Log #253) +
// sprint-5/grassroots-opponent-name-design (Decision Log #261).
// Route: /grassroots/:teamId.
//
// Real data (Build Plan Section 4.5, GrassrootsService):
//   - GET /teams/:id            — monogram, name, city • type, verified
//     badge                                            (api/grassroots.ts)
//   - GET /teams/:id/fixtures   — every fixture the team is in (as teamA
//     or teamB), keyset-paginated; split client-side into Upcoming
//     (no result) and Results (has a result)
//
// Won / Drew / Lost and the "{our} – {their}" score are derived
// client-side from the fixture's single Result row (scoreA / scoreB) and
// which side this team is — there is NO stored outcome, points or
// standings model (Decision Log #253). The away-opponent label falls back
// to "Opponent TBC" only when the fixture has neither a registered teamB
// nor a free-text opponentName (Decision Log #260 / #261) — that fallback
// string is owned here, the API never returns it.
//
// Deliberately NOT here (nothing invented beyond GrassrootsTeam's four
// fields): no squad / player list, no league table, no season, no
// follow / join action (that's ClubPage, not GrassrootsTeam), no
// club-style feed. No organiser CTA — the token payload is { sub, role }
// only, so the client can't tell if the viewer owns the team, and
// Section 4.5 encodes no permission model (Decision Log #253 §6.7). The
// schedule / manage flows are reached from the register/schedule
// confirmations in the organiser-flow PR, not conditionally shown here.
//
// GET /teams/:id is JwtAuthGuard-only, not public (Decision Log #269),
// despite the "Public Team Page" Figma name — a no-session visit shows a
// "log in" prompt and never calls the API. A missing / 404 team renders
// an honest "Team not found" state with a link back to /grassroots.
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  getTeamById,
  getTeamFixtures,
  leagueTypeLabel,
  opponentLabel,
  GrassrootsApiError,
  type Fixture,
  type GrassrootsTeam,
} from "../api/grassroots";
import { getStoredAccessToken } from "../lib/session";
import "./grassroots/GrassrootsPage.css";

type LoadState = "loading" | "loaded" | "error" | "not-found" | "no-session";
type SectionState = "loading" | "loaded" | "error";

function monogramFor(name: string): string {
  return name.trim()[0]?.toUpperCase() ?? "?";
}

function metaLine(team: GrassrootsTeam): string {
  return `${team.city}  •  ${leagueTypeLabel(team.leagueType)}`;
}

// "v  {opponent}" — matches the Figma fixture row ("v  Ikorodu Rangers").
function opponentRowLabel(fixture: Fixture, teamId: string): string {
  return `v  ${opponentLabel(fixture, teamId)}`;
}

const DAY_FMT = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short" });
const TIME_FMT = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

function formatDay(iso: string): string {
  return DAY_FMT.format(new Date(iso)).toUpperCase();
}

function formatTime(iso: string): string {
  return TIME_FMT.format(new Date(iso));
}

// This team's score first, then the opponent's — regardless of home/away.
function scoreFromPerspective(fixture: Fixture, teamId: string): { ours: number; theirs: number } | null {
  if (!fixture.result) return null;
  const isHome = fixture.teamAId === teamId;
  return isHome
    ? { ours: fixture.result.scoreA, theirs: fixture.result.scoreB }
    : { ours: fixture.result.scoreB, theirs: fixture.result.scoreA };
}

function outcomeLabel(score: { ours: number; theirs: number }): string {
  if (score.ours > score.theirs) return "Won";
  if (score.ours < score.theirs) return "Lost";
  return "Drew";
}

// The opponent has a crest (monogram) when it's a registered team; the
// free-text / fully-TBC opponent gets the outlined "?" no-crest tile.
function opponentIsRegistered(fixture: Fixture, teamId: string): boolean {
  return fixture.teamBId === teamId || fixture.teamB != null;
}

function OpponentCrest({ fixture, teamId }: { fixture: Fixture; teamId: string }) {
  const label = opponentLabel(fixture, teamId);
  if (opponentIsRegistered(fixture, teamId)) {
    return (
      <span className="grassroots-fixture__crest" aria-hidden="true">
        {monogramFor(label)}
      </span>
    );
  }
  return (
    <span className="grassroots-fixture__crest grassroots-fixture__crest--none" aria-hidden="true">
      ?
    </span>
  );
}

function StatusPill({ status }: { status: Fixture["status"] }) {
  if (status === "live") {
    return (
      <span className="grassroots-pill grassroots-pill--live">
        <span className="grassroots-pill__dot" aria-hidden="true" /> LIVE
      </span>
    );
  }
  if (status === "full_time") {
    return <span className="grassroots-pill grassroots-pill--full-time">FULL TIME</span>;
  }
  return <span className="grassroots-pill">SCHEDULED</span>;
}

export default function GrassrootsTeamPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const token = getStoredAccessToken();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [team, setTeam] = useState<GrassrootsTeam | null>(null);

  const [fixturesState, setFixturesState] = useState<SectionState>("loading");
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [fixturesCursor, setFixturesCursor] = useState<string | null>(null);
  const [fixturesLoadingMore, setFixturesLoadingMore] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoadState("no-session");
      return;
    }
    if (!teamId) {
      setLoadState("not-found");
      return;
    }
    setLoadState("loading");

    let teamResult: GrassrootsTeam;
    try {
      teamResult = await getTeamById(token, teamId);
    } catch (err) {
      setLoadState(err instanceof GrassrootsApiError && err.status === 404 ? "not-found" : "error");
      return;
    }
    setTeam(teamResult);
    setLoadState("loaded");

    setFixturesState("loading");
    try {
      const page = await getTeamFixtures(token, teamId);
      setFixtures(page.items);
      setFixturesCursor(page.nextCursor);
      setFixturesState("loaded");
    } catch {
      setFixturesState("error");
    }
  }, [token, teamId]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadMoreFixtures() {
    if (!token || !teamId || !fixturesCursor || fixturesLoadingMore) return;
    setFixturesLoadingMore(true);
    try {
      const page = await getTeamFixtures(token, teamId, fixturesCursor);
      setFixtures((prev) => [...prev, ...page.items]);
      setFixturesCursor(page.nextCursor);
    } catch {
      /* keep what we have; the button stays and can be retried */
    } finally {
      setFixturesLoadingMore(false);
    }
  }

  if (loadState === "no-session") {
    return (
      <div className="grassroots-status" role="status">
        Log in to view this team. <Link to="/login">Log in</Link>
      </div>
    );
  }

  if (loadState === "loading") {
    return (
      <div className="grassroots-status" role="status">
        Loading team…
      </div>
    );
  }

  if (loadState === "not-found") {
    return (
      <div className="grassroots-team">
        <Link to="/grassroots" className="grassroots-back">
          ← Teams
        </Link>
        <p className="grassroots-status" role="status">
          Team not found. <Link to="/grassroots">Back to all teams</Link>
        </p>
      </div>
    );
  }

  if (loadState === "error" || !team) {
    return (
      <div className="grassroots-team">
        <Link to="/grassroots" className="grassroots-back">
          ← Teams
        </Link>
        <p className="grassroots-status grassroots-status--error" role="alert">
          Couldn&rsquo;t load this team. Please try again shortly.
        </p>
      </div>
    );
  }

  const results = fixtures
    .filter((f) => f.result != null)
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  const upcoming = fixtures
    .filter((f) => f.result == null)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  return (
    <div className="grassroots-team">
      <Link to="/grassroots" className="grassroots-back">
        ← Teams
      </Link>

      <div className="grassroots-team__identity">
        <span className="grassroots-team__monogram" aria-hidden="true">
          {monogramFor(team.name)}
        </span>
        <div className="grassroots-team__text">
          <h1 className="grassroots-team__name">{team.name}</h1>
          <p className="grassroots-team__meta">{metaLine(team)}</p>
          {team.verified ? (
            <span className="grassroots-badge grassroots-badge--verified">
              <span aria-hidden="true">✓</span> VERIFIED TEAM
            </span>
          ) : (
            <span className="grassroots-badge grassroots-badge--unverified">COMMUNITY TEAM · UNVERIFIED</span>
          )}
        </div>
      </div>

      <hr className="grassroots-team__divider" />

      {fixturesState === "loading" && (
        <p className="grassroots-status" role="status">
          Loading fixtures…
        </p>
      )}

      {fixturesState === "error" && (
        <p className="grassroots-status grassroots-status--error" role="alert">
          Couldn&rsquo;t load this team&rsquo;s fixtures.
        </p>
      )}

      {fixturesState === "loaded" && fixtures.length === 0 && (
        <div className="grassroots-empty">
          <p className="grassroots-empty__title">No fixtures yet</p>
          <p className="grassroots-empty__body">
            {team.name} has not scheduled any matches. Fixtures and results appear here as soon as the team&rsquo;s
            organiser adds them.
          </p>
        </div>
      )}

      {fixturesState === "loaded" && upcoming.length > 0 && (
        <section className="grassroots-section" aria-labelledby="grassroots-upcoming">
          <div className="grassroots-section__head">
            <h2 id="grassroots-upcoming" className="grassroots-section__title">
              Upcoming fixtures
            </h2>
            <span className="grassroots-section__count">
              {upcoming.length} {upcoming.length === 1 ? "fixture" : "fixtures"}
            </span>
          </div>
          <ul className="grassroots-fixtures">
            {upcoming.map((fixture) => (
              <li key={fixture.id} className="grassroots-fixture">
                <span className="grassroots-fixture__date">
                  <span className="grassroots-fixture__day">{formatDay(fixture.scheduledAt)}</span>
                  <span className="grassroots-fixture__time">{formatTime(fixture.scheduledAt)}</span>
                </span>
                <span className="grassroots-fixture__opponent">
                  <OpponentCrest fixture={fixture} teamId={team.id} />
                  <span className="grassroots-fixture__text">
                    <span className="grassroots-fixture__name">{opponentRowLabel(fixture, team.id)}</span>
                    {fixture.venue && <span className="grassroots-fixture__venue">{fixture.venue}</span>}
                  </span>
                </span>
                <StatusPill status={fixture.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {fixturesState === "loaded" && upcoming.length > 0 && results.length > 0 && (
        <hr className="grassroots-team__divider" />
      )}

      {fixturesState === "loaded" && results.length > 0 && (
        <section className="grassroots-section" aria-labelledby="grassroots-results">
          <div className="grassroots-section__head">
            <h2 id="grassroots-results" className="grassroots-section__title">
              Results
            </h2>
            <span className="grassroots-section__count">{results.length} played</span>
          </div>
          <ul className="grassroots-fixtures">
            {results.map((fixture) => {
              const score = scoreFromPerspective(fixture, team.id)!;
              return (
                <li key={fixture.id} className="grassroots-fixture">
                  <span className="grassroots-fixture__date">
                    <span className="grassroots-fixture__day">{formatDay(fixture.scheduledAt)}</span>
                    <span className="grassroots-fixture__time">{outcomeLabel(score)}</span>
                  </span>
                  <span className="grassroots-fixture__opponent">
                    <OpponentCrest fixture={fixture} teamId={team.id} />
                    <span className="grassroots-fixture__name">{opponentRowLabel(fixture, team.id)}</span>
                  </span>
                  <span className="grassroots-fixture__score">
                    {score.ours} – {score.theirs}
                  </span>
                  <StatusPill status={fixture.status} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {fixturesCursor && fixturesState === "loaded" && (
        <button
          type="button"
          className="grassroots-load-more"
          onClick={loadMoreFixtures}
          disabled={fixturesLoadingMore}
        >
          {fixturesLoadingMore ? "Loading…" : "Load more fixtures"}
        </button>
      )}
    </div>
  );
}
