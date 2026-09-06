// Settings — Delete Account (direct). Figma: "Settings — Delete Account
// (Confirm)" 6225:14789 / mobile 6225:15024, from
// sprint-2/auth-navbar-delete-account-privacy-consolidation (Decision
// Log #222). Route: /settings/delete-account.
//
// A PARALLEL path to deactivation -- NOT gated behind deactivating first
// (PR #222 report, Part 2). Reached directly from PrivacySettingsPage's
// "Account status" row.
//
// SCOPE NOTE: this route is slightly beyond the literal
// sprint-2/account-deactivation-to-code brief ("the Settings
// deactivation UI + the Inactive Account screen"). Built here anyway
// because it was a live PlaceholderPage stub linked from the shipped
// PrivacySettingsPage, and both the design (6225:14789) and the backend
// (POST /auth/delete-account) already existed -- leaving it a stub would
// half-break that page.
//
// POST /auth/delete-account (JwtAuthGuard-only) requires the current
// password, sets accountStatus = "pending_deletion" + pendingDeletionAt,
// and revokes every session. It does NOT hard-delete --
// AccountDeletionSweepService applies the 30-day grace, then the hard
// delete + cascade (Decision Log #42/#44). Copy must never imply instant
// deletion; the 30-day-grace / sign-back-in-to-cancel wording below is
// quoted from the Figma frame (6217:14785).
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { AuthApiError, deleteAccount } from "../../api/auth";
import { getStoredAccessToken, clearStoredSession } from "../../lib/session";
import "../account/accountActions.css";

const REDIRECT_DELAY_MS = 2500; // see DeactivateAccountPage.tsx

export default function DeleteAccountPage() {
  const navigate = useNavigate();
  const token = getStoredAccessToken();

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => navigate("/login"), REDIRECT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [done, navigate]);

  // `done` is checked BEFORE the session guard: a successful request
  // clears the stored token (below), so `token` is null by the time this
  // success view renders.
  if (done) {
    return (
      <div className="acct-flow">
        <p className="acct-success" role="status">
          Your request has been received. You have 30 days to sign back in and cancel before your
          account is permanently deleted. Taking you to the login page…
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

  async function handleDelete(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!password) {
      setError("Enter your password to confirm.");
      return;
    }
    setBusy(true);
    try {
      await deleteAccount(token as string, password);
      clearStoredSession();
      setPassword("");
      setDone(true);
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Couldn't process that request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="acct-flow">
      <Link to="/settings/privacy" className="acct-flow__back">
        &larr; Back to settings
      </Link>
      <h1 className="acct-heading">Delete your account?</h1>
      <p className="acct-lead">
        Deleting starts a 30-day grace period. Sign back in within 30 days to cancel and keep your
        account. After 30 days, your account and everything in it are permanently deleted and
        can&rsquo;t be recovered.
      </p>
      <form className="acct-field" onSubmit={handleDelete}>
        <label className="acct-label" htmlFor="delete-password">
          Enter your password to confirm
        </label>
        <input
          id="delete-password"
          className="acct-input"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
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
            {busy ? "Processing…" : "Delete account"}
          </button>
        </div>
      </form>
    </div>
  );
}
