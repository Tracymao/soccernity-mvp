// Settings > Account > Account Information > Change email. Figma (file
// weZWWqggy9j13eX8bhFgs6, desktop / mobile):
//   confirm password       6989:50158 / 6989:50394
//   wrong password         6990:50244 / 6990:51740
//   two-factor code        6990:50433 / 6990:51783
//   new email              6990:50619 / 6990:51823
//   email not accepted     6990:50805 / 6990:51863
//   check your inbox       6990:50994 / 6990:51906 (+ under 18: 6990:51182 / 6990:51948)
// Route /settings/account/information/change-email. Build register B-059.
//
// One request does all the work: POST /users/me/email-change { password, newEmail,
// twoFactorCode? } (api/emailChange.ts). The steps only collect its inputs:
//   password -> new email -> (two-factor code, ONLY after the server answers
//   403 two_factor_required) -> check your inbox.
// The server checks the password first and the code second, so:
//   - 403 wrong_password        -> back to the password step with the frame's error;
//   - 403 two_factor_required   -> the two-factor step (never shown on a guess);
//   - 403 two_factor_invalid    -> stay on the code step with an error;
//   - 400 email_change_not_accepted -> ONE message on the new-email step, never a reason;
//   - 403 guardian_consent_pending -> a plain "not available until your guardian has
//     approved your account" line (a restricted-pending minor), not a raw error.
// The password, the new address and the code live in component state only: never in
// storage, a URL or the console, and gone when the page is left.
//
// Tagged wording, exactly where the frames tag it (Decision Log #412 item 5): the two
// callouts on the check-your-inbox step. No link lifetime and no resend wait is printed.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  EMAIL_CHANGE_CONSENT_PENDING,
  EMAIL_CHANGE_NOT_ACCEPTED,
  EMAIL_CHANGE_TWO_FACTOR_INVALID,
  EMAIL_CHANGE_TWO_FACTOR_REQUIRED,
  EMAIL_CHANGE_WRONG_PASSWORD,
  EmailChangeApiError,
  requestEmailChange,
} from "../../api/emailChange";
import { getUser } from "../../api/users";
import { decodeAccessToken, getStoredAccessToken } from "../../lib/session";
import mailIcon from "../../assets/icons/email-change-mail.svg";
import "./EmailChange.css";

export const MESSAGES = {
  passwordRequired: "Enter your password.",
  passwordWrong: "That password isn’t right. Check it and try again.",
  emailNotAccepted: "We couldn’t use that email address. Check it, or try a different one.",
  codeRequired: "Enter the code.",
  codeWrong: "That code didn’t work. Check it and try again.",
  consentPending: "Changing your email isn’t available until your guardian has approved your account.",
  tooMany: "Too many attempts. Please wait a while and try again.",
  unavailable: "We couldn’t send the link right now. Try again later.",
  generic: "We couldn’t start the email change. Try again.",
  sentAgain: "We sent the link again.",
} as const;

// Tagged sentences, as the frames draw them.
export const OLD_ADDRESS_NOTICE = "We’ve also told your current address about this change. [COPY PENDING LEGAL REVIEW]";
export const GUARDIAN_NOTICE = "Your guardian will be told about this change. [COPY PENDING LEGAL REVIEW]";

type Step = "password" | "twofactor" | "newEmail" | "sent";

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <div className="ec-error" id={id} role="alert">
      <span className="ec-error__bar" aria-hidden="true" />
      <p className="ec-error__text">{children}</p>
    </div>
  );
}

function Callout({ children }: { children: string }) {
  return (
    <div className="ec__callout">
      <span className="ec__callout-bar" aria-hidden="true" />
      <p className="ec__callout-text">{children}</p>
    </div>
  );
}

