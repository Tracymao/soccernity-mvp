// Inactive Account -- login-time interstitial. Figma:
//   "Inactive Account"                  1662:2782 / mobile "Community — Inactive Account — Mobile" 5780:8679
//   "Inactive Account — Delete (Confirm)" 6217:14677 / mobile 6215:14657
// "Soccernity-MVP" (weZWWqggy9j13eX8bhFgs6). Route: /account/inactive,
// under AuthChrome -- the logo-only "Top Bar — Soccernity", not the site
// Header. The Figma frames reuse the logged-in navbar as a matter of
// course, but the person is NOT authenticated here (their login was
// rejected), so a logged-in navbar with an avatar/messages cluster would
// be wrong -- the same reasoning the four core auth routes use (Decision
// Log #172). Flagged in this PR's report as a deliberate divergence.
//
// Reached ONLY from LoginPage: a login attempt whose credentials were
// CORRECT but whose account is "deactivated" (AuthService.login returns a
// 401 whose message mentions "deactivated", and only AFTER the password
// verifies -- so the credentials handed here are known-good). LoginPage
// passes { email, password } via react-router's in-memory
// location.state -- never written to the URL, never to storage, same
// lifetime as component state. A direct visit or a refresh loses that
// state; this page then redirects to /login.
//
// "Activate account" -> POST /auth/reactivate-account with the carried
// credentials -> store the returned tokens (exactly as LoginPage does) ->
// "/" (HomePage sends a signed-in visitor on to /community). The Figma
// Inactive frame has no password field precisely because the password is
// already known from the login attempt.
//
// "Delete account" -> the Figma "Delete (Confirm)" sub-step, which
// re-asks for the password as a deliberate friction step for a
// destructive action, then POST /auth/delete-inactive-account
// (unauthenticated; sets pending_deletion + starts the 30-day grace
// clock, the same server path as POST /auth/delete-account). On success
// the account can no longer log in OR reactivate until the grace window
// runs out; this page shows a received-your-request message and
// redirects to /login.
import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { AuthApiError, deleteInactiveAccount, reactivateAccount } from "../api/auth";
import "./account/accountActions.css";

const REDIRECT_DELAY_MS = 2500; // see settings/DeactivateAccountPage.tsx

interface CarriedCredentials {
  email?: string;
  password?: string;
}

type Step = "choices" | "delete-confirm" | "deleted";

export default function InactiveAccountPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const carried = (location.state ?? null) as CarriedCredentials | null;
  const email = carried?.email ?? "";
  const loginPassword = carried?.password ?? "";

  const [step, setStep] = useState<Step>("choices");
  const [deletePassword, setDeletePassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== "deleted") return;
    const timer = window.setTimeout(() => navigate("/login"), REDIRECT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [step, navigate]);

  // No carried credentials (direct visit / refresh) -- nothing to act on.
  if (!email || !loginPassword) {
    return <Navigate to="/login" replace />;
  }

  async function handleActivate() {
    setError(null);
    setBusy(true);
    try {
      const result = await reactivateAccount(email, loginPassword);
      // Same minimal session handling LoginPage.tsx uses on its own
      // unchecked-"stay signed in" path (sessionStorage, not persistent).
      window.sessionStorage.setItem("sn_access_token", result.accessToken);
      window.sessionStorage.setItem("sn_refresh_token", result.refreshToken);
      navigate("/");
    } catch (err) {
      setError(
        err instanceof AuthApiError ? err.message : "Couldn't reactivate your account. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!deletePassword) {
      setError("Enter your password to confirm.");
      return;
    }
    setBusy(true);
    try {
      await deleteInactiveAccount(email, deletePassword);
      setDeletePassword("");
      setStep("deleted");
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Couldn't process that request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="acct-interstitial">
      <div className="acct-interstitial__inner">
        {step === "choices" && (
          <>
            <h1 className="acct-heading">Hello!</h1>
            <p className="acct-lead">
              Your Soccernity account is currently inactive. You can activate it instantly, or
              permanently delete the account.
            </p>
            {error && (
              <p className="acct-error" role="alert">
                {error}
              </p>
            )}
            <div className="acct-actions">
              <button
                type="button"
                className="acct-btn acct-btn--go"
                onClick={handleActivate}
                disabled={busy}
              >
                {busy ? "Activating…" : "Activate account"}
              </button>
              <button
                type="button"
                className="acct-btn acct-btn--ghost"
                onClick={() => {
                  setError(null);
                  setStep("delete-confirm");
                }}
                disabled={busy}
              >
                Delete account
              </button>
            </div>
          </>
        )}

        {step === "delete-confirm" && (
          <>
            <h1 className="acct-heading">Delete your account?</h1>
            <p className="acct-lead">
              Deleting starts a 30-day grace period. Sign back in within 30 days to cancel and keep
              your account. After 30 days, your account and everything in it are permanently deleted
              and can&rsquo;t be recovered.
            </p>
            <form className="acct-field" onSubmit={handleDelete}>
              <label className="acct-label" htmlFor="inactive-delete-password">
                Enter your password to confirm
              </label>
              <input
                id="inactive-delete-password"
                className="acct-input"
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                disabled={busy}
              />
              {error && (
                <p className="acct-error" role="alert">
                  {error}
                </p>
              )}
              <div className="acct-actions">
                <button
                  type="button"
                  className="acct-btn acct-btn--ghost"
                  onClick={() => {
                    setError(null);
                    setStep("choices");
                  }}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button type="submit" className="acct-btn acct-btn--primary" disabled={busy}>
                  {busy ? "Processing…" : "Delete account"}
                </button>
              </div>
            </form>
          </>
        )}

        {step === "deleted" && (
          <p className="acct-success" role="status">
            Your request has been received. You have 30 days to sign back in and cancel before your
            account is permanently deleted. Taking you to the login page…
          </p>
        )}
      </div>
    </div>
  );
}
