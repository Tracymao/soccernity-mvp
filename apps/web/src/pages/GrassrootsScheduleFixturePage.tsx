// Grassroots — Schedule a fixture. Figma source: "Grassroots — 3 Schedule
// Fixture — Desktop" (6369:16675), "— 4 Schedule Fixture (Opponent TBD) —
// Desktop" (6371:16908) and "— 5 Fixture Scheduled — Desktop"
// (6368:16610) + mobile pairs, "Soccernity-MVP" (weZWWqggy9j13eX8bhFgs6),
// from sprint-5/grassroots-record-keeping-screens (Decision Log #253) +
// sprint-5/grassroots-opponent-name-design (Decision Log #261).
// Route: /grassroots/:teamId/fixtures/new (team-scoped — teamAId = :teamId).
//
// Real data (Build Plan Section 4.5): GET /teams/:id (context) + POST
// /fixtures (api/grassroots.ts). The away side is exactly one of:
//   - a registered Soccernity team  → teamBId
//   - a team not on Soccernity      → opponentName (free text, #260/#261)
//   - decide later                  → neither
// Supplying both teamBId and opponentName is a 400 (grassroots.service.ts);
// the 3-way choice here makes that unreachable.
//
// scheduledAt is ONE ISO DateTime. The Figma reuses the shared "Calendar
// for scheduled task" component (date-only), but that component has no
// React equivalent in this app — native <input type="date"> + <input
// type="time"> are the honest equivalent, combined client-side. Flagged
// in this PR's report.
//
// POST /fixtures is JwtAuthGuard + GuardianConsentGuard, and the caller
// must be teamA's organiser (else 403 — Decision Log #255). We
// client-side guard on team.createdById === the token's `sub` so a
// non-organiser sees a clear message instead of a dead form; the server
// still enforces it.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import {
  getTeamById,
  listTeams,
  createFixture,
  leagueTypeLabel,
  GrassrootsApiError,
  type Fixture,
  type GrassrootsTeam,
} from "../api/grassroots";
import { getStoredAccessToken, decodeAccessToken } from "../lib/session";
import { isAwaitingConsent } from "./grassroots/errors";
import "./grassroots/GrassrootsPage.css";

type LoadState = "loading" | "loaded" | "error" | "not-found" | "no-session" | "not-organiser";
type OpponentMode = "registered" | "other" | "later";

function monogramFor(name: string): string {
  return name.trim()[0]?.toUpperCase() ?? "?";
}

