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
import { useLocation, useNavigate } from "react-router-dom";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { AdminAuthError } from "../api/adminAuth";
import logoMark from "../assets/icons/logo-mark.svg";
import "./AdminLoginPage.css";

interface LocationState {
  from?: string;
}

export default function AdminLoginPage() {
  const { status, login } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      await login(email.trim(), password);
      navigate(from && from !== "/login" ? from : "/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof AdminAuthError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-login">
      <form className="admin-login__card" onSubmit={handleSubmit}>
        <div className="admin-login__brand">
          <img src={logoMark} alt="" className="admin-login__logo" />
          <span className="admin-login__wordmark">Soccernity</span>
        </div>
        <h1 className="admin-login__title">Admin Console</h1>
        <p className="admin-login__subtitle">Sign in with your staff account.</p>

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
