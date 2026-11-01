// Admin Console sign-in.
//
// NO FIGMA SOURCE: none of the 29 designed Admin Panel screens is a login
// screen — they all assume an authenticated session. This screen is built
// plain and on-brand, the same "no dedicated Figma frame exists, built
// plainly and flagged" precedent apps/web used for ClubPickerStep and the
// Edit Profile "Manage Account" panel. Decision Log candidate raised in
// this PR.
//
// Auth path: the isolated AdminUser login (POST /admin/auth/login,
// Decision Log #54) via AdminAuthContext.login — never apps/web's
// user-facing token/session code.
import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { AdminAuthError } from "../api/adminAuth";
import type { AdminAuthResult } from "../api/adminAuth";
import logoMark from "../assets/icons/logo-mark.svg";
import TwoFactorSignIn, { type SignInStep } from "./two-factor/TwoFactorSignIn";
import { NOTICE_BODY, NOTICE_TITLE } from "./two-factor/twoFactorCopy";
import "./AdminLoginPage.css";
import "./two-factor/twoFactor.css";

interface LocationState {
  from?: string;
}

export default function AdminLoginPage() {
  const { status, login, adoptSession, signedOutReason } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // B-271: after the password step, a second screen (code prompt or enrolment) until a session exists.
  // The token it carries is held here, in memory, and nowhere else.
  const [step, setStep] = useState<SignInStep | null>(null);

  const destination = from && from !== "/login" ? from : "/dashboard";

  const handleSignedIn = (result: AdminAuthResult) => {
    adoptSession(result);
    navigate(destination, { replace: true });
  };

  // Already signed in (e.g. navigated to /login with a live session) —
  // bounce to the console.
  useEffect(() => {
    if (status === "authenticated") {
      navigate(from && from !== "/login" ? from : "/dashboard", { replace: true });
    }
  }, [status, from, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const outcome = await login(email.trim(), password);
      if (outcome && outcome.kind === "challenge") {
        setPassword("");
        setStep({ kind: "challenge", challengeToken: outcome.challengeToken });
        setSubmitting(false);
        return;
      }
      if (outcome && outcome.kind === "enrolment") {
        setPassword("");
        setStep({ kind: "enrolment", enrolmentToken: outcome.enrolmentToken });
        setSubmitting(false);
        return;
      }
      navigate(destination, { replace: true });
    } catch (err) {
      if (err instanceof AdminAuthError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
      setSubmitting(false);
    }
  };

  if (step) {
    return (
      <div className="admin-login">
        <TwoFactorSignIn step={step} onBack={() => setStep(null)} onSignedIn={handleSignedIn} />
      </div>
    );
  }

  return (
    <div className="admin-login">
      <form className="admin-login__card" onSubmit={handleSubmit}>
        <div className="admin-login__brand">
          <img src={logoMark} alt="" className="admin-login__logo" />
          <span className="admin-login__wordmark">Soccernity</span>
        </div>
        <h1 className="admin-login__title">Admin Console</h1>
        <p className="admin-login__subtitle">Sign in with your staff account.</p>

        {signedOutReason === "two-factor-enrolment-required" ? (
          <div className="tf-banner tf-banner--alert" role="status">
            <span className="tf-banner__bar" aria-hidden />
            <div>
              <p className="tf-banner__title">{NOTICE_TITLE}</p>
              <p className="tf-banner__body">{NOTICE_BODY}</p>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="admin-login__error" role="alert">
            {error}
          </p>
        ) : null}

        <label className="admin-login__field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="admin-login__field">
          <span>Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <button type="submit" className="admin-login__submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
