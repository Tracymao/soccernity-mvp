// Grassroots — Manage a fixture / log its result. Figma source:
// "Grassroots — 6 Fixture Manage (Scheduled) — Desktop" (6372:17141),
// "— 7 Log Result (Live) — Desktop" (6372:17259) and "— 8 Result
// Confirmed (Full Time) — Desktop" (6373:17321) + mobile pairs,
// "Soccernity-MVP" (weZWWqggy9j13eX8bhFgs6), from
// sprint-5/grassroots-record-keeping-screens (Decision Log #253).
// Route: /grassroots/fixtures/:fixtureId — ONE status-driven route
// (frames 6/7/8 are the same screen at Fixture.status scheduled / live /
// full_time), matching the backend's single status machine.
//
// Real data (Build Plan Section 4.5, api/grassroots.ts):
//   - GET /fixtures/:id
//   - PATCH /fixtures/:id/status  { status: "live" | "full_time" } — only
//     scheduled→live and live→full_time are legal; every other transition
//     is a 409 NAMING the current + requested status (Decision Log #254),
//     surfaced verbatim here rather than hidden behind a disabled button.
//   - POST /fixtures/:id/result   { scoreA, scoreB } — "first write is
//     final": a second submission is a 409, which this page treats as an
//     EXPECTED, explained outcome (the fixture already has its one Result
//     row), not a generic failure (Decision Log #255).
//
// The write endpoints are JwtAuthGuard + GuardianConsentGuard and require
// the caller to manage one of the two teams (Decision Log #255). GET
// /fixtures/:id returns no `createdById` (FIXTURE_TEAM_SELECT is
// id/name/city/verified only), so this page CANNOT client-side guard who
// the manager is — it renders the manage UI for any signed-in user and
// surfaces the server's 403 (consent OR "you may only manage…"). In
// practice this page is reached from the team-page organiser toolbar or
// the schedule-fixture confirmation, so the visitor is almost always the
// organiser. Flagged in this PR's report.
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  getFixtureById,
  logResult,
  updateFixtureStatus,
  GrassrootsApiError,
  type Fixture,
} from "../api/grassroots";
import { getStoredAccessToken } from "../lib/session";
import { isAwaitingConsent } from "./grassroots/errors";
import "./grassroots/GrassrootsPage.css";

type LoadState = "loading" | "loaded" | "error" | "not-found" | "no-session";
type Mode = "view" | "score";

