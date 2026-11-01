// Settings > Security & Account Settings > Two-Factor Auth (/settings/security/two-factor).
// B-087 / B-111 (Decision Log #397, #404 item 7, #446), backend B-086. Figma, "Soccernity-MVP"
// (weZWWqggy9j13eX8bhFgs6):
//   authenticator-app set  6655:2 (scan QR), 6655:41 (enter code), 6655:85 (wrong code),
//                          6655:137 (success), 6655:173 (on, with Turn off)  + mobile twins
//                          6655:27159 / 27196 / 27238 / 27288 / 27322
//   pass H states          6711:26922 (manual key), 6711:27117 (backup codes, shown once),
//                          6711:27333 (turn off, password re-entry)  + mobile twins
//                          6712:27330 / 27387 / 27465
//
// This replaces the earlier stub (two permanently disabled "Text message" / "Authentication
// app" toggles). There is no SMS: the only second factor is an authenticator app (TOTP).
//
// The whole flow lives on this one route, as a small state machine (`view`), because every
// step needs the one before it (the secret, then the confirmed code, then the one-time backup
// codes) and none of it may be put in a URL or in storage.
//
// SECRETS. The setup secret, the otpauth URI, the typed code, the password and the ten backup
// codes live in component state only. They are never logged, never written to storage, never put
// in a URL, and are dropped when the view moves on or the page unmounts (React discards state
// on unmount). The QR code is drawn in the browser from the otpauth URI (qrcode.react); nothing
// is fetched to draw it.
//
// NOT DRAWN IN FIGMA, built plainly and flagged in the PR: the "N backup codes left" line and
// the "Get new backup codes" action on the "on" view (the backend has
// POST /auth/two-factor/backup-codes/regenerate and returns backupCodesRemaining), the loading
// and load-error lines, and the explicit "setup expired" and "locked" messages. No countdown is
// drawn for a locked account, so none is shown.
//
// NOT BUILT, on purpose: the "Recovery: choose method / email and password / check your email"
// frames. The backend has no email-recovery route and its details are undecided.
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { QRCodeSVG } from "qrcode.react";
import { AuthApiError } from "../../api/auth";
import {
  confirmTwoFactorEnrolment,
  disableTwoFactor,
  getTwoFactorStatus,
  regenerateBackupCodes,
  startTwoFactorEnrolment,
  type EnrolmentStart,
  type TwoFactorStatus,
} from "../../api/twoFactor";
import { getStoredAccessToken } from "../../lib/session";
import CopyTag from "../twoFactor/CopyTag";
import TwoFactorCodeInput from "../twoFactor/TwoFactorCodeInput";
import "./SettingsSecurityPage.css";
import "../twoFactor/twoFactor.css";

type View =
  | { kind: "loading" }
  | { kind: "load-error" }
  | { kind: "status"; status: TwoFactorStatus; notice?: string }
  | { kind: "scan" }
  | { kind: "key" }
  | { kind: "enter-code" }
  | { kind: "backup-codes"; after: "success" | "status" }
  | { kind: "success" }
  | { kind: "regenerate" }
  | { kind: "turn-off" };

const WRONG_CODE = "That code didn’t work. Check your authenticator app and try again.";
const LOCKED = "Too many incorrect codes. Try again later.";
const WRONG_PASSWORD = "That password is incorrect.";
const SETUP_EXPIRED = "This setup has expired. Start again.";
const GENERIC = "Something went wrong. Please try again.";

