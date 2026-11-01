// The sign-in code prompt (B-087 / B-111; Decision Log #397, #446). Figma, "Soccernity-MVP"
// (weZWWqggy9j13eX8bhFgs6):
//   "Login -- Two-factor code prompt (#397)"            6711:27530 (desktop) / 6712:27524 (mobile)
//   "Login -- 2FA recovery -- Enter a backup code"      6711:27590 / 6712:27584
//   "Login -- 2FA recovery -- Backup code not accepted" 6711:27617 / 6712:27611
//
// Shared by LoginPage and InactiveAccountPage: both are answered with the same challenge
// (POST /auth/login, POST /auth/reactivate-account) and finished by the same call,
// POST /auth/login/two-factor, which for a deactivated account also reactivates it.
//
// The challenge token comes in as a prop and is never stored anywhere. The code is in
// component state only. Nothing here logs.
//
// Not built, on purpose: the "Recovery: choose method / email and password / check your
// email" frames (6711:27559, 6711:27646, 6711:27673 and the mobile twins). The backend has no
// email-recovery route and its details are undecided, so there is no link to them.
import { useState, type FormEvent } from "react";
import { AuthApiError, completeTwoFactorLogin, type LoginResponse } from "../../api/auth";
import {
  TWO_FACTOR_CODE_LOCKED,
  TWO_FACTOR_INVALID_CHALLENGE,
  TWO_FACTOR_INVALID_CODE,
} from "../../api/twoFactorCodes";
import CopyTag from "./CopyTag";
import TwoFactorCodeInput from "./TwoFactorCodeInput";
import "./twoFactor.css";

interface Props {
  challengeToken: string;
  onSignedIn: (result: LoginResponse) => void;
  /** The challenge ran out (or the account changed mid-flow): the caller sends the person back. */
  onExpired: () => void;
}

type Mode = "code" | "backup";

const WRONG_APP_CODE = "That code didn’t work. Check your authenticator app and try again.";
const WRONG_BACKUP_CODE = "That code didn’t work. Check your backup code and try again.";
const LOCKED = "Too many incorrect codes. Try again later.";

export default function TwoFactorCodePrompt({ challengeToken, onSignedIn, onExpired }: Props) {
  const [mode, setMode] = useState<Mode>("code");
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = mode === "code" ? code : backup.trim();
  const ready = mode === "code" ? code.length === 6 : backup.trim().length > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    setError(null);
    setBusy(true);
    try {
      const result = await completeTwoFactorLogin(challengeToken, value);
      setCode("");
      setBackup("");
      onSignedIn(result);
    } catch (err) {
      if (err instanceof AuthApiError && err.code === TWO_FACTOR_INVALID_CHALLENGE) {
        setCode("");
        setBackup("");
        onExpired();
        return;
      }
      if (err instanceof AuthApiError && err.code === TWO_FACTOR_INVALID_CODE) {
        setError(mode === "code" ? WRONG_APP_CODE : WRONG_BACKUP_CODE);
      } else if (err instanceof AuthApiError && err.code === TWO_FACTOR_CODE_LOCKED) {
        setError(LOCKED);
      } else {
        setError(err instanceof AuthApiError ? err.message : "Something went wrong signing you in.");
      }
      // A rejected code is never worth keeping on screen.
      setCode("");
      setBackup("");
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setCode("");
    setBackup("");
    setError(null);
  }

  return (
    <div className="tf-prompt">
      <form className="tf-prompt__inner" onSubmit={submit} noValidate>
        <CopyTag />
        {mode === "code" ? (
          <>
            <h1 className="tf-heading">Enter the 6-digit code</h1>
            <p className="tf-lead">Enter the code shown in your authenticator app for Soccernity.</p>
            <TwoFactorCodeInput
              value={code}
              onChange={setCode}
              disabled={busy}
              invalid={error !== null}
              autoFocus
              label="6-digit code"
            />
          </>
        ) : (
          <>
            <h1 className="tf-heading">Enter a backup code</h1>
            <p className="tf-lead">Each backup code works once.</p>
            <div className="tf-field">
              <label className="tf-label" htmlFor="tf-backup-code">
                Backup code
              </label>
              {/* Masked, as the frame draws it (bullets). No autofill or password manager. */}
              <input
                id="tf-backup-code"
                className="tf-input"
                type="password"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="Enter a code"
                value={backup}
                onChange={(e) => setBackup(e.target.value)}
                disabled={busy}
                aria-invalid={error !== null || undefined}
                autoFocus
              />
            </div>
          </>
        )}

        {error && (
          <p className="tf-error" role="alert">
            {error}
          </p>
        )}

        <div className="tf-actions">
          <button type="submit" className="tf-btn tf-btn--primary" disabled={!ready || busy}>
            {busy ? "Checking…" : "Continue"}
          </button>
          {mode === "backup" && (
            <button type="button" className="tf-btn tf-btn--ghost" onClick={() => switchMode("code")} disabled={busy}>
              Back
            </button>
          )}
        </div>

        {mode === "code" && (
          <button type="button" className="tf-link" onClick={() => switchMode("backup")} disabled={busy}>
            Can&rsquo;t use your authenticator app?
          </button>
        )}
      </form>
    </div>
  );
}