const WHEN_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatWhen(iso: string): string {
  // "Saturday, 12 September, 15:00" -> "Saturday 12 September  ·  15:00"
  const parts = WHEN_FMT.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}  ·  ${get("hour")}:${get("minute")}`;
}

function awayLabel(fixture: Fixture): string {
  return fixture.teamB?.name ?? fixture.opponentName ?? "Opponent TBC";
}

function monogramFor(name: string): string {
  return name.trim()[0]?.toUpperCase() ?? "?";
}

function Stepper({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="grassroots-scorer">
      <span className="grassroots-scorer__mono" aria-hidden="true">
        {monogramFor(label)}
      </span>
      <span className="grassroots-scorer__name">{label}</span>
      <div className="grassroots-stepper">
        <button
          type="button"
          className="grassroots-stepper__btn"
          aria-label={`Decrease ${label} score`}
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={disabled || value === 0}
        >
          −
        </button>
        <span className="grassroots-stepper__value" aria-label={`${label} score`}>
          {value}
        </span>
        <button
          type="button"
          className="grassroots-stepper__btn"
          aria-label={`Increase ${label} score`}
          onClick={() => onChange(value + 1)}
          disabled={disabled}
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function GrassrootsFixturePage() {
  const { fixtureId } = useParams<{ fixtureId: string }>();
  const token = getStoredAccessToken();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [mode, setMode] = useState<Mode>("view");

  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [awaitingConsent, setAwaitingConsent] = useState(false);
  const [justActed, setJustActed] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoadState("no-session");
      return;
    }
    if (!fixtureId) {
      setLoadState("not-found");
      return;
    }
    setLoadState("loading");
    try {
      const fx = await getFixtureById(token, fixtureId);
      setFixture(fx);
      if (fx.result) {
        setScoreA(fx.result.scoreA);
        setScoreB(fx.result.scoreB);
      }
      setLoadState("loaded");
    } catch (err) {
      setLoadState(err instanceof GrassrootsApiError && err.status === 404 ? "not-found" : "error");
    }
  }, [token, fixtureId]);

  useEffect(() => {
    load();
  }, [load]);

  function handleError(err: unknown, fallback: string) {
    if (isAwaitingConsent(err)) {
      setAwaitingConsent(true);
      return;
    }
    setError(err instanceof GrassrootsApiError ? err.message : fallback);
    // A 409 means the fixture's state changed underneath us (another
    // organiser acted, or a stale page) — pull the fresh state so the UI
    // catches up.
    if (err instanceof GrassrootsApiError && err.status === 409) {
      void load();
    }
  }

  async function startMatch() {
    if (!token || !fixtureId || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setAwaitingConsent(false);
    try {
      const fx = await updateFixtureStatus(token, fixtureId, "live");
      setFixture(fx);
      setJustActed(false);
    } catch (err) {
      handleError(err, "Couldn't start the match.");
    } finally {
      setBusy(false);
    }
  }

  async function saveResult() {
    if (!token || !fixtureId || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setAwaitingConsent(false);
    try {
      const fx = await logResult(token, fixtureId, { scoreA, scoreB });
      setFixture(fx);
      setMode("view");
      setJustActed(true);
    } catch (err) {
      if (err instanceof GrassrootsApiError && err.status === 409) {
        // "First write is final" — expected, not an error. Refetch so the
        // page shows the score that was actually recorded.
        setNotice(err.message);
        void load();
        setMode("view");
      } else {
        handleError(err, "Couldn't save the result.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loadState === "no-session") {
    return (
      <div className="grassroots-status" role="status">
        Log in to manage this fixture. <Link to="/login">Log in</Link>
      </div>
    );
  }

  if (loadState === "loading") {
    return (
      <div className="grassroots-status" role="status">
        Loading fixture…
      </div>
    );
  }

  if (loadState === "not-found") {
    return (
      <div className="grassroots-form">
        <p className="grassroots-status" role="status">
          Fixture not found. <Link to="/grassroots">Back to teams</Link>
        </p>
      </div>
    );
  }

  if (loadState === "error" || !fixture) {
    return (
      <div className="grassroots-form">
        <p className="grassroots-status grassroots-status--error" role="alert">
          Couldn&rsquo;t load that fixture. Please try again shortly.
        </p>
      </div>
    );
  }

  const home = fixture.teamA.name;
  const away = awayLabel(fixture);
  const backLink = (
    <Link to={`/grassroots/${fixture.teamAId}`} className="grassroots-linkback">
      ← {home}
    </Link>
  );

  const consentNotice = awaitingConsent && (
    <p className="grassroots-form__error" role="alert">
      Your account is awaiting guardian consent, so you can&rsquo;t update this fixture yet.{" "}
      <Link to="/guardian-consent">Check your consent status</Link>.
    </p>
  );
  const errorNotice = error && (
    <p className="grassroots-form__error" role="alert">
      {error}
    </p>
  );

  // --- Score entry (from "live", or "already played" on a scheduled fixture) ---
  if (mode === "score") {
    return (
      <div className="grassroots-form">
        {backLink}
        <div className="grassroots-form__header">
          <h1 className="grassroots-form__title">Log the result</h1>
          <p className="grassroots-form__lede">
            Set the final score, then end the match to save it. Saving the result is what makes it
            public on your team page.
          </p>
        </div>

        <div className="grassroots-form__card">
          <div className="grassroots-scorers">
            <Stepper label={home} value={scoreA} onChange={setScoreA} disabled={busy} />
            <span className="grassroots-scorers__dash" aria-hidden="true">
              –
            </span>
            <Stepper label={away} value={scoreB} onChange={setScoreB} disabled={busy} />
          </div>
        </div>

        <div className="grassroots-callout">
          <p className="grassroots-callout__title">A fixture can only be scored once</p>
          <p className="grassroots-callout__body">
            Once you end the match the score is saved and published. Check it before you save.
          </p>
        </div>

        {consentNotice}
        {errorNotice}

        <button
          type="button"
          className="grassroots-btn grassroots-btn--primary"
          onClick={saveResult}
          disabled={busy}
        >
          {busy ? "Saving…" : "End match & save result"}
        </button>
        <button
          type="button"
          className="grassroots-btn grassroots-btn--secondary"
          onClick={() => {
            setMode("view");
            setError(null);
          }}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    );
  }

  // --- full_time: read-only result (frame 8) ---------------------------
  if (fixture.status === "full_time") {
    const r = fixture.result;
    return (
      <div className="grassroots-success">
        {justActed && (
          <span className="grassroots-success__disc" aria-hidden="true">
            ✓
          </span>
        )}
        <div className="grassroots-form__header">
          <h1 className="grassroots-form__title">{justActed ? "Result saved" : "Full time"}</h1>
          <p className="grassroots-form__lede">
            {justActed
              ? "The final score is live on your team page. Anyone can see it now."
              : "This fixture is over. The score below is on your team page."}
          </p>
        </div>

        {notice && (
          <p className="grassroots-callout__body" role="status">
            {notice}
          </p>
        )}
        {consentNotice}
        {errorNotice}

        <div className="grassroots-fixcard">
          <div className="grassroots-fixcard__top">
            <span className="grassroots-fixcard__when">{formatWhen(fixture.scheduledAt)}</span>
            <span className="grassroots-pill grassroots-pill--full-time">FULL TIME</span>
          </div>
          <div className="grassroots-fixcard__teams">
            <span className="grassroots-fixcard__side">
              <span className="grassroots-fixcard__sidemono" aria-hidden="true">
                {monogramFor(home)}
              </span>
              <span className="grassroots-fixcard__sidename">{home}</span>
            </span>
            {r ? (
              <span className="grassroots-fixcard__bigscore">
                {r.scoreA} – {r.scoreB}
              </span>
            ) : (
              <span className="grassroots-fixcard__vs">ended</span>
            )}
            <span className="grassroots-fixcard__side">
              <span className="grassroots-fixcard__sidemono" aria-hidden="true">
                {monogramFor(away)}
              </span>
              <span className="grassroots-fixcard__sidename">{away}</span>
            </span>
          </div>
          {fixture.venue && (
            <>
              <hr className="grassroots-team__divider" />
              <div className="grassroots-fixcard__meta">
                <span>Venue · {fixture.venue}</span>
              </div>
            </>
          )}
        </div>

        <Link to={`/grassroots/${fixture.teamAId}`} className="grassroots-btn grassroots-btn--primary">
          View on team page
        </Link>
        <Link to={`/grassroots/${fixture.teamAId}`} className="grassroots-btn grassroots-btn--secondary">
          Back to team page
        </Link>
      </div>
    );
  }

  // --- scheduled (frame 6) / live (frame 7 entry) --------------------
  const isLive = fixture.status === "live";
  return (
    <div className="grassroots-form">
      {backLink}
      <div className="grassroots-form__header">
        <h1 className="grassroots-form__title">{isLive ? "Match in play" : "Match day"}</h1>
        <p className="grassroots-form__lede">
          {isLive
            ? "The match is live. Set the final score and end the match to save it."
            : "When the match kicks off, start it here. You'll be able to log the score while it's in play."}
        </p>
      </div>

      {notice && (
        <p className="grassroots-callout__body" role="status">
          {notice}
        </p>
      )}

      <div className="grassroots-fixcard">
        <div className="grassroots-fixcard__top">
          <span className="grassroots-fixcard__when">{formatWhen(fixture.scheduledAt)}</span>
          <span className={isLive ? "grassroots-pill grassroots-pill--live" : "grassroots-pill"}>
            {isLive && <span className="grassroots-pill__dot" aria-hidden="true" />}
            {isLive ? "LIVE" : "SCHEDULED"}
          </span>
        </div>
        <div className="grassroots-fixcard__teams">
          <span className="grassroots-fixcard__side">
            <span className="grassroots-fixcard__sidemono" aria-hidden="true">
              {monogramFor(home)}
            </span>
            <span className="grassroots-fixcard__sidename">{home}</span>
          </span>
          <span className="grassroots-fixcard__vs">vs</span>
          <span className="grassroots-fixcard__side grassroots-fixcard__side--right">
            <span className="grassroots-fixcard__sidemono" aria-hidden="true">
              {monogramFor(away)}
            </span>
            <span className="grassroots-fixcard__sidename">{away}</span>
          </span>
        </div>
        {fixture.venue && (
          <>
            <hr className="grassroots-team__divider" />
            <div className="grassroots-fixcard__meta">
              <span>Venue · {fixture.venue}</span>
            </div>
          </>
        )}
      </div>

      {consentNotice}
      {errorNotice}

      {isLive ? (
        <button
          type="button"
          className="grassroots-btn grassroots-btn--primary"
          onClick={() => {
            setMode("score");
            setError(null);
          }}
          disabled={busy}
        >
          Log the result
        </button>
      ) : (
        <>
          <button
            type="button"
            className="grassroots-btn grassroots-btn--primary"
            onClick={startMatch}
            disabled={busy}
          >
            {busy ? "Starting…" : "Start match"}
          </button>
          <button
            type="button"
            className="grassroots-btn grassroots-btn--secondary"
            onClick={() => {
              setMode("score");
              setError(null);
            }}
            disabled={busy}
          >
            The match has already been played — log the result
          </button>
        </>
      )}
    </div>
  );
}
