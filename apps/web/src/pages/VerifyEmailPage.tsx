// Verify Email (Build Plan Section 4.1 / Sprint 1 exit criterion, PR F7).
// Figma source: "Verify Email -- 1 Verifying" (5143:6635), "-- 2 Verified"
// (5143:6648), "-- 3 Link Invalid Or Expired" (5143:6661), "-- 4 Missing
// Token" (5143:6674), "Soccernity-MVP" file (weZWWqggy9j13eX8bhFgs6).
// Route: /verify-email?token=<verificationToken>. Public and
// unauthenticated, deliberately -- mirroring GuardianConsentConfirmPage's
// own trust model exactly: the user clicking the emailed link is not
// necessarily signed in yet.
//
// Modeled directly on GuardianConsentConfirmPage.tsx's established
// pattern for this same shape of flow: token read from ?token= via
// useSearchParams, missing-token branch checked before anything else (and
// before any API call ever fires), a generic, non-enumerating error
// message on an invalid/expired token (see verifyEmail() in
// ../api/auth.ts).
//
// CTA DESTINATION DECISION (flagged, not silently picked): the Figma
// frame's primary "Continue to Soccernity" button on the Verified state
// has no single obvious real destination in this app today.
// HomePage.tsx (route "/") is still a PlaceholderPage stub ("a future
// sprint, not yet scheduled") -- not a real authenticated landing page.
// ProfilePage.tsx (route "/profile") is the one real, fully-built
// authenticated destination that exists right now, so the CTA routes
// there instead of "/".
//
// OPEN PRODUCT DECISION, carried forward rather than resolved here (see
// this PR's own report): the Verified state's "Under-18 accounts may
// still be waiting" row is a disclosure only. { verified, userId } (the
// real POST /auth/verify-email response shape) carries no consent-status
// field to branch on, and nothing here redirects a pending-consent minor
// to a different view -- every successful verification renders this same
// state regardless of isMinor/consent status. Whether it should route
// differently for a pending-consent minor is left open, matching the
// merged design PR's own report.
//
// RECOVERY-AFFORDANCE GAP (flagged, not silently resolved): the Figma
// frames for states 3 and 4 both show a secondary "Contact support"
// button, but no resend-verification endpoint and no support/contact
// destination (mailto, /contact route, etc.) exist anywhere in this
// codebase (grepped services/api/src for "resend" -- the only hit is the
// unrelated POST /auth/guardian-consent/resend; grepped apps/web/src for
// "mailto:"/"support@"/"contact" -- zero matches). Rendered here as a
// disabled button rather than a dead link or a button bound to nothing --
// visually present (matching the Figma layout), but explicitly inert, not
// pretending to work.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { verifyEmail, AuthApiError } from "../api/auth";
import { darkVerifyThemeVars } from "./verify-email/verifyEmailThemeVars";
import "./verify-email/VerifyEmail.css";

const GENERIC_ERROR_MESSAGE = "This verification link is invalid or has expired.";

const NO_SUPPORT_CHANNEL_TITLE =
  "There is no dedicated support contact yet -- please try the link from your email again, or reach out through wherever you originally signed up.";

type Status = "verifying" | "verified" | "error" | "missing";

const WHAT_HAPPENS_NEXT = [
  {
    title: "Your email address is confirmed",
    body: "You will not be asked to verify this address again.",
  },
  {
    title: "Sign in any time",
    body: "Use your email and password to get back into Soccernity.",
  },
  {
    title: "Under-18 accounts may still be waiting",
    body: "If a guardian approval is still pending, some features stay switched off until it is approved.",
  },
];

const LINK_INVALID_STEPS = [
  {
    title: "Open the link straight from your email",
    body: "Tapping the link in the email works more reliably than copying and pasting it.",
  },
  {
    title: "Check the whole link was included",
    body: "Some email apps split long links across lines, which cuts off part of the token.",
  },
  {
    title: "Still stuck? Contact the Soccernity team",
    body: "We can confirm your account manually if the link will not work.",
  },
];

const MISSING_TOKEN_STEPS = [
  {
    title: "The address was typed by hand",
    body: "The token is too long to retype accurately -- always open the link itself.",
  },
  {
    title: "Only part of the link was copied",
    body: "Copy from the first character through to the very last one.",
  },
];

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<Status>(token ? "verifying" : "missing");
  const [errorMessage, setErrorMessage] = useState(GENERIC_ERROR_MESSAGE);

  useEffect(() => {
    if (!token) {
      setStatus("missing");
      return;
    }

    let cancelled = false;
    setStatus("verifying");

    verifyEmail(token)
      .then(() => {
        if (!cancelled) setStatus("verified");
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof AuthApiError ? error.message : GENERIC_ERROR_MESSAGE);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="verify-page" style={darkVerifyThemeVars} data-testid="verify-email-page">
      <div className="verify-page__column">
        {status === "verifying" && (
          <div className="verify-card verify-card--centered">
            <div className="verify-spinner" role="status" aria-label="Verifying" />
            <div className="verify-header verify-header--centered">
              <h1 className="verify-heading">Verifying your email…</h1>
              <p className="verify-subheading">This only takes a moment. Please keep this tab open.</p>
            </div>
          </div>
        )}

        {status === "verified" && (
          <>
            <div className="verify-icon-circle verify-icon-circle--success" aria-hidden="true">
              ✓
            </div>
            <div className="verify-header">
              <h1 className="verify-heading">Email verified</h1>
              <p className="verify-subheading">
                Your email address is confirmed. You can sign in to Soccernity from now on.
              </p>
            </div>
            <div className="verify-card">
              <p className="verify-card__title">What happens next</p>
              <div className="verify-list">
                {WHAT_HAPPENS_NEXT.map((row) => (
                  <div className="verify-row" key={row.title}>
                    <span className="verify-row__icon" aria-hidden="true">
                      ✓
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
              <Link to="/profile" className="verify-button verify-button--primary">
                Continue to Soccernity
              </Link>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div className="verify-icon-circle verify-icon-circle--neutral" aria-hidden="true">
              !
            </div>
            <div className="verify-header">
              <h1 className="verify-heading">This verification link is no longer valid</h1>
              <p className="verify-subheading" role="alert">
                {errorMessage}
              </p>
            </div>
            <div className="verify-card">
              <p className="verify-card__title">What to do next</p>
              <div className="verify-list">
                {LINK_INVALID_STEPS.map((row, index) => (
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
              <Link to="/login" className="verify-button verify-button--primary">
                Back to sign in
              </Link>
              <button
                type="button"
                className="verify-button verify-button--secondary"
                disabled
                title={NO_SUPPORT_CHANNEL_TITLE}
              >
                Contact support
              </button>
            </div>
          </>
        )}

        {status === "missing" && (
          <>
            <div className="verify-icon-circle verify-icon-circle--neutral" aria-hidden="true">
              !
            </div>
            <div className="verify-header">
              <h1 className="verify-heading">This link is missing its verification token</h1>
              <p className="verify-subheading" role="alert">
                Please use the exact link from the email you received. The address needs everything after the
                question mark to work.
              </p>
            </div>
            <div className="verify-card verify-card--tint">
              <p className="verify-card__title">Why this happens</p>
              <div className="verify-list verify-list--tight">
                {MISSING_TOKEN_STEPS.map((row, index) => (
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
              <Link to="/login" className="verify-button verify-button--primary">
                Back to sign in
              </Link>
              <button
                type="button"
                className="verify-button verify-button--secondary"
                disabled
                title={NO_SUPPORT_CHANNEL_TITLE}
              >
                Contact support
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
