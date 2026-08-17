// Register -- Figma node 407:1051 ("Register"), the pre-existing screen
// this PR's brief says not to modify. Reached by both branches: directly
// from the Age Gate for 18+ users, or after Guardian Details Capture for
// under-18 users (Build Plan Section 8.3 step 2 -- guardian details are
// captured "before account creation completes", and account creation is
// this screen). No date-of-birth field here by design -- Age Gate already
// collected it (the gap flagged in PR #5).
import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import SignupSplitScreen from "./SignupSplitScreen";
import { lightAuthThemeVars } from "./authThemeVars";
import { toIsoDate } from "./age";
import { registerUser, AuthApiError } from "../../api/auth";
import type { RegisterRequest } from "../../api/auth";
import illustration from "../../assets/signup/register-illustration.svg";
import type { AgeGateValues, GuardianDetailsValues } from "./types";
import "./SignupSplitScreen.css";

interface RegisterStepProps {
  dob: AgeGateValues;
  isMinor: boolean;
  guardianDetails: GuardianDetailsValues | null;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function RegisterStep({ dob, isMinor, guardianDetails }: RegisterStepProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ isMinor: boolean; guardianEmail?: string } | null>(null);

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
      ...(isMinor && guardianDetails
        ? {
            guardian: {
              name: `${guardianDetails.firstName.trim()} ${guardianDetails.lastName.trim()}`,
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
      await registerUser(payload);
      setSuccess({ isMinor, guardianEmail: guardianDetails?.email });
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const rightPanel = <img src={illustration} alt="" className="signup-split__illustration" />;

  if (success) {
    return (
      <SignupSplitScreen variant="light" themeVars={lightAuthThemeVars} rightPanel={rightPanel}>
        <div className="signup-success">
          <h1 className="signup-split__heading">Account created</h1>
          {success.isMinor ? (
            <p className="signup-success__body">
              We&rsquo;ve emailed {success.guardianEmail} to ask them to approve your account. Until they approve,
              your profile stays private and some features are limited (Build Plan Section 8.3, restricted-pending
              state).
            </p>
          ) : (
            <p className="signup-success__body">Welcome to Soccernity.</p>
          )}
          <Link to="/" className="signup-split__footer">
            Continue to Soccernity
          </Link>
        </div>
      </SignupSplitScreen>
    );
  }

  return (
    <SignupSplitScreen variant="light" themeVars={lightAuthThemeVars} rightPanel={rightPanel}>
      <h1 className="signup-split__heading">Register</h1>
      <p className="signup-split__subheading">Sign up to Soccernity.</p>

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

        {error && (
          <p className="signup-form-error" role="alert">
            {error}
          </p>
        )}

        {/* Terms/Privacy Policy are plain text, not links -- no /terms or
            /privacy route exists anywhere in this app yet, and inventing
            one is out of this PR's scope. */}
        <p className="signup-form__fineprint">
          By creating an account, you agree to our <span className="signup-form__accent-text">Terms</span> and have
          read and acknowledge the <span className="signup-form__accent-text">Privacy Policy</span>.
        </p>

        <button type="submit" className="signup-button" disabled={submitting}>
          {submitting ? "Creating account…" : "Register"}
        </button>
      </form>

      <p className="signup-split__footer">
        Already have an account? <Link to="/login">Log in.</Link>
      </p>
    </SignupSplitScreen>
  );
}
