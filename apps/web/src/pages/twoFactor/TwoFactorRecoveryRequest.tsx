// "I lost my device AND my backup codes": the sign-in side of user two-factor recovery
// (B-278; backend B-276, Decision Log #455, #456). Opened from the sign-in code prompt
// (TwoFactorCodePrompt, the link "Lost your device and backup codes?"); shared by LoginPage and
// InactiveAccountPage because both use that prompt.
//
// Figma "Soccernity-MVP" (weZWWqggy9j13eX8bhFgs6), desktop / mobile (docs/figma-two-factor-recovery-report.md):
//   1.2a Email and password        6913:34766 / 6913:34796
//   1.2c Too many requests         6913:34894 / 6913:34928
//   1.3a Check your email, cooldown 6913:34962 / 6913:34985
//   1.3b Send again available      6913:35008 / 6913:35031
//   1.3c Send again limit reached  6913:35054 / 6913:35081
//   1.4  Minor: we've asked your guardian  6913:35108 / 6913:35129
//   1.5  Minor, no confirmed guardian email 6913:35150 / 6913:35173
//
// NOT built, on purpose: 1.2b ("Those details didn't work", wrong details or locked). The server
// answers a wrong password, an unknown email, two-factor off and a closed account with the SAME 202
// `{ audience: "account" }` (so the page can never tell them apart), and a lockout is the same plain
// 429 as the request limit (so it is 1.2c). There is no response that frame could be drawn from.
//
// The password is kept in component state ONLY (for "Send again", which re-posts the same request),
// never in storage, the URL or a log, and it is gone when this component unmounts. It is also dropped
// as soon as the answer makes it unnecessary (guardian / no_guardian). The Figma Copy Tag chip covers
// the whole screen; every sentence here is pending legal review (docs/pending-copy-manifest.md).
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  RecoveryApiError,
  isRecoveryUnavailable,
  requestRecovery,
  type RecoveryAudience,
} from "../../api/twoFactorRecovery";
import CopyTag from "./CopyTag";
import "./twoFactor.css";

type Stage = "form" | "sent" | "guardian" | "no_guardian";

// The server's gap between two requests for the same account. The page's own countdown starts here; the
// server's 429 Retry-After corrects it when the two disagree by a second.
const SEND_AGAIN_SECONDS = 60;

interface Props {
  /** Prefill from the sign-in the person just did. */
  email?: string;
  /** Back to the code prompt. */
  onBack: () => void;
  /** Back to the log-in form. */
  onBackToLogin: () => void;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function TwoFactorRecoveryRequest({ email: initialEmail = "", onBack, onBackToLogin }: Props) {
  const [stage, setStage] = useState<Stage>("form");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 1.2c: the request limit on the first step.
  const [tooMany, setTooMany] = useState(false);
  // 1.3: the cooldown, and the "limit reached" state once the server refuses a resend.
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [limitReached, setLimitReached] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [stage]);

