// Create Profile -- INTERIM page (B-125 routing target; the full screen is
// B-081). Figma: Create Profile desktop 1498:2303 / mobile 1629:2449.
//
// WHY THIS EXISTS: the server's onboarding state (`nextStep: create_profile`,
// B-030) sends every account without a username here, on every login, and
// every legacy account without one is inside the incomplete-profile gate
// (B-027). A route that 404s would trap them, so the target has to exist.
//
// WHAT IT DOES: the one field the gate actually needs -- a username -- via the
// existing PATCH /users/:id (EmailVerifiedGuard + GuardianConsentGuard on the
// server, so it is only reachable once verified and, for a minor, approved;
// `nextStep` already guarantees that order).
//
// WHAT IT DELIBERATELY DOES NOT DO (still B-081): profile picture, bio, the
// optional profile Country, Preferred Club, the inline "Please rephrase"
// state, and the full Figma layout. No upload endpoint exists for a picture,
// and bio / Preferred Club have no `User` column (Decision Log #58, #394).
// The server enforces the username rules (reserved words, impersonation,
// personal data, 30-day change cooldown); this page shows its message
// verbatim and never second-guesses it.
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import SignupSplitScreen from "./signup/SignupSplitScreen";
import { lightAuthThemeVars } from "./signup/authThemeVars";
import illustration from "../assets/signup/register-illustration.svg";
import { getUser, updateUser, UsersApiError } from "../api/users";
import { ONBOARDING_ROUTES, routeForNextStep } from "../lib/onboarding";
import { decodeAccessToken, getStoredAccessToken } from "../lib/session";
import "./signup/SignupSplitScreen.css";

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,30}$/;

export default function CreateProfilePage() {
  const navigate = useNavigate();
  const token = getStoredAccessToken();
  const userId = token ? decodeAccessToken(token)?.sub : undefined;

  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Server-driven: only an account whose own state says `create_profile`
  // may use this page. A restricted-pending minor or an unverified account is
  // sent back to where they belong; an already-complete profile moves on.
  useEffect(() => {
    if (!token || !userId) return;
    let cancelled = false;
    getUser(token, userId)
      .then((user) => {
        if (cancelled) return;
        if (user.nextStep !== "create_profile") {
          setRedirectTo(
            user.nextStep === "none" ? ONBOARDING_ROUTES.clubPicker : routeForNextStep(user.nextStep),
          );
        }
      })
      .catch(() => {
        // Leave the form usable; the server still decides on submit.
      });
    return () => {
      cancelled = true;
    };
  }, [token, userId]);

  if (!token || !userId) return <Navigate to="/login" replace />;
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token || !userId) return;
    const trimmed = username.trim();
    if (!USERNAME_PATTERN.test(trimmed)) {
      setError("Username must be 3-30 characters: letters, numbers and underscores only.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await updateUser(token, userId, { username: trimmed });
      navigate(ONBOARDING_ROUTES.clubPicker);
    } catch (err) {
      setError(err instanceof UsersApiError ? err.message : "Couldn't save your username. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SignupSplitScreen
      variant="light"
      themeVars={lightAuthThemeVars}
      rightPanel={<img src={illustration} alt="" className="signup-split__illustration" />}
    >
      <h1 className="signup-split__heading">Create your profile</h1>
      <p className="signup-split__subheading">
        Choose a username. It is the name other people see on Soccernity, instead of your full name.
      </p>

      <form className="signup-form" onSubmit={handleSubmit} noValidate>
        <div className="signup-form__group">
          <label className="signup-form__label" htmlFor="create-profile-username">
            Username
          </label>
          <input
            id="create-profile-username"
            className="signup-form__input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            disabled={submitting}
          />
          <p className="signup-form__hint">3-30 letters, numbers or underscores.</p>
        </div>

        {error && (
          <p className="signup-form-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="signup-button" disabled={submitting}>
          {submitting ? "Saving…" : "Continue"}
        </button>
      </form>
    </SignupSplitScreen>
  );
}
