// "Verify your email" prompt (B-125, Decision Log #367/#403 item 15) -- where
// an account whose `nextStep` is `verify_email` lands after register or login,
// and where the Club Picker sends someone whose join was refused with
// `email_verification_required`.
//
// Figma: the Verify Email prompt family 6750:29378 (default), 6750:29429
// (resend sent) and 6750:29480 (rate limited), mobile 6750:29531 / 29582 /
// 29633. The "Resend verification email" control (QA D-08, B-128) posts the
// signed-in account's own email to POST /auth/resend-verification-email. The
// server answers every outcome with the same generic 200, so the "sent"
// message is worded conditionally ("If that email belongs to an account that
// still needs to be verified ..."), exactly as the frame draws it; a 429 from
// the per-IP throttle shows the "too many requests" line.
// Wording tagged [COPY PENDING LEGAL REVIEW] in the frame is implemented as
// drawn and listed in docs/pending-copy-manifest.md.
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { AuthApiError, resendVerificationEmail } from "../api/auth";
import { getUser } from "../api/users";
import { ONBOARDING_ROUTES } from "../lib/onboarding";
import { decodeAccessToken, getStoredAccessToken } from "../lib/session";
import { verifyThemeVars } from "./verify-email/verifyEmailThemeVars";
import "./verify-email/VerifyEmail.css";

const SUPPORT_MAILTO_HREF = "mailto:support@soccernity.com?subject=Email%20verification%20help";

const STEPS = [
  { title: "Open the email from Soccernity", body: "Tap the link inside it. It works on any device." },
  { title: "Can't see it?", body: "Check your spam or junk folder, and that the address above is the one you used." },
  { title: "Link no longer works?", body: "Contact support and we will confirm your account for you." },
];

export default function VerifyEmailPromptPage() {
  const token = getStoredAccessToken();
  const userId = token ? decodeAccessToken(token)?.sub : undefined;
  const [email, setEmail] = useState<string | null>(null);
  const [alreadyVerified, setAlreadyVerified] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "limited" | "error">("idle");

  useEffect(() => {
    if (!token || !userId) return;
    let cancelled = false;
    getUser(token, userId)
      .then((user) => {
        if (cancelled) return;
        setEmail(user.email);
        setAlreadyVerified(user.verificationStatus === "verified");
      })
      .catch(() => {
        // Not fatal: the prompt still works without echoing the address.
      });
    return () => {
      cancelled = true;
    };
  }, [token, userId]);

  async function handleResend() {
    if (!email) return;
    setResendState("sending");
    try {
      await resendVerificationEmail(email);
      setResendState("sent");
    } catch (err) {
      setResendState(err instanceof AuthApiError && err.status === 429 ? "limited" : "error");
    }
  }

  if (!token || !userId) return <Navigate to="/login" replace />;
  if (alreadyVerified) return <Navigate to={ONBOARDING_ROUTES.resolve} replace />;

  return (
    <div className="verify-page" style={verifyThemeVars} data-testid="verify-email-prompt">
      <div className="verify-page__column">
        <div className="verify-icon-circle verify-icon-circle--neutral" aria-hidden="true">
          ✉
        </div>
        <div className="verify-header">
          <h1 className="verify-heading">Verify your email to continue</h1>
          <p className="verify-subheading">
            {email ? `We sent a verification link to ${email}. ` : "We sent you a verification link. "}
            Once you have opened it you can finish setting up your profile.
          </p>
        </div>
        <div className="verify-card">
          <p className="verify-card__title">What to do</p>
          <div className="verify-list">
            {STEPS.map((row, index) => (
              <div className="verify-row" key={row.title}>
                <span className="verify-row__icon" aria-hidden="true">
                  {index + 1}
                </span>
                <div className="verify-row__text">
                  <p className="verify-row__title">{row.title}</p>
                  <p className="verify-row__body">{row.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="verify-actions">
          <Link to={ONBOARDING_ROUTES.resolve} className="verify-button verify-button--primary">
            I&rsquo;ve verified &mdash; continue
          </Link>
          <a href={SUPPORT_MAILTO_HREF} className="verify-button verify-button--secondary">
            Contact support
          </a>
        </div>
        {email && (
          <div className="verify-resend">
            <button
              type="button"
              className="verify-link-button"
              onClick={handleResend}
              disabled={resendState === "sending"}
            >
              Resend verification email [COPY PENDING LEGAL REVIEW]
            </button>
            {resendState === "sent" && (
              <p className="verify-resend__message" role="status">
                If that email belongs to an account that still needs to be verified, a new verification link has been
                sent.
              </p>
            )}
            {resendState === "limited" && (
              <p className="verify-resend__message" role="alert">
                Too many requests. Please try again in a little while. [COPY PENDING LEGAL REVIEW]
              </p>
            )}
            {resendState === "error" && (
              <p className="verify-resend__message" role="alert">
                Couldn&rsquo;t send that just now. Please try again shortly.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
