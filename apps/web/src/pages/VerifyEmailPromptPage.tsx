// "Verify your email" prompt (B-125, Decision Log #367/#403 item 15) -- where
// an account whose `nextStep` is `verify_email` lands after register or login,
// and where the Club Picker sends someone whose join was refused with
// `email_verification_required`.
//
// NO FIGMA FRAME exists for this screen (the Verify Email family covers only
// the page the emailed link opens: Verifying / Verified / Link invalid /
// Missing token). Built plainly from the verify-email card classes, the same
// "no dedicated screen, built plain and flagged" precedent
// ClubPickerStep.tsx and ChangeGuardianEmailPage.tsx set. There is NO
// resend-verification endpoint yet (Decision Log #37), so this screen cannot
// offer a resend; it points at the real support mailbox instead.
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { getUser } from "../api/users";
import { ONBOARDING_ROUTES } from "../lib/onboarding";
import { decodeAccessToken, getStoredAccessToken } from "../lib/session";
import { darkVerifyThemeVars } from "./verify-email/verifyEmailThemeVars";
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

  if (!token || !userId) return <Navigate to="/login" replace />;
  if (alreadyVerified) return <Navigate to={ONBOARDING_ROUTES.resolve} replace />;

  return (
    <div className="verify-page" style={darkVerifyThemeVars} data-testid="verify-email-prompt">
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
      </div>
    </div>
  );
}
