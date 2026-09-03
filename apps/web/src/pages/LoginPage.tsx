// Login screen -- Sprint 1, PR F2.
//
// Figma source: "Soccernity-MVP" (key weZWWqggy9j13eX8bhFgs6), page
// "Soccernity" (0:1), frame "Login" (node 407:844).
//
// Design-token note (flag for human review): the Figma frame itself uses
// raw hex colours (`#4F46E5` indigo for the primary button/links/focus
// state, `#F3F4F6`/`#4b5563` neutrals) rather than the "Soccernity Theme"
// Figma Variables (packages/shared/src/tokens) that figma-design-system
// produced in Sprint D. Sprint D's own retouch log
// (docs/sprint-d-design-tokens-report.md Section 4) does not list this
// frame among the screens it touched, and indigo isn't a derivation of
// either brand colour -- it would violate CLAUDE.md's "exactly two brand
// colours" rule if carried through as-is. This build therefore keeps the
// frame's layout, copy and structure, but maps the indigo CTA/link colour
// onto the existing `--sn-brand-navy` / `--sn-brand-green` tokens instead
// (navy for the primary button, matching Header's existing Login CTA;
// green for links, matching Header's active-nav-link colour) rather than
// hardcoding a third brand colour. A human should confirm this mapping
// against Sprint D's intent, or send this frame back through
// figma-design-system for a proper retouch pass.
//
// Layout note -- DECISION LOG #172, resolved: this and the three other
// core auth screens (/signup, /forgot-password, /reset-password) do NOT
// render under the full site Header. The founder confirmed they get the
// simple logo-only "Top Bar -- Soccernity" instead -- the same bar the
// Figma Guardian Consent, Verify Email and Club Picker frames already
// draw. The full Header's content-icon nav and logged-in/out auth
// cluster are noise on a pre-session screen, and it duplicated the
// wordmark / showed a "Login" affordance while already on /login. These
// four routes are now children of AuthChrome (src/layout/AuthChrome.tsx),
// not AppShell, in src/app/router.tsx. This screen stays a responsive
// two-column layout that sizes itself against the 90px Top Bar; it does
// not repeat the Top Bar's wordmark.
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AuthApiError, login } from "../api/auth";
import loginHero from "../assets/illustrations/login-hero.svg";
import "./LoginPage.css";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [staySignedIn, setStaySignedIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!email.trim() || !password) {
      setFormError("Enter both your email and password.");
      return;
    }

    setSubmitting(true);
    try {
      // NOT WIRED TO A LIVE ENDPOINT YET -- see src/api/auth.ts. This call
      // is real, but `POST /auth/login` (PR B3) has not merged as of this
      // PR, so it is expected to fail until that lands.
      const result = await login({ email: email.trim(), password });

      // Minimal session handling only -- no AuthContext/route-guarding
      // exists yet in apps/web as of this PR. `staySignedIn` isn't part
      // of the Section 4.1 contract; storage choice (session vs.
      // persistent) is the closest honest approximation of its intent
      // and should be revisited once real session management lands.
      const storage = staySignedIn ? window.localStorage : window.sessionStorage;
      storage.setItem("sn_access_token", result.accessToken);
      storage.setItem("sn_refresh_token", result.refreshToken);

      navigate("/");
    } catch (error) {
      setFormError(
        error instanceof AuthApiError
          ? error.message
          : "Something went wrong signing you in. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="sn-login">
      <div className="sn-login__panel">
        <h1 className="sn-login__title">Welcome Back</h1>
        <p className="sn-login__subtitle">
          Enter your email address and password to log in to Soccernity.
        </p>

        <form className="sn-login__form" onSubmit={handleSubmit} noValidate>
          <div className="sn-login__group">
            <label className="sn-login__label" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="example@website.com"
              className="sn-login__input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <div className="sn-login__group">
            <div className="sn-login__label-row">
              <label className="sn-login__label" htmlFor="login-password">
                Password
              </label>
              <Link className="sn-login__link" to="/forgot-password">
                Forgot Password?
              </Link>
            </div>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••••••••••••••••"
              className="sn-login__input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <label className="sn-login__remember">
            <input
              type="checkbox"
              checked={staySignedIn}
              onChange={(event) => setStaySignedIn(event.target.checked)}
              disabled={submitting}
            />
            Stay signed in.
          </label>

          {formError && (
            <p className="sn-login__error" role="alert">
              {formError}
            </p>
          )}

          <button type="submit" className="sn-login__submit" disabled={submitting}>
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="sn-login__footer">
          Don&rsquo;t have an account? <Link to="/signup">Create one here.</Link>
        </p>
      </div>

      <div className="sn-login__hero" aria-hidden="true">
        <img src={loginHero} alt="" className="sn-login__hero-image" loading="lazy" />
      </div>
    </div>
  );
}
