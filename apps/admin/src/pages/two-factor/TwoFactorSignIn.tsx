// The sign-in screens that come AFTER the password step (B-271; Figma 6896:32445 to 6900:32728,
// docs/figma-admin-two-factor-report.md section 3):
//   - ChallengePrompt: the admin has two-factor on. login answered { twoFactorRequired,
//     challengeToken }; the code (or a backup code) finishes the sign-in.
//   - Enrolment: ADMIN_2FA_ENFORCED is on and the admin has none. login answered
//     { twoFactorEnrolmentRequired, enrolmentToken }; scan a QR code, type the first code, then save
//     the 10 backup codes. enrol/confirm returns the SESSION together with the codes; the session is
//     held here and only handed to the Console when the operator says the codes are saved.
//
// The challenge / enrolment token is the only credential on these screens. It lives in props and
// component state (memory); nothing here writes to browser storage.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { AdminAuthResult } from "../../api/adminAuth";
import {
  INVALID_CODE_MESSAGE,
  classifyCodeFailure,
  completeTwoFactorLogin,
  confirmEnrolmentAtSignIn,
  startEnrolmentAtSignIn,
  type AdminEnrolmentResult,
  type CodeFailure,
  type EnrolmentStart,
} from "../../api/adminTwoFactor";
import logoMark from "../../assets/icons/logo-mark.svg";
import BackupCodesPanel from "./BackupCodesPanel";
import CodeInput, { CODE_LENGTH } from "./CodeInput";
import { copyText } from "./copyText";
import * as copy from "./twoFactorCopy";
import "./twoFactor.css";

export type SignInStep =
  | { kind: "challenge"; challengeToken: string }
  | { kind: "enrolment"; enrolmentToken: string };

interface Props {
  step: SignInStep;
  /** Back to the email + password form. */
  onBack: () => void;
  /** The sign-in is finished: make this the live session. */
  onSignedIn: (result: AdminAuthResult) => void;
}

function Brand() {
  return (
    <div className="admin-login__brand">
      <img src={logoMark} alt="" className="admin-login__logo" />
      <span className="admin-login__wordmark">Soccernity</span>
    </div>
  );
}

function Banner({ title, children, tone = "alert" }: { title?: string; children: string; tone?: "alert" | "info" }) {
  return (
    <div className={`tf-banner tf-banner--${tone}`} role="alert">
      <span className="tf-banner__bar" aria-hidden />
      <div>
        {title ? <p className="tf-banner__title">{title}</p> : null}
        <p className="tf-banner__body">{children}</p>
      </div>
    </div>
  );
}

// ---- Code prompt ----