function formatKey(secret: string): string {
  return secret.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

function formatBackupCode(code: string): string {
  return code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
}

function Toggle({ on }: { on: boolean }) {
  // Visual state only (like PrivacySettingsPage's toggle): the actions are the explicit
  // buttons the frames draw. Colour AND knob position carry the state, never colour alone.
  return (
    <span
      className={`tf-toggle${on ? " tf-toggle--on" : ""}`}
      role="img"
      aria-label={`Authenticator app: ${on ? "on" : "off"}`}
    >
      <span className="tf-toggle__knob" />
    </span>
  );
}

function AppRow({ on }: { on: boolean }) {
  return (
    <div className="tf-row">
      <div className="tf-row__body">
        <p className="tf-row__title">Authenticator app</p>
        <p className="tf-row__desc">
          Use your mobile authenticator app to receive an authentication code to enter when you log
          in to Soccernity.
        </p>
      </div>
      <Toggle on={on} />
    </div>
  );
}

function passwordError(err: unknown): string {
  if (err instanceof AuthApiError && err.code === "two_factor_wrong_password") return WRONG_PASSWORD;
  return err instanceof AuthApiError ? err.message : GENERIC;
}

export default function TwoFactorAuthPage() {
  const accessToken = getStoredAccessToken();
  const [view, setView] = useState<View>({ kind: "loading" });
  const [enrolment, setEnrolment] = useState<EnrolmentStart | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadStatus = useCallback(async () => {
    if (!accessToken) return;
    setView({ kind: "loading" });
    try {
      const status = await getTwoFactorStatus(accessToken);
      if (mounted.current) setView({ kind: "status", status });
    } catch {
      if (mounted.current) setView({ kind: "load-error" });
    }
  }, [accessToken]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  function clearSecrets() {
    setEnrolment(null);
    setCode("");
    setPassword("");
    setBackupCodes([]);
    setError(null);
    setCopied(null);
  }

  function goTo(next: View) {
    setError(null);
    setCopied(null);
    setView(next);
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
    } catch {
      setCopied(null);
    }
  }

  if (!accessToken) {
    return (
      <p className="settings-status" role="status">
        Log in to manage two-factor authentication. <Link to="/login">Log in</Link>
      </p>
    );
  }
  const token: string = accessToken;

  // ---- actions ---------------------------------------------------------

  async function startSetup() {
    setBusy(true);
    setError(null);
    try {
      const started = await startTwoFactorEnrolment(token);
      setEnrolment(started);
      setCode("");
      setView({ kind: "scan" });
    } catch (err) {
      if (err instanceof AuthApiError && err.code === "two_factor_already_enabled") {
        void loadStatus();
      } else {
        setError(err instanceof AuthApiError ? err.message : GENERIC);
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const codes = await confirmTwoFactorEnrolment(token, code);
      setBackupCodes(codes);
      setEnrolment(null);
      setCode("");
      setView({ kind: "backup-codes", after: "success" });
    } catch (err) {
      setCode("");
      if (err instanceof AuthApiError && err.code === "two_factor_invalid_code") {
        setError(WRONG_CODE);
      } else if (err instanceof AuthApiError && err.code === "two_factor_locked") {
        setError(LOCKED);
      } else if (err instanceof AuthApiError && err.code === "two_factor_no_pending") {
        clearSecrets();
        setView({ kind: "status", status: { enabled: false, backupCodesRemaining: 0 }, notice: SETUP_EXPIRED });
      } else if (err instanceof AuthApiError && err.code === "two_factor_already_enabled") {
        clearSecrets();
        void loadStatus();
      } else {
        setError(err instanceof AuthApiError ? err.message : GENERIC);
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitRegenerate(event: FormEvent) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const codes = await regenerateBackupCodes(token, password);
      setBackupCodes(codes);
      setPassword("");
      setView({ kind: "backup-codes", after: "status" });
    } catch (err) {
      setPassword("");
      setError(passwordError(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitTurnOff(event: FormEvent) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await disableTwoFactor(token, password);
      setPassword("");
      setView({
        kind: "status",
        status: { enabled: false, backupCodesRemaining: 0 },
        notice: "Two-factor authentication is off.",
      });
    } catch (err) {
      setPassword("");
      setError(passwordError(err));
    } finally {
      setBusy(false);
    }
  }

  function savedBackupCodes(after: "success" | "status") {
    // The codes were shown once; drop them now.
    setBackupCodes([]);
    setCopied(null);
    if (after === "success") {
      setView({ kind: "success" });
    } else {
      void loadStatus();
    }
  }

  function cancelToStatus() {
    clearSecrets();
    void loadStatus();
  }

  // ---- views -----------------------------------------------------------

  let body: ReactNode = null;

  if (view.kind === "loading") {
    body = (
      <p className="settings-status" role="status">
        Loading your two-factor settings&hellip;
      </p>
    );
  } else if (view.kind === "load-error") {
    body = (
      <div className="tf-block">
        <p className="tf-error" role="alert">
          Couldn&rsquo;t load your two-factor settings.
        </p>
        <div className="tf-actions">
          <button type="button" className="tf-btn tf-btn--primary" onClick={() => void loadStatus()}>
            Try again
          </button>
        </div>
      </div>
    );
  } else if (view.kind === "status") {
    const { status, notice } = view;
    body = (
      <div className="tf-block">
        <CopyTag />
        <AppRow on={status.enabled} />
        {notice && (
          <p className="tf-note" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="tf-error" role="alert">
            {error}
          </p>
        )}
        {status.enabled ? (
          <>
            <p className="tf-callout">
              Two-factor authentication is on. You will be asked for a code from your authenticator
              app when you log in.
            </p>
            <p className="tf-meta">
              {status.backupCodesRemaining === 1
                ? "1 backup code left."
                : `${status.backupCodesRemaining} backup codes left.`}
            </p>
            <div className="tf-actions">
              <button
                type="button"
                className="tf-btn tf-btn--ghost"
                onClick={() => {
                  setPassword("");
                  goTo({ kind: "turn-off" });
                }}
              >
                Turn off
              </button>
              <button
                type="button"
                className="tf-btn tf-btn--ghost"
                onClick={() => {
                  setPassword("");
                  goTo({ kind: "regenerate" });
                }}
              >
                Get new backup codes
              </button>
            </div>
          </>
        ) : (
          <div className="tf-actions">
            <button type="button" className="tf-btn tf-btn--primary" onClick={() => void startSetup()} disabled={busy}>
              {busy ? "Starting…" : "Turn on"}
            </button>
          </div>
        )}
      </div>
    );
  } else if (view.kind === "scan" && enrolment) {
    body = (
      <div className="tf-block">
        <CopyTag />
        <p className="tf-step">Step 1 of 2</p>
        <h3 className="tf-subheading">Scan the QR code</h3>
        <p className="tf-lead">Open your authenticator app and scan this code to add Soccernity.</p>
        <div className="tf-qr" role="img" aria-label="QR code for your authenticator app">
          <QRCodeSVG value={enrolment.otpauthUri} size={168} level="M" marginSize={0} />
        </div>
        <button type="button" className="tf-link tf-link--green" onClick={() => goTo({ kind: "key" })}>
          Can&rsquo;t scan? &rsaquo;
        </button>
        <div className="tf-actions">
          <button
            type="button"
            className="tf-btn tf-btn--primary"
            onClick={() => {
              setCode("");
              goTo({ kind: "enter-code" });
            }}
          >
            Continue
          </button>
          <button type="button" className="tf-btn tf-btn--ghost" onClick={cancelToStatus}>
            Cancel
          </button>
        </div>
      </div>
    );
  } else if (view.kind === "key" && enrolment) {
    body = (
      <div className="tf-block">
        <CopyTag />
        <p className="tf-step">Step 1 of 2</p>
        <h3 className="tf-subheading">Enter the setup key</h3>
        <p className="tf-lead">
          If you can&rsquo;t scan the QR code, type this key into your authenticator app instead.
        </p>
        <p className="tf-key" aria-label="Setup key">
          {formatKey(enrolment.secret)}
        </p>
        <div className="tf-actions">
          <button type="button" className="tf-btn tf-btn--ghost" onClick={() => void copyText("key", enrolment.secret)}>
            Copy key
          </button>
          <button
            type="button"
            className="tf-btn tf-btn--primary"
            onClick={() => {
              setCode("");
              goTo({ kind: "enter-code" });
            }}
          >
            Continue
          </button>
        </div>
        {copied === "key" && (
          <p className="tf-meta" role="status">
            Key copied.
          </p>
        )}
        <button type="button" className="tf-link" onClick={() => goTo({ kind: "scan" })}>
          Back to the QR code
        </button>
      </div>
    );
  } else if (view.kind === "enter-code") {
    body = (
      <form className="tf-block" onSubmit={confirmSetup} noValidate>
        <CopyTag />
        <p className="tf-step">Step 2 of 2</p>
        <h3 className="tf-subheading">Enter the 6-digit code</h3>
        <p className="tf-lead">Enter the code shown in your authenticator app for Soccernity.</p>
        <TwoFactorCodeInput
          value={code}
          onChange={setCode}
          disabled={busy}
          invalid={error !== null}
          autoFocus
          label="6-digit code"
        />
        {error && (
          <p className="tf-error" role="alert">
            {error}
          </p>
        )}
        <div className="tf-actions">
          <button type="submit" className="tf-btn tf-btn--primary" disabled={code.length !== 6 || busy}>
            {busy ? "Checking…" : "Turn on two-factor authentication"}
          </button>
          <button
            type="button"
            className="tf-btn tf-btn--ghost"
            onClick={() => {
              setCode("");
              goTo({ kind: "scan" });
            }}
            disabled={busy}
          >
            Back
          </button>
        </div>
      </form>
    );
  } else if (view.kind === "backup-codes") {
    const after = view.after;
    body = (
      <div className="tf-block">
        <CopyTag />
        <h3 className="tf-subheading">Save your backup codes</h3>
        <p className="tf-lead">
          These {backupCodes.length} codes are shown once. Each code can be used one time if you cannot use your
          authenticator app.
        </p>
        <ol className="tf-codes">
          {backupCodes.map((c, i) => (
            <li key={i} className="tf-codes__item">
              <span className="tf-codes__n" aria-hidden="true">
                {i + 1}
              </span>
              <span className="tf-codes__code" aria-label={`Code ${i + 1}`}>
                {formatBackupCode(c)}
              </span>
            </li>
          ))}
        </ol>
        <div className="tf-actions">
          <button type="button" className="tf-btn tf-btn--primary" onClick={() => savedBackupCodes(after)}>
            I&rsquo;ve saved my codes
          </button>
          <button
            type="button"
            className="tf-btn tf-btn--ghost"
            onClick={() => void copyText("codes", backupCodes.map(formatBackupCode).join("\n"))}
          >
            Copy codes
          </button>
        </div>
        {copied === "codes" && (
          <p className="tf-meta" role="status">
            Codes copied.
          </p>
        )}
      </div>
    );
  } else if (view.kind === "success") {
    body = (
      <div className="tf-block">
        <CopyTag />
        <h3 className="tf-subheading">Two-factor authentication is on</h3>
        <p className="tf-lead">You will be asked for a code from your authenticator app when you log in.</p>
        <div className="tf-actions">
          <button type="button" className="tf-btn tf-btn--primary" onClick={() => void loadStatus()}>
            Done
          </button>
        </div>
      </div>
    );
  } else if (view.kind === "turn-off" || view.kind === "regenerate") {
    const turningOff = view.kind === "turn-off";
    const label = turningOff ? "Turn off two-factor authentication" : "Get new backup codes";
    body = (
      <form className="tf-block" onSubmit={turningOff ? submitTurnOff : submitRegenerate} noValidate>
        <CopyTag />
        <h3 className="tf-subheading">{label}</h3>
        <p className="tf-lead">
          {turningOff
            ? "Turning this off makes your account less secure."
            : "Your old backup codes stop working when you get new ones."}
        </p>
        <p className="tf-lead">Enter your password to confirm.</p>
        <div className="tf-field">
          <label className="tf-label" htmlFor="tf-password">
            Password
          </label>
          <input
            id="tf-password"
            className="tf-input"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            aria-invalid={error !== null || undefined}
            autoFocus
          />
        </div>
        {error && (
          <p className="tf-error" role="alert">
            {error}
          </p>
        )}
        <div className="tf-actions">
          <button type="submit" className="tf-btn tf-btn--primary" disabled={!password || busy}>
            {busy ? "Checking…" : label}
          </button>
          <button type="button" className="tf-btn tf-btn--ghost" onClick={cancelToStatus} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="settings-page">
      <div>
        <h2 className="settings-page__title">Two-factor authentication</h2>
        <p className="settings-page__lead">Choose a second way to confirm it&rsquo;s you when you log in.</p>
      </div>
      {body}
    </div>
  );
}
