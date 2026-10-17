// Age Gate -- Figma node 5108:6626 ("Guardian Consent — 1 Age Gate"),
// mobile 5539:7264. First step of signup, reached before Register (Build
// Plan Section 8.3, step 1) -- this is exactly what avoids needing a
// date-of-birth field on Register itself (the gap flagged in PR #5).
//
// B-073 (Decision Log #367, #368, #394 A4): the step now collects the
// date of birth AND the country the registrant lives in ("Date of birth and
// country"). Below the minimum age (Decision Log #19) the step swaps to the
// "Soccernity isn't for you just yet" screen (Figma 5464:7077 / 5539:7314);
// "Back to sign up" CLEARS both the date of birth and the country, so a
// child cannot retry with a different age by editing in place (#394 A4).
import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router";
import SignupSplitScreen from "./SignupSplitScreen";
import DecorativeRings from "./DecorativeRings";
import { darkAuthThemeVars } from "./authThemeVars";
import { parseDateOfBirth } from "./age";
import { COUNTRY_OPTIONS } from "./types";
import type { AgeGateValues } from "./types";
import "./SignupSplitScreen.css";

// Decision Log #8 (Build Plan Section 9) -- resolved as the full under-18
// band, deliberately broader than UK GDPR Article 8's bare floor of 13 (and
// matching Nigeria's NDPA 2023 floor exactly -- Decision Log #10). See
// Build Plan Section 8.3 for the full reasoning.
const MINOR_AGE_THRESHOLD = 18;

// Build Plan Section 8.3, step 1 also says the age gate should "block
// signup outright below the applicable regional minimum age" -- resolved
// by Decision Log #19 (Build Plan Section 9): not a legal-compliance
// floor (neither UK GDPR Article 8 nor Nigeria's NDPA 2023 sets an
// absolute floor below which guardian-consented signup is prohibited),
// but a product/duty-of-care one -- below age 5, a Soccernity profile
// wouldn't correspond to anything real about the child as a grassroots
// player yet (UK grassroots football's own entry point, e.g. The FA's
// mini-soccer pathway, starts around age 5-6), regardless of what a
// guardian consents to. This is a hard block, unconditional on guardian
// consent -- see the age check in handleSubmit below.
const MINIMUM_SIGNUP_AGE = 5;

interface AgeGateStepProps {
  initialValues: AgeGateValues;
  initialCountry?: string;
  // eslint-disable-next-line no-unused-vars -- named params in a function-
  // type signature, not a real function body; base eslint:recommended's
  // no-unused-vars (not @typescript-eslint's) doesn't understand that and
  // misflags them.
  onContinue: (values: AgeGateValues, age: number, isMinor: boolean, country: string) => void;
  // Called when "Back to sign up" is pressed after a below-minimum-age
  // denial, so the parent flow can drop any previously-held DOB/country too.
  onDenialBack?: () => void;
}