// The same loose shape check the server's own validator starts from; the server decides.
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function ChangeEmailPage() {
  const token = getStoredAccessToken();
  const myId = token ? decodeAccessToken(token)?.sub : undefined;
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sentAgain, setSentAgain] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [isMinor, setIsMinor] = useState(false);
  const focusId = useRef<string | null>(null);

  // Only to know whether to say the guardian will be told (the server tells them either way).
  useEffect(() => {
    if (!token || !myId) return;
    let cancelled = false;
    getUser(token, myId)
      .then((p) => {
        if (!cancelled) setIsMinor(p.isMinor);
      })
      .catch(() => {
        /* unknown: the guardian line is simply not drawn */
      });
    return () => {
      cancelled = true;
    };
  }, [token, myId]);

  // A disabled control cannot take focus, so focus is applied after the render that enables it.
  useEffect(() => {
    if (focusId.current && !busy) {
      document.getElementById(focusId.current)?.focus();
      focusId.current = null;
    }
  });

  if (!token) {
    return (
      <p className="settings-status" role="status">
        Log in to manage your account. <Link to="/login">Log in</Link>
      </p>
    );
  }

  function back() {
    setFormError(null);
    if (step === "password") {
      navigate("/settings/account/information");
    } else if (step === "twofactor") {
      setStep("newEmail");
    } else if (step === "newEmail") {
      setStep("password");
    } else {
      setStep("newEmail");
    }
  }

  function handlePasswordContinue(event: FormEvent) {
    event.preventDefault();
    if (!password) {
      setPasswordError(MESSAGES.passwordRequired);
      focusId.current = "ec-password";
      return;
    }
    setPasswordError(null);
    setStep("newEmail");
  }

  async function send(opts: { again: boolean }) {
    if (busy) return;
    const address = newEmail.trim();
    setFormError(null);
    setSentAgain(false);

    if (!looksLikeEmail(address)) {
      setEmailError(MESSAGES.emailNotAccepted);
      setStep("newEmail");
      focusId.current = "ec-new-email";
      return;
    }
    setEmailError(null);

    if (step === "twofactor" && !code.trim()) {
      setCodeError(MESSAGES.codeRequired);
      focusId.current = "ec-code";
      return;
    }

    setBusy(true);
    try {
      await requestEmailChange(token as string, {
        password,
        newEmail: address,
        twoFactorCode: step === "twofactor" || code ? code.trim() || undefined : undefined,
      });
      setSentTo(address);
      setCode("");
      setStep("sent");
      setSentAgain(opts.again);
    } catch (err) {
      if (!(err instanceof EmailChangeApiError)) {
        setFormError(MESSAGES.generic);
      } else if (err.code === EMAIL_CHANGE_WRONG_PASSWORD) {
        setCode("");
        setPasswordError(MESSAGES.passwordWrong);
        setStep("password");
        focusId.current = "ec-password";
      } else if (err.code === EMAIL_CHANGE_TWO_FACTOR_REQUIRED) {
        setCode("");
        setCodeError(null);
        setStep("twofactor");
        focusId.current = "ec-code";
      } else if (err.code === EMAIL_CHANGE_TWO_FACTOR_INVALID) {
        setCodeError(MESSAGES.codeWrong);
        setStep("twofactor");
        focusId.current = "ec-code";
      } else if (err.code === EMAIL_CHANGE_CONSENT_PENDING) {
        setBlocked(true);
      } else if (err.code === EMAIL_CHANGE_NOT_ACCEPTED) {
        setEmailError(MESSAGES.emailNotAccepted);
        setStep("newEmail");
        focusId.current = "ec-new-email";
      } else if (err.status === 429) {
        setFormError(MESSAGES.tooMany);
      } else if (err.code === "email_change_unavailable") {
        setFormError(MESSAGES.unavailable);
      } else {
        setFormError(err.status === undefined ? err.message : MESSAGES.generic);
      }
    } finally {
      setBusy(false);
    }
  }

  const backLink = (
    <button type="button" className="ec__back" onClick={back} aria-label="Back">
      &larr;
    </button>
  );
  const cancelLink = (
    <Link to="/settings/account/information" className="ec__btn">
      Cancel
    </Link>
  );

  if (blocked) {
    return (
      <div className="ec">
        <Link to="/settings/account/information" className="ec__back" aria-label="Back to Account Information">
          &larr;
        </Link>
        <div className="ec__header" role="alert">
          <h2 className="ec__title">Change email</h2>
          <p className="ec__lead">{MESSAGES.consentPending}</p>
        </div>
        <div className="ec__actions">
          <Link to="/settings/account/information" className="ec__btn">
            Back to Account Information
          </Link>
        </div>
      </div>
    );
  }

  if (step === "password") {
    return (
      <form className="ec" onSubmit={handlePasswordContinue} noValidate>
        {backLink}
        <div className="ec__header">
          <h2 className="ec__title">Change email</h2>
          <p className="ec__lead">Enter your password to continue.</p>
        </div>
        <div className="ec__field">
          <label className="ec__label" htmlFor="ec-password">
            Password
          </label>
          <input
            id="ec-password"
            type="password"
            autoComplete="current-password"
            className={`ec__input${passwordError ? " ec__input--error" : ""}`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordError ? "ec-password-error" : undefined}
          />
          {passwordError && <FieldError id="ec-password-error">{passwordError}</FieldError>}
        </div>
        {passwordError === MESSAGES.passwordWrong ? (
          <p className="ec__note">
            <Link to="/forgot-password" className="ec__link">
              Forgot your password?
            </Link>
          </p>
        ) : (
          <p className="ec__note">We’ll send a link to your new address. Your email changes only when you use it.</p>
        )}
        <div className="ec__actions">
          <button type="submit" className="ec__btn ec__btn--primary">
            Continue
          </button>
          {cancelLink}
        </div>
      </form>
    );
  }

  if (step === "newEmail") {
    return (
      <form
        className="ec"
        onSubmit={(e) => {
          e.preventDefault();
          void send({ again: false });
        }}
        noValidate
      >
        {backLink}
        <div className="ec__header">
          <h2 className="ec__title">Change email</h2>
          <p className="ec__lead">Enter the new address you want to use.</p>
        </div>
        <div className="ec__field">
          <label className="ec__label" htmlFor="ec-new-email">
            New email address
          </label>
          <input
            id="ec-new-email"
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            className={`ec__input${emailError ? " ec__input--error" : ""}`}
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            disabled={busy}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? "ec-new-email-error" : undefined}
          />
          {emailError && <FieldError id="ec-new-email-error">{emailError}</FieldError>}
        </div>
        <p className="ec__note">We’ll send a link to this address. Your email changes only after you use that link.</p>
        {formError && <FieldError id="ec-form-error">{formError}</FieldError>}
        <div className="ec__actions">
          <button type="submit" className="ec__btn ec__btn--primary" disabled={busy}>
            {busy ? "Sending…" : "Send link"}
          </button>
          {cancelLink}
        </div>
      </form>
    );
  }

  if (step === "twofactor") {
    return (
      <form
        className="ec"
        onSubmit={(e) => {
          e.preventDefault();
          void send({ again: false });
        }}
        noValidate
      >
        {backLink}
        <div className="ec__header">
          <h2 className="ec__title">Change email</h2>
          <p className="ec__lead">
            {useBackupCode ? "Enter one of your backup codes." : "Enter the 6-digit code from your authenticator app."}
          </p>
        </div>
        <div className="ec__field">
          <label className="ec__label" htmlFor="ec-code">
            {useBackupCode ? "Backup code" : "Authenticator code"}
          </label>
          <input
            id="ec-code"
            inputMode={useBackupCode ? "text" : "numeric"}
            autoComplete="one-time-code"
            placeholder={useBackupCode ? "" : "000000"}
            className={`ec__input${codeError ? " ec__input--error" : ""}`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={busy}
            aria-invalid={codeError ? true : undefined}
            aria-describedby={codeError ? "ec-code-error" : undefined}
          />
          {codeError && <FieldError id="ec-code-error">{codeError}</FieldError>}
        </div>
        <p className="ec__note">
          {useBackupCode ? "Have your authenticator app again? " : "Can’t use your authenticator app? "}
          <button
            type="button"
            className="ec__link"
            onClick={() => {
              setUseBackupCode((v) => !v);
              setCode("");
              setCodeError(null);
            }}
          >
            {useBackupCode ? "Use the app code instead." : "Use a backup code instead."}
          </button>
        </p>
        {formError && <FieldError id="ec-form-error">{formError}</FieldError>}
        <div className="ec__actions">
          <button type="submit" className="ec__btn ec__btn--primary" disabled={busy}>
            {busy ? "Sending…" : "Continue"}
          </button>
          {cancelLink}
        </div>
      </form>
    );
  }

  // step === "sent"
  return (
    <div className="ec">
      {backLink}
      <div className="ec__disc" aria-hidden="true">
        <img src={mailIcon} alt="" width={28} height={28} />
      </div>
      <div className="ec__header" role="status">
        <h2 className="ec__title">Check your inbox</h2>
        <p className="ec__lead">We sent a link to {sentTo}.</p>
      </div>
      <p className="ec__note ec__note--md">
        Your email stays the same until you use the link. The link only works for a limited time.
      </p>
      <Callout>{OLD_ADDRESS_NOTICE}</Callout>
      {isMinor && <Callout>{GUARDIAN_NOTICE}</Callout>}
      {sentAgain && (
        <p className="ec__note ec__note--md" role="status">
          {MESSAGES.sentAgain}
        </p>
      )}
      {formError && <FieldError id="ec-form-error">{formError}</FieldError>}
      <div className="ec__actions">
        <button type="button" className="ec__btn" disabled={busy} onClick={() => void send({ again: true })}>
          Send the link again
        </button>
        <button
          type="button"
          className="ec__btn"
          onClick={() => {
            setFormError(null);
            setSentAgain(false);
            setStep("newEmail");
          }}
        >
          Use a different address
        </button>
      </div>
    </div>
  );
}
