// Grassroots — Register your team. Figma source: "Grassroots — 1 Register
// Team — Desktop" (6367:16407) → "Grassroots — 2 Team Registered —
// Desktop" (6368:16495) and their mobile pairs, "Soccernity-MVP"
// (weZWWqggy9j13eX8bhFgs6), from sprint-5/grassroots-record-keeping-screens
// (Decision Log #253). Route: /grassroots/register.
//
// Real data (Build Plan Section 4.5): POST /teams — { name, city,
// leagueType } (api/grassroots.ts). `createdById` is the caller (server-
// set); `verified` defaults false and is not user-settable.
//
// Frame 1 (the form) and frame 2 (the confirmation) are one route with an
// internal step — same pattern as DeactivateAccountPage's intro→confirm.
//
// POST /teams is JwtAuthGuard + GuardianConsentGuard: a restricted-
// pending minor gets a 403, surfaced with a link to /guardian-consent
// (isAwaitingConsent). No-session → a "log in" prompt, the API never
// called.
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  createTeam,
  leagueTypeLabel,
  GrassrootsApiError,
  type GrassrootsLeagueType,
  type GrassrootsTeam,
} from "../api/grassroots";
import { getStoredAccessToken } from "../lib/session";
import { isAwaitingConsent } from "./grassroots/errors";
import "./grassroots/GrassrootsPage.css";

const TYPE_OPTIONS: { value: GrassrootsLeagueType; label: string }[] = [
  { value: "informal", label: "Informal" },
  { value: "school", label: "School" },
  { value: "academy", label: "Academy" },
];

export default function GrassrootsRegisterTeamPage() {
  const token = getStoredAccessToken();

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [leagueType, setLeagueType] = useState<GrassrootsLeagueType>("informal");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConsent, setAwaitingConsent] = useState(false);
  const [registered, setRegistered] = useState<GrassrootsTeam | null>(null);

  if (!token) {
    return (
      <div className="grassroots-status" role="status">
        Log in to register a team. <Link to="/login">Log in</Link>
      </div>
    );
  }

  const canSubmit = name.trim().length >= 2 && city.trim().length >= 2 && !submitting;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    setAwaitingConsent(false);
    try {
      const team = await createTeam(token, { name: name.trim(), city: city.trim(), leagueType });
      setRegistered(team);
    } catch (err) {
      if (isAwaitingConsent(err)) {
        setAwaitingConsent(true);
      } else {
        setError(err instanceof GrassrootsApiError ? err.message : "Couldn't register that team.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // --- Frame 2: confirmation ------------------------------------------
  if (registered) {
    return (
      <div className="grassroots-success">
        <span className="grassroots-success__disc" aria-hidden="true">
          ✓
        </span>
        <div className="grassroots-form__header">
          <h1 className="grassroots-form__title">Team registered</h1>
          <p className="grassroots-form__lede">
            {registered.name} is live on Soccernity. Schedule your first fixture whenever you&rsquo;re
            ready.
          </p>
        </div>
        <div className="grassroots-teamchip">
          <span className="grassroots-card__monogram" aria-hidden="true">
            {registered.name.trim()[0]?.toUpperCase() ?? "?"}
          </span>
          <span className="grassroots-card__info">
            <span className="grassroots-card__name">{registered.name}</span>
            <span className="grassroots-card__meta">
              {registered.city}  •  {leagueTypeLabel(registered.leagueType)}
            </span>
            <span className="grassroots-badge grassroots-badge--unverified">COMMUNITY TEAM · UNVERIFIED</span>
          </span>
        </div>
        <Link to={`/grassroots/${registered.id}/fixtures/new`} className="grassroots-btn grassroots-btn--primary">
          Schedule a fixture
        </Link>
        <Link to={`/grassroots/${registered.id}`} className="grassroots-btn grassroots-btn--secondary">
          View team page
        </Link>
      </div>
    );
  }

  // --- Frame 1: the form --------------------------------------------
  return (
    <form className="grassroots-form" onSubmit={submit}>
      <div className="grassroots-form__header">
        <p className="grassroots-form__eyebrow">GRASSROOTS</p>
        <h1 className="grassroots-form__title">Register your team</h1>
        <p className="grassroots-form__lede">
          Add an informal, school or academy team so you can schedule fixtures and log results yourself.
          Your team gets a public page anyone can view.
        </p>
      </div>

      <div className="grassroots-form__card">
        <div className="grassroots-field">
          <label className="grassroots-field__label" htmlFor="gr-team-name">
            Team name
          </label>
          <input
            id="gr-team-name"
            className="grassroots-field__input"
            type="text"
            placeholder="e.g. Surulere United"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
          <p className="grassroots-field__hint">Shown on your public team page.</p>
        </div>

        <div className="grassroots-field">
          <label className="grassroots-field__label" htmlFor="gr-team-city">
            City
          </label>
          <input
            id="gr-team-city"
            className="grassroots-field__input"
            type="text"
            placeholder="e.g. Lagos"
            value={city}
            maxLength={120}
            onChange={(e) => setCity(e.target.value)}
          />
          <p className="grassroots-field__hint">Lets people nearby find your team by city.</p>
        </div>

        <div className="grassroots-field">
          <span className="grassroots-field__label">Team type</span>
          <div className="grassroots-segmented" role="radiogroup" aria-label="Team type">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={leagueType === opt.value}
                className={
                  leagueType === opt.value
                    ? "grassroots-segmented__option grassroots-segmented__option--selected"
                    : "grassroots-segmented__option"
                }
                onClick={() => setLeagueType(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grassroots-callout">
        <p className="grassroots-callout__title">This is a community team, not a licensed club</p>
        <p className="grassroots-callout__body">
          Grassroots teams are self-registered and start unverified. A Verified badge appears only once
          Soccernity confirms the team — you cannot set it here.
        </p>
      </div>

      {awaitingConsent && (
        <p className="grassroots-form__error" role="alert">
          Your account is awaiting guardian consent, so you can&rsquo;t register a team yet.{" "}
          <Link to="/guardian-consent">Check your consent status</Link>.
        </p>
      )}
      {error && (
        <p className="grassroots-form__error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="grassroots-btn grassroots-btn--primary" disabled={!canSubmit}>
        {submitting ? "Registering…" : "Register team"}
      </button>

      <Link to="/grassroots" className="grassroots-linkback">
        Back
      </Link>
    </form>
  );
}
