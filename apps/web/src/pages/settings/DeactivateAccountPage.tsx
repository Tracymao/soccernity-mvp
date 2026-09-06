// Settings — Deactivate Account flow. Figma:
//   "Settings — Deactivate Account (Intro)"   2924:7358 / mobile 5695:8262
//   "Settings — Deactivate Account (Confirm)" 6213:15640 / mobile 6213:15617
// "Soccernity-MVP" (weZWWqggy9j13eX8bhFgs6). Route: /settings/deactivate.
// Decision Log #220 (design) / #221 (backend). Built by
// sprint-2/account-deactivation-to-code.
//
// The two Figma frames are one route with an internal step ("intro" ->
// "confirm"); the arrow-back / Continue between them is reproduced as a
// "Back to settings" link + a "Continue" button. The Figma "Settings" nav
// rail + profile sidebar are NOT reproduced, the same call
// PrivacySettingsPage.tsx made.
//
// FOUNDER-CONFIRMED FLOW (Decision Log #220): deactivation is
// INDEFINITE. It has no timer -- the account stays hidden until the
// person reactivates, or separately chooses delete. Only the delete
// choice starts the 30-day grace clock. The copy here reflects that
// exactly (the earlier Figma "up to 30 days after deactivation" wording
// was a bug K1 corrected).
//
// POST /auth/deactivate-account (JwtAuthGuard-only) requires the current
// password and revokes every session on success (AuthService
// .deactivateAccount). So on success the stored token is already dead:
// clearStoredSession() runs immediately, then the page redirects to
// /login after a short read-the-message delay -- the same shape
// EditProfileModal.tsx's own inline "Manage Account" panel already uses
// (that panel is a separate, older entry point to this same endpoint and
// is left in place).
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { AuthApiError, deactivateAccount } from "../../api/auth";
import { getStoredAccessToken, clearStoredSession } from "../../lib/session";
import "../account/accountActions.css";

// Matches EditProfileModal.tsx's own POST_ACTION_REDIRECT_DELAY_MS -- long
// enough to read a one-line confirmation, short enough not to feel stuck.
// No shared toast/timed-banner convention exists in this app to reuse.
const REDIRECT_DELAY_MS = 2500;

type Step = "intro" | "confirm";

export default function DeactivateAccountPage() {
  const navigate = useNavigate();
  const token = getStoredAccessToken();

  const [step, setStep] = useState<Step>("intro");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => navigate("/login"), REDIRECT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [done, navigate]);

  // `done` is checked BEFORE the session guard: a successful deactivation
  // clears the stored token (below), so `token` is null by the time this
  // success view renders.
  if (done) {
    return (
      <div className="acct-flow">
        <p className="acct-success" role="status">
          Your account has been deactivated. Sign back in any time to reactivate it — there&rsquo;s no
          time limit. Taking you to the login page…
        </p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="acct-status" role="status">
        Log in to manage your account. <Link to="/login">Log in</Link>
      </div>
    );
  }

  async function handleConfirm(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!password) {
      setError("Enter your password to confirm.");
      return;
    }
    setBusy(true);
    try {
      await deactivateAccount(token as string, password);
      // Sessions are revoked server-side; drop the now-dead stored token
      // immediately rather than waiting out the redirect delay.
      clearStoredSession();
      setPassword("");
      setDone(true);
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Couldn't deactivate your account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="acct-flow">
      {step === "intro" ? (
        <>
          <Link to="/settings/privacy" className="acct-flow__back">
            &larr; Back to settings
          </Link>
          <h1 className="acct-heading">Deactivate Account</h1>
          <p className="acct-lead">
            You&rsquo;re about to start the process of deactivating your account. Your display name,
            @username, and public profile will no longer be viewable on Soccernity.
          </p>
          <div className="acct-note">
            <p className="acct-note__title">What to know</p>
            <p className="acct-note__body">
              Deactivating hides your profile and posts. Your account stays recoverable with no time
              limit — just sign back in to reactivate. Permanently deleting your account is a separate
              choice.
            </p>
          </div>
          <div className="acct-actions">
            <button type="button" className="acct-btn acct-btn--primary" onClick={() => setStep("confirm")}>
              Continue
            </button>
          </div>
        </>
      ) : (
        <>
          <button type="button" className="acct-flow__back" onClick={() => setStep("intro")}>
            &larr; Back
          </button>
          <h1 className="acct-heading">Deactivate your account</h1>
          <p className="acct-lead">
            Your account will be hidden until you reactivate it. Enter your password to confirm.
          </p>
          <div className="acct-note">
            <p className="acct-note__title">What happens</p>
            <p className="acct-note__body">
              Your profile and posts stay hidden while your account is deactivated. It stays this way
              with no time limit — sign back in any time to reactivate. Deleting your account is a
              separate choice.
            </p>
          </div>
          <form className="acct-field" onSubmit={handleConfirm}>
            <label className="acct-label" htmlFor="deactivate-password">
              Password
            </label>
            <input
              id="deactivate-password"
              className="acct-input"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
            {error && (
              <p className="acct-error" role="alert">
                {error}
              </p>
            )}
            <div className="acct-actions">
              <Link to="/settings/privacy" className="acct-btn acct-btn--ghost">
                Cancel
              </Link>
              <button type="submit" className="acct-btn acct-btn--primary" disabled={busy}>
                {busy ? "Deactivating…" : "Deactivate account"}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