  // One tick a second while the cooldown runs (the interval restarts only when it starts or stops).
  const counting = stage === "sent" && secondsLeft > 0;
  useEffect(() => {
    if (!counting) return;
    const id = window.setInterval(() => {
      setSecondsLeft((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [counting]);

  function enterAnswer(audience: RecoveryAudience) {
    if (audience === "guardian") {
      setPassword("");
      setStage("guardian");
    } else if (audience === "no_guardian") {
      setPassword("");
      setStage("no_guardian");
    } else {
      setSecondsLeft(SEND_AGAIN_SECONDS);
      setLimitReached(false);
      setResendError(null);
      setStage("sent");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setTooMany(false);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      const answer = await requestRecovery(email.trim(), password);
      enterAnswer(answer.audience);
    } catch (err) {
      if (err instanceof RecoveryApiError && err.status === 429) {
        setTooMany(true);
      } else if (isRecoveryUnavailable(err)) {
        setError("Recovery isn’t available right now. Please try again in a few minutes.");
      } else {
        setError(err instanceof RecoveryApiError ? err.message : "Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendAgain() {
    if (busy || secondsLeft > 0 || limitReached) return;
    setResendError(null);
    setBusy(true);
    try {
      const answer = await requestRecovery(email.trim(), password);
      enterAnswer(answer.audience);
    } catch (err) {
      if (err instanceof RecoveryApiError && err.status === 429) {
        const wait = err.retryAfterSeconds;
        if (wait !== undefined && wait > 0 && wait <= SEND_AGAIN_SECONDS) {
          // The short gap between two requests, not the hourly limit: wait it out.
          setSecondsLeft(wait);
        } else {
          setLimitReached(true);
        }
      } else if (isRecoveryUnavailable(err)) {
        setResendError("Recovery isn’t available right now. Please try again in a few minutes.");
      } else {
        setResendError(err instanceof RecoveryApiError ? err.message : "Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tf-prompt" data-testid="two-factor-recovery-request" data-stage={stage}>
      <div className="tf-prompt__inner">
        <CopyTag />

        {stage === "form" && (
          <form className="tf-recovery-form" onSubmit={submit} noValidate>
            <h1 className="tf-heading" ref={headingRef} tabIndex={-1}>
              Confirm it’s you
            </h1>
            <p className="tf-lead">
              Enter the email and password for your Soccernity account. We’ll email you a link to continue.
            </p>

            {tooMany && (
              <div className="tf-banner" role="alert">
                <p className="tf-banner__title">Too many requests</p>
                <p className="tf-banner__text">Please wait a while before trying again.</p>
              </div>
            )}

            <div className="tf-field">
              <label className="tf-label" htmlFor="tf-recovery-email">
                Email
              </label>
              <input
                id="tf-recovery-email"
                className="tf-input"
                type="email"
                autoComplete="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="tf-field">
              <label className="tf-label" htmlFor="tf-recovery-password">
                Password
              </label>
              <input
                id="tf-recovery-password"
                className="tf-input"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </div>

            {error && (
              <p className="tf-error" role="alert">
                {error}
              </p>
            )}

            <div className="tf-actions">
              <button type="submit" className="tf-btn tf-btn--primary" disabled={busy}>
                {busy ? "Sending…" : "Continue"}
              </button>
              <button type="button" className="tf-btn tf-btn--ghost" onClick={onBack} disabled={busy}>
                Back
              </button>
            </div>
          </form>
        )}

        {stage === "sent" && (
          <>
            <h1 className="tf-heading" ref={headingRef} tabIndex={-1}>
              Check your email
            </h1>
            <p className="tf-lead">
              If those details are right, we’ve emailed a link to the address on your account. Open it to continue.
            </p>
            <p className="tf-meta">Can’t find it? Check your spam folder.</p>

            {limitReached && (
              <div className="tf-banner" role="alert">
                <p className="tf-banner__title">You’ve asked for too many emails</p>
                <p className="tf-banner__text">Please try again later.</p>
              </div>
            )}
            {resendError && (
              <p className="tf-error" role="alert">
                {resendError}
              </p>
            )}

            <div className="tf-actions">
              <button
                type="button"
                className="tf-btn tf-btn--ghost"
                onClick={sendAgain}
                disabled={busy || secondsLeft > 0 || limitReached}
              >
                {secondsLeft > 0 ? `Send again in ${formatCountdown(secondsLeft)}` : "Send again"}
              </button>
              <button type="button" className="tf-btn tf-btn--primary" onClick={onBackToLogin}>
                Back to log in
              </button>
            </div>
          </>
        )}

        {stage === "guardian" && (
          <>
            <h1 className="tf-heading" ref={headingRef} tabIndex={-1}>
              We’ve asked your guardian
            </h1>
            <p className="tf-lead">
              We’ve emailed the guardian on your account. They need to open the link and approve before two-factor is
              removed.
            </p>
            <p className="tf-meta">
              You don’t need to do anything else. Until then you can still sign in with your authenticator app or a
              backup code.
            </p>
            <div className="tf-actions">
              <button type="button" className="tf-btn tf-btn--primary" onClick={onBackToLogin}>
                Back to log in
              </button>
            </div>
          </>
        )}

        {stage === "no_guardian" && (
          <>
            <h1 className="tf-heading" ref={headingRef} tabIndex={-1}>
              We can’t send this request yet
            </h1>
            <p className="tf-lead">
              We don’t have a confirmed guardian email on your account, so we can’t ask for approval.
            </p>
            <p className="tf-meta">Please contact us and we’ll help you get back into your account.</p>
            <div className="tf-actions">
              <Link to="/contact" className="tf-btn tf-btn--primary tf-btn--link">
                Contact us
              </Link>
              <button type="button" className="tf-btn tf-btn--ghost" onClick={onBackToLogin}>
                Back to log in
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