export default function GrassrootsScheduleFixturePage() {
  const { teamId } = useParams<{ teamId: string }>();
  const token = getStoredAccessToken();
  const myId = token ? decodeAccessToken(token)?.sub : null;

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [team, setTeam] = useState<GrassrootsTeam | null>(null);

  const [oppMode, setOppMode] = useState<OpponentMode>("registered");
  const [oppCity, setOppCity] = useState("");
  const [oppResults, setOppResults] = useState<GrassrootsTeam[]>([]);
  const [oppSearching, setOppSearching] = useState(false);
  const [selectedOpp, setSelectedOpp] = useState<GrassrootsTeam | null>(null);
  const [opponentName, setOpponentName] = useState("");

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [venue, setVenue] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConsent, setAwaitingConsent] = useState(false);
  const [scheduled, setScheduled] = useState<Fixture | null>(null);

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
    try {
      const t = await getTeamById(token, teamId);
      setTeam(t);
      setLoadState(myId && t.createdById === myId ? "loaded" : "not-organiser");
    } catch (err) {
      setLoadState(err instanceof GrassrootsApiError && err.status === 404 ? "not-found" : "error");
    }
  }, [token, teamId, myId]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounced opponent search by city (GET /teams?city=), excluding this team.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (oppMode !== "registered" || !token || oppCity.trim().length < 2) {
      setOppResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setOppSearching(true);
      try {
        const page = await listTeams(token, { city: oppCity.trim() });
        setOppResults(page.items.filter((t) => t.id !== teamId));
      } catch {
        setOppResults([]);
      } finally {
        setOppSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [oppCity, oppMode, token, teamId]);

  const canSubmit =
    loadState === "loaded" &&
    date !== "" &&
    time !== "" &&
    !submitting &&
    (oppMode !== "other" || opponentName.trim().length > 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token || !teamId || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    setAwaitingConsent(false);

    const scheduledAt = new Date(`${date}T${time}`);
    if (Number.isNaN(scheduledAt.getTime())) {
      setError("That date and time don't look right.");
      setSubmitting(false);
      return;
    }

    try {
      const fixture = await createFixture(token, {
        teamAId: teamId,
        ...(oppMode === "registered" && selectedOpp ? { teamBId: selectedOpp.id } : {}),
        ...(oppMode === "other" ? { opponentName: opponentName.trim() } : {}),
        scheduledAt: scheduledAt.toISOString(),
        ...(venue.trim() ? { venue: venue.trim() } : {}),
      });
      setScheduled(fixture);
    } catch (err) {
      if (isAwaitingConsent(err)) {
        setAwaitingConsent(true);
      } else {
        setError(err instanceof GrassrootsApiError ? err.message : "Couldn't schedule that fixture.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loadState === "no-session") {
    return (
      <div className="grassroots-status" role="status">
        Log in to schedule a fixture. <Link to="/login">Log in</Link>
      </div>
    );
  }

  if (loadState === "loading") {
    return (
      <div className="grassroots-status" role="status">
        Loading…
      </div>
    );
  }

  if (loadState === "not-found") {
    return (
      <div className="grassroots-form">
        <p className="grassroots-status" role="status">
          Team not found. <Link to="/grassroots">Back to all teams</Link>
        </p>
      </div>
    );
  }

  if (loadState === "error" || !team) {
    return (
      <div className="grassroots-form">
        <p className="grassroots-status grassroots-status--error" role="alert">
          Couldn&rsquo;t load that team. Please try again shortly.
        </p>
      </div>
    );
  }

  if (loadState === "not-organiser") {
    return (
      <div className="grassroots-form">
        <p className="grassroots-status" role="status">
          You can only schedule fixtures for a team you registered.{" "}
          <Link to={`/grassroots/${team.id}`}>Back to {team.name}</Link>
        </p>
      </div>
    );
  }

  // --- Frame 5: confirmation ---------------------------------------
  if (scheduled) {
    const oppLabel =
      scheduled.teamB?.name ?? scheduled.opponentName ?? "an opponent to be confirmed";
    return (
      <div className="grassroots-success">
        <span className="grassroots-success__disc" aria-hidden="true">
          ✓
        </span>
        <div className="grassroots-form__header">
          <h1 className="grassroots-form__title">Fixture scheduled</h1>
          <p className="grassroots-form__lede">
            {team.name} vs {oppLabel} is on your team page. Come back to start the match and log the
            result once it&rsquo;s played.
          </p>
        </div>
        <Link
          to={`/grassroots/fixtures/${scheduled.id}`}
          className="grassroots-btn grassroots-btn--primary"
        >
          Manage this fixture
        </Link>
        <Link to={`/grassroots/${team.id}`} className="grassroots-btn grassroots-btn--secondary">
          Back to team page
        </Link>
      </div>
    );
  }

  // --- Frames 3 / 4: the form -------------------------------------
  return (
    <form className="grassroots-form" onSubmit={submit}>
      <div className="grassroots-form__header">
        <p className="grassroots-form__eyebrow">GRASSROOTS</p>
        <h1 className="grassroots-form__title">Schedule a fixture</h1>
        <p className="grassroots-form__lede">
          Set the date, time and opponent. You can log the result yourself once the match is played.
        </p>
      </div>

      <div className="grassroots-form__card">
        <div className="grassroots-field">
          <span className="grassroots-field__label">Your team</span>
          <div className="grassroots-teamchip">
            <span className="grassroots-card__monogram" aria-hidden="true">
              {monogramFor(team.name)}
            </span>
            <span className="grassroots-card__info">
              <span className="grassroots-card__name">{team.name}</span>
              <span className="grassroots-card__meta">
                {team.city}  •  {leagueTypeLabel(team.leagueType)}
              </span>
            </span>
          </div>
        </div>

        <div className="grassroots-field">
          <span className="grassroots-field__label">Opponent</span>
          <div className="grassroots-segmented" role="radiogroup" aria-label="Opponent type">
            {(
              [
                ["registered", "Registered team"],
                ["other", "Other team"],
                ["later", "Decide later"],
              ] as [OpponentMode, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={oppMode === value}
                className={
                  oppMode === value
                    ? "grassroots-segmented__option grassroots-segmented__option--selected"
                    : "grassroots-segmented__option"
                }
                onClick={() => {
                  setOppMode(value);
                  setError(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {oppMode === "registered" && (
            <div className="grassroots-picker">
              {selectedOpp ? (
                <div className="grassroots-teamchip">
                  <span className="grassroots-card__monogram" aria-hidden="true">
                    {monogramFor(selectedOpp.name)}
                  </span>
                  <span className="grassroots-card__info">
                    <span className="grassroots-card__name">{selectedOpp.name}</span>
                    <span className="grassroots-card__meta">
                      {selectedOpp.city}  •  {leagueTypeLabel(selectedOpp.leagueType)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="grassroots-linkback"
                    onClick={() => setSelectedOpp(null)}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <input
                    className="grassroots-field__input"
                    type="search"
                    placeholder="Search registered teams by city"
                    aria-label="Search registered teams by city"
                    value={oppCity}
                    onChange={(e) => setOppCity(e.target.value)}
                  />
                  {oppSearching && <p className="grassroots-field__hint">Searching…</p>}
                  {!oppSearching && oppCity.trim().length >= 2 && oppResults.length === 0 && (
                    <p className="grassroots-field__hint">No registered teams found in that city.</p>
                  )}
                  {oppResults.length > 0 && (
                    <ul className="grassroots-picker__results">
                      {oppResults.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            className="grassroots-picker__row"
                            onClick={() => setSelectedOpp(t)}
                          >
                            <span className="grassroots-card__monogram" aria-hidden="true">
                              {monogramFor(t.name)}
                            </span>
                            <span className="grassroots-card__info">
                              <span className="grassroots-card__name">{t.name}</span>
                              <span className="grassroots-card__meta">
                                {t.city}  •  {leagueTypeLabel(t.leagueType)}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              <p className="grassroots-field__hint">
                Only teams already registered on Soccernity. There is no team-name search — filter by
                city.
              </p>
            </div>
          )}

          {oppMode === "other" && (
            <>
              <input
                className="grassroots-field__input"
                type="text"
                placeholder="e.g. Riverside FC"
                aria-label="Opponent name"
                value={opponentName}
                maxLength={120}
                onChange={(e) => setOpponentName(e.target.value)}
              />
              <p className="grassroots-field__hint">
                A team that isn&rsquo;t on Soccernity. Shown by name on your team page, without a crest.
              </p>
            </>
          )}

          {oppMode === "later" && (
            <p className="grassroots-field__hint">
              The fixture shows as &ldquo;Opponent TBC&rdquo; on your team page until you add one.
            </p>
          )}
        </div>

        <div className="grassroots-field">
          <label className="grassroots-field__label" htmlFor="gr-fx-date">
            Match date
          </label>
          <input
            id="gr-fx-date"
            className="grassroots-field__input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="grassroots-field">
          <label className="grassroots-field__label" htmlFor="gr-fx-time">
            Kick-off time
          </label>
          <input
            id="gr-fx-time"
            className="grassroots-field__input"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>

        <div className="grassroots-field">
          <label className="grassroots-field__label" htmlFor="gr-fx-venue">
            Venue (optional)
          </label>
          <input
            id="gr-fx-venue"
            className="grassroots-field__input"
            type="text"
            placeholder="e.g. Teslim Balogun Stadium"
            value={venue}
            maxLength={200}
            onChange={(e) => setVenue(e.target.value)}
          />
        </div>
      </div>

      {awaitingConsent && (
        <p className="grassroots-form__error" role="alert">
          Your account is awaiting guardian consent, so you can&rsquo;t schedule a fixture yet.{" "}
          <Link to="/guardian-consent">Check your consent status</Link>.
        </p>
      )}
      {error && (
        <p className="grassroots-form__error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="grassroots-btn grassroots-btn--primary" disabled={!canSubmit}>
        {submitting ? "Scheduling…" : "Schedule fixture"}
      </button>

      <Link to={`/grassroots/${team.id}`} className="grassroots-linkback">
        Cancel
      </Link>
    </form>
  );
}
