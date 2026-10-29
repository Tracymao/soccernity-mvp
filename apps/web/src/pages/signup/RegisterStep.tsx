// Register -- Figma node 407:1051 ("Register"), the pre-existing screen
// this PR's brief says not to modify. Reached by both branches: directly
// from the Age Gate for 18+ users, or after Guardian Details Capture for
// under-18 users (Build Plan Section 8.3 step 2 -- guardian details are
// captured "before account creation completes", and account creation is
// this screen). The date of birth is NOT editable here (Decision Log #367,
// B-074): Age Gate collected it, and Register shows it as a read-only value
// (Figma 407:1051 "Date of Birth" row) with no date picker. The country the
// Age Gate collected is sent for every signup. No Apple button: social
// sign-in (Google / Facebook, Figma 5418:7097) arrives with the oauth_login
// work (build register W10) and is not built here.
//
// B-125: after a successful registration this routes on the server's
// `nextStep` (restricted_pending / verify_email / create_profile / none); it
// no longer renders the Club Picker inline (see handleSubmit).
//
// B-017 / B-246: a successful registration starts the session (the access token
// goes into memory; the API sets the refresh token as an httpOnly session cookie,
// like an un-ticked "Stay signed in" login) so the shell Header and every later
// request are authenticated, and the silent refresh (lib/silentRefresh.ts) keeps
// it alive.
import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import SignupSplitScreen from "./SignupSplitScreen";
import { lightAuthThemeVars } from "./authThemeVars";
import { toIsoDate } from "./age";
import { storeSession } from "../../lib/session";
import { registerUser, AuthApiError } from "../../api/auth";
import type { RegisterRequest } from "../../api/auth";
import { routeForNextStep } from "../../lib/onboarding";
import illustration from "../../assets/signup/register-illustration.svg";
import type { AgeGateValues, GuardianDetailsValues } from "./types";
import "./SignupSplitScreen.css";

interface RegisterStepProps {
  dob: AgeGateValues;
  country: string;
  isMinor: boolean;
  guardianDetails: GuardianDetailsValues | null;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function RegisterStep({ dob, country, isMinor, guardianDetails }: RegisterStepProps) {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!firstName.trim() || !lastName.trim()) {
      setError("Enter your full name.");
      return;
    }
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    const payload: RegisterRequest = {
      email: email.trim(),
      password,
      displayName: `${firstName.trim()} ${lastName.trim()}`,
      dateOfBirth: toIsoDate(dob),
      // Self-declared at the Age Gate, sent for every registrant (B-073).
      countryCode: country,
      ...(isMinor && guardianDetails
        ? {
            guardian: {
              name: guardianDetails.name.trim(),
              email: guardianDetails.email.trim(),
              // Non-empty, validated on GuardianDetailsStep before this
              // step is reachable at all.
              relationship: guardianDetails.relationship as Exclude<
                GuardianDetailsValues["relationship"],
                ""
              >,
            },
          }
        : {}),
    };

    setError(null);
    setSubmitting(true);
    try {
      const result = await registerUser(payload);
      storeSession(result);
      // B-125 (Decision Log #367, #394 A6): the server decides what comes
      // next. A minor goes to the Restricted Pending page (it names the
      // guardian email the request went to); an adult goes to the
      // verify-email prompt, then Create Profile, then the Club Picker. The
      // Club Picker is no longer shown inline here: it comes after Create
      // Profile, and joining a club needs a verified email (B-118) and, for a
      // minor, guardian approval (B-026) -- neither is true at this point.
      navigate(routeForNextStep(result.user.nextStep));
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const rightPanel = <img src={illustration} alt="" className="signup-split__illustration" />;

  return (
    <SignupSplitScreen variant="light" themeVars={lightAuthThemeVars} rightPanel={rightPanel}>
      <h1 className="signup-split__heading">Register</h1>
      <p className="signup-split__subheading">Create your Soccernity account.</p>

      <form className="signup-form" onSubmit={handleSubmit} noValidate>
        <div className="signup-form__group">
          <span className="signup-form__label" id="register-name-label">
            Full Name
          </span>
          <div className="signup-form__row" role="group" aria-labelledby="register-name-label">
            <input
              className="signup-form__input"
              placeholder="First Name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              aria-label="First name"
              autoComplete="given-name"
            />
            <input
              className="signup-form__input"
              placeholder="Last Name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              aria-label="Last name"
              autoComplete="family-name"
            />
          </div>
        </div>

        <div className="signup-form__group">
          <label className="signup-form__label" htmlFor="register-email">
            Email
          </label>
          <input
            id="register-email"
            className="signup-form__input"
            type="email"
            placeholder="example@website.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
        </div>

        <div className="signup-form__group">
          <label className="signup-form__label" htmlFor="register-password">
            Password
          </label>
          <input
            id="register-password"
            className="signup-form__input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
        </div>

        <div className="signup-form__group">
          <label className="signup-form__label" htmlFor="register-dob">
            Date of Birth
          </label>
          <input
            id="register-dob"
            className="signup-form__input"
            value={`${dob.day.padStart(2, "0")} / ${dob.month.padStart(2, "0")} / ${dob.year}`}
            readOnly
            aria-readonly="true"
          />
          {/* Tagged [COPY PENDING LEGAL REVIEW] in Figma (6627:22258) --
              implemented as drawn, pending counsel. */}
          <p className="signup-form__hint">
            Set when you signed up and cannot be changed here. [COPY PENDING LEGAL REVIEW]
          </p>
        </div>

        {error && (
          <p className="signup-form-error" role="alert">
            {error}
          </p>
        )}

        {/* /terms and /privacy render the draft legal copy (with its own
            "not approved" banner). Open in a new tab so the form isn't lost. */}
        <p className="signup-form__fineprint">
          By creating an account, you agree to our <a className="signup-form__accent-text" href="/terms" target="_blank" rel="noopener noreferrer">Terms</a> and have
          read and acknowledge the <a className="signup-form__accent-text" href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
        </p>

        <button type="submit" className="signup-button" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="signup-split__footer">
        Already have an account? <Link to="/login">Log in.</Link>
      </p>
    </SignupSplitScreen>
  );
}