function ChallengePrompt({
  challengeToken,
  onBack,
  onSignedIn,
}: {
  challengeToken: string;
  onBack: () => void;
  onSignedIn: (result: AdminAuthResult) => void;
}) {
  const [mode, setMode] = useState<"code" | "backup">("code");
  const [value, setValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [failure, setFailure] = useState<CodeFailure | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const backupRef = useRef<HTMLInputElement>(null);

  // 6 digits, or a backup code (10 characters once spaces and the display hyphen are ignored).
  const ready =
    mode === "code" ? value.length === CODE_LENGTH : value.replace(/[\s-]/g, "").length >= 10;
  const locked = failure === "locked";
  const expired = failure === "expired";

  useEffect(() => {
    if (mode === "backup") backupRef.current?.focus();
  }, [mode]);

  const switchMode = (next: "code" | "backup") => {
    setMode(next);
    setValue("");
    setFailure(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || checking || locked) return;
    setChecking(true);
    setFailure(null);
    try {
      const result = await completeTwoFactorLogin(challengeToken, value.trim());
      onSignedIn(result);
    } catch (err) {
      const kind = classifyCodeFailure(err);
      setFailure(kind);
      if (kind === "wrong") {
        setValue("");
        setFocusKey((k) => k + 1);
        backupRef.current?.focus();
      }
      setChecking(false);
    }
  };

  if (expired) {
    return (
      <div className="admin-login__card tf-card">
        <Brand />
        <h1 className="admin-login__title">{copy.PROMPT_EXPIRED_TITLE}</h1>
        <p className="tf-text">{copy.PROMPT_EXPIRED_BODY}</p>
        <button type="button" className="tf-btn tf-btn--primary" onClick={onBack}>
          {copy.BACK_TO_SIGN_IN}
        </button>
      </div>
    );
  }

  return (
    <form className="admin-login__card tf-card" onSubmit={(e) => void submit(e)}>
      <Brand />
      <h1 className="admin-login__title">{mode === "code" ? copy.PROMPT_TITLE : copy.BACKUP_PROMPT_TITLE}</h1>
      <p className="tf-text">{mode === "code" ? copy.PROMPT_HELP : copy.BACKUP_PROMPT_HELP}</p>

      {locked ? <Banner title={copy.LOCKED_TITLE}>{copy.LOCKED_BODY}</Banner> : null}
      {failure === "wrong" ? <Banner>{INVALID_CODE_MESSAGE}</Banner> : null}
      {failure === "other" ? <Banner>{copy.GENERIC_ERROR}</Banner> : null}

      {mode === "code" ? (
        <CodeInput
          id="tf-signin-code"
          label="Authentication code"
          value={value}
          onChange={setValue}
          disabled={checking || locked}
          focusKey={focusKey}
        />
      ) : (
        <label className="tf-field">
          <span>{copy.BACKUP_CODE_LABEL}</span>
          <input
            ref={backupRef}
            type="text"
            name="backup-code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={32}
            value={value}
            disabled={checking || locked}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
      )}

      <button type="submit" className="tf-btn tf-btn--primary" disabled={!ready || checking || locked}>
        {checking ? copy.CHECKING : copy.SIGN_IN}
      </button>
      <button
        type="button"
        className="tf-link"
        onClick={() => switchMode(mode === "code" ? "backup" : "code")}
        disabled={checking}
      >
        {mode === "code" ? copy.USE_BACKUP_CODE : copy.USE_AUTHENTICATOR_CODE}
      </button>
      <button type="button" className="tf-link" onClick={onBack} disabled={checking}>
        {copy.BACK_TO_SIGN_IN}
      </button>
    </form>
  );
}

// ---- Enrolment ----

type Setup =
  | { status: "loading" }
  | { status: "ready"; data: EnrolmentStart }
  | { status: "expired" }
  | { status: "locked" }
  | { status: "error" };

function groupKey(secret: string): string {
  return secret.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

function Enrolment({
  enrolmentToken,
  onBack,
  onSignedIn,
}: {
  enrolmentToken: string;
  onBack: () => void;
  onSignedIn: (result: AdminAuthResult) => void;
}) {
  const [setup, setSetup] = useState<Setup>({ status: "loading" });
  const [view, setView] = useState<"qr" | "key" | "code">("qr");
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [failure, setFailure] = useState<CodeFailure | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const [finished, setFinished] = useState<AdminEnrolmentResult | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  // enrol/start replaces any pending secret, so it must run exactly once per enrolment token:
  // React StrictMode runs effects twice in development, and a second call would make the
  // QR code on screen stale. The guard is a ref (kept across the simulated remount) and the
  // result is applied without a cancelled flag for the same reason.
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (started.current === enrolmentToken) return;
    started.current = enrolmentToken;
    startEnrolmentAtSignIn(enrolmentToken).then(
      (data) => setSetup({ status: "ready", data }),
      (err: unknown) => {
        const kind = classifyCodeFailure(err);
        setSetup({ status: kind === "locked" ? "locked" : kind === "other" ? "error" : "expired" });
      },
    );
  }, [enrolmentToken]);

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== CODE_LENGTH || checking || failure === "locked") return;
    setChecking(true);
    setFailure(null);
    try {
      const result = await confirmEnrolmentAtSignIn(enrolmentToken, code);
      setFinished(result);
    } catch (err) {
      const kind = classifyCodeFailure(err);
      setFailure(kind);
      if (kind === "wrong") {
        setCode("");
        setFocusKey((k) => k + 1);
      }
      setChecking(false);
    }
  };

  // The session came back with the codes: hold it, show the codes, and only then let the operator in.
  if (finished) {
    const { backupCodes, ...session } = finished;
    return (
      <div className="admin-login__card tf-card">
        <Brand />
        <h1 className="admin-login__title">{copy.BACKUP_TITLE}</h1>
        <BackupCodesPanel
          codes={backupCodes}
          continueLabel={copy.CONTINUE_TO_CONSOLE}
          onContinue={() => onSignedIn(session)}
        />
      </div>
    );
  }

  if (setup.status === "expired" || failure === "expired") {
    return (
      <div className="admin-login__card tf-card">
        <Brand />
        <h1 className="admin-login__title">{copy.ENROL_EXPIRED_TITLE}</h1>
        <p className="tf-text">{copy.ENROL_EXPIRED_BODY}</p>
        <button type="button" className="tf-btn tf-btn--primary" onClick={onBack}>
          {copy.BACK_TO_SIGN_IN}
        </button>
      </div>
    );
  }

  if (setup.status === "locked" || setup.status === "error") {
    return (
      <div className="admin-login__card tf-card">
        <Brand />
        <h1 className="admin-login__title">{copy.ENROL_TITLE}</h1>
        {setup.status === "locked" ? (
          <Banner title={copy.LOCKED_TITLE}>{copy.LOCKED_BODY}</Banner>
        ) : (
          <Banner>{copy.GENERIC_ERROR}</Banner>
        )}
        <button type="button" className="tf-btn tf-btn--primary" onClick={onBack}>
          {copy.BACK_TO_SIGN_IN}
        </button>
      </div>
    );
  }

  if (view === "code") {
    const locked = failure === "locked";
    return (
      <form className="admin-login__card tf-card" onSubmit={(e) => void confirm(e)}>
        <Brand />
        <p className="tf-step">{copy.STEP_2_OF_2}</p>
        <h1 className="admin-login__title">{copy.CODE_TITLE}</h1>
        <p className="tf-text">{copy.CODE_HELP}</p>
        {locked ? <Banner title={copy.LOCKED_TITLE}>{copy.LOCKED_BODY}</Banner> : null}
        {failure === "wrong" ? <Banner>{INVALID_CODE_MESSAGE}</Banner> : null}
        {failure === "other" ? <Banner>{copy.GENERIC_ERROR}</Banner> : null}
        <CodeInput
          id="tf-enrol-code"
          label="Authentication code"
          value={code}
          onChange={setCode}
          disabled={checking || locked}
          focusKey={focusKey}
        />
        <button
          type="submit"
          className="tf-btn tf-btn--primary"
          disabled={code.length !== CODE_LENGTH || checking || locked}
        >
          {checking ? copy.CHECKING : copy.CONFIRM}
        </button>
        <button
          type="button"
          className="tf-link"
          disabled={checking}
          onClick={() => {
            setView("qr");
            setFailure(null);
            setCode("");
          }}
        >
          {copy.BACK}
        </button>
        <button type="button" className="tf-link" onClick={onBack} disabled={checking}>
          {copy.BACK_TO_SIGN_IN}
        </button>
      </form>
    );
  }

  // Step 1: scan, or type the key.
  const ready = setup.status === "ready" ? setup.data : null;
  return (
    <div className="admin-login__card tf-card">
      <Brand />
      <p className="tf-step">{copy.STEP_1_OF_2}</p>
      {view === "key" ? (
        <>
          <h1 className="admin-login__title">{copy.KEY_TITLE}</h1>
          <p className="tf-text">{copy.KEY_HELP}</p>
          <div className="tf-key" aria-label="Setup key">
            <code>{ready ? groupKey(ready.secret) : ""}</code>
          </div>
          <button
            type="button"
            className="tf-btn tf-btn--outline"
            disabled={!ready}
            onClick={async () => {
              if (ready && (await copyText(ready.secret))) setKeyCopied(true);
            }}
          >
            {keyCopied ? "Copied" : copy.COPY_KEY}
          </button>
          <button type="button" className="tf-link" onClick={() => setView("qr")}>
            {copy.BACK_TO_QR}
          </button>
        </>
      ) : (
        <>
          <h1 className="admin-login__title">{copy.ENROL_TITLE}</h1>
          <p className="tf-text">{copy.ENROL_INTRO}</p>
          <div className="tf-qr" aria-busy={!ready}>
            {ready ? (
              <QRCodeSVG value={ready.otpauthUri} size={200} title="QR code for your authenticator app" />
            ) : (
              <p className="tf-text" role="status">
                {copy.ENROL_PREPARING}
              </p>
            )}
          </div>
          <button type="button" className="tf-link" disabled={!ready} onClick={() => setView("key")}>
            {copy.CANT_SCAN}
          </button>
        </>
      )}
      <button type="button" className="tf-btn tf-btn--primary" disabled={!ready} onClick={() => setView("code")}>
        {copy.CONTINUE}
      </button>
      <button type="button" className="tf-link" onClick={onBack}>
        {copy.BACK_TO_SIGN_IN}
      </button>
    </div>
  );
}

export default function TwoFactorSignIn({ step, onBack, onSignedIn }: Props) {
  return step.kind === "challenge" ? (
    <ChallengePrompt challengeToken={step.challengeToken} onBack={onBack} onSignedIn={onSignedIn} />
  ) : (
    <Enrolment enrolmentToken={step.enrolmentToken} onBack={onBack} onSignedIn={onSignedIn} />
  );
}