function onlyDigits(value: string, maxLength: number): string {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

export default function AgeGateStep({ initialValues, initialCountry = "", onContinue, onDenialBack }: AgeGateStepProps) {
  const [day, setDay] = useState(initialValues.day);
  const [month, setMonth] = useState(initialValues.month);
  const [year, setYear] = useState(initialValues.year);
  const [country, setCountry] = useState(initialCountry);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  function handleDenialBack() {
    setDay("");
    setMonth("");
    setYear("");
    setCountry("");
    setError(null);
    setDenied(false);
    onDenialBack?.();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseDateOfBirth(day, month, year);
    if (!parsed) {
      setError("Enter a valid date of birth.");
      return;
    }
    // Decision Log #19: hard block below age 5, unconditional on
    // guardian consent -- shown as its own screen (Figma 5464:7077).
    if (parsed.age < MINIMUM_SIGNUP_AGE) {
      setError(null);
      setDenied(true);
      return;
    }
    if (!country) {
      setError("Select the country you live in.");
      return;
    }
    setError(null);
    onContinue({ day, month, year }, parsed.age, parsed.age < MINOR_AGE_THRESHOLD, country);
  }

  if (denied) {
    return (
      <SignupSplitScreen
        variant="dark"
        themeVars={darkAuthThemeVars}
        rightPanel={
          <>
            <DecorativeRings className="signup-split__rings" />
            <div className="signup-split__right-copy">
              <h2>Come back when you&rsquo;re older.</h2>
              <p>
                Soccernity accounts start at age {MINIMUM_SIGNUP_AGE}. When you&rsquo;re old enough, a parent or
                guardian can help you sign up and approve your account.
              </p>
            </div>
          </>
        }
      >
        <p className="signup-split__eyebrow">Create your account</p>
        <h1 className="signup-split__heading">Soccernity isn&rsquo;t for you just yet</h1>
        <p className="signup-split__subheading">
          Thanks for your interest. You need to be at least {MINIMUM_SIGNUP_AGE} years old to have a Soccernity
          account.
        </p>

        <div className="signup-form">
          <div className="signup-info-panel">
            <p className="signup-info-panel__title">Why there&rsquo;s an age limit</p>
            <p className="signup-info-panel__body">
              Soccernity is built around real grassroots football. In the UK, youth football starts at around age
              5&ndash;6. Below that, a profile wouldn&rsquo;t reflect anything about you as a player yet &mdash; so we
              keep signups closed until then, no matter what a parent or guardian agrees to.
            </p>
          </div>

          <button type="button" className="signup-button signup-button--navy" onClick={handleDenialBack}>
            Back to sign up
          </button>
        </div>

        <p className="signup-split__footer">
          Already have an account? <Link to="/login">Log in.</Link>
        </p>
      </SignupSplitScreen>
    );
  }

  return (
    <SignupSplitScreen
      variant="dark"
      themeVars={darkAuthThemeVars}
      rightPanel={
        <>
          <DecorativeRings className="signup-split__rings" />
          <div className="signup-split__right-copy">
            <h2>Built for players of every age.</h2>
            <p>
              Under-18 accounts get extra protection switched on by default — and a parent or guardian has to
              approve them before they go live.
            </p>
          </div>
        </>
      }
    >
      <p className="signup-split__eyebrow">Create your account</p>
      {/* Heading and subheading are tagged [COPY PENDING LEGAL REVIEW] in
          Figma (chip 6669:27179) -- implemented as drawn, pending counsel. */}
      <h1 className="signup-split__heading">Date of birth and country</h1>
      <p className="signup-split__subheading">
        We ask everyone this when they join. Your date of birth is never shown on your profile.
      </p>

      <form className="signup-form" onSubmit={handleSubmit} noValidate>
        <div className="signup-form__group">
          <span className="signup-form__label" id="age-gate-dob-label">
            Date of birth
          </span>
          <div className="signup-form__row" role="group" aria-labelledby="age-gate-dob-label">
            <input
              className="signup-form__input"
              inputMode="numeric"
              placeholder="DD"
              maxLength={2}
              value={day}
              onChange={(event) => setDay(onlyDigits(event.target.value, 2))}
              aria-label="Day of birth"
            />
            <input
              className="signup-form__input"
              inputMode="numeric"
              placeholder="MM"
              maxLength={2}
              value={month}
              onChange={(event) => setMonth(onlyDigits(event.target.value, 2))}
              aria-label="Month of birth"
            />
            <input
              className="signup-form__input"
              inputMode="numeric"
              placeholder="YYYY"
              maxLength={4}
              value={year}
              onChange={(event) => setYear(onlyDigits(event.target.value, 4))}
              aria-label="Year of birth"
            />
          </div>
          <p className="signup-form__hint">For example: 04 / 09 / 2011</p>
        </div>

        <div className="signup-form__group">
          <label className="signup-form__label" htmlFor="age-gate-country">
            Country you live in
          </label>
          <select
            id="age-gate-country"
            className="signup-form__select"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
          >
            <option value="" disabled>
              Select country
            </option>
            {COUNTRY_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="signup-form__hint">
            Some countries ask for an extra check when a guardian approves an account for a younger child.
          </p>
          {error && (
            <p className="signup-form-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="signup-info-panel">
          <p className="signup-info-panel__title">Why we ask</p>
          <p className="signup-info-panel__body">
            If you are under 18, we will ask a parent or guardian to approve your account before it goes live.
            Nothing you post is public until they do.
          </p>
        </div>

        <button type="submit" className="signup-button">
          Continue
        </button>
      </form>

      <p className="signup-split__footer">
        Already have an account? <Link to="/login">Log in.</Link>
      </p>
    </SignupSplitScreen>
  );
}
