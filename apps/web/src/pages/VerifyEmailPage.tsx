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
// PENDING-CONSENT-MINOR STATE -- RESOLVED (Decision Log #38,
// sprint-2/verify-email-support-and-consent-view): `POST
// /auth/verify-email` now returns an additive `guardianConsentStatus`
// field (see VerifyEmailResult in registration.service.ts and
// VerifyEmailResponse in ../api/auth.ts). A minor whose
// `guardianConsentStatus === 'pending'` now gets a genuinely distinct
// render branch (see the `verified-pending-consent` status below) instead
// of the ordinary Verified state's "full access" framing. Checked Figma
// directly before building anything (get_design_context on "Verify Email
// -- 2 Verified", 5143:6648): it renders one single generic Verified
// layout with no consent-status branch anywhere -- there is still no
// dedicated Figma frame for this state, confirming CLAUDE.md's own
// documented history (PR #107 lists it as a founder-blocked, never-
// designed product decision). The `verified-pending-consent` block below
// is therefore a CONSERVATIVE INTERIM DESIGN, built without a matching
// Figma source, not a finished Figma-sourced screen -- see its own inline
// comment further down for the full detail, matching this project's
// established "flagged, not invented as if real" discipline (see e.g.
// EditProfileModal.tsx's disabled unbacked fields, or how ClubPickerStep
// was flagged before it had a real Figma screen).
//
// RECOVERY-AFFORDANCE GAP -- RESOLVED (Decision Log #37,
// sprint-2/verify-email-support-and-consent-view): the founder has
// confirmed the real support destination, `support@soccernity.com`. The
// "Contact support" button on states 3 and 4 is now a real, enabled
// `mailto:` link rather than a disabled placeholder.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { verifyEmail, AuthApiError } from "../api/auth";
import { darkVerifyThemeVars } from "./verify-email/verifyEmailThemeVars";
import "./verify-email/VerifyEmail.css";

const GENERIC_ERROR_MESSAGE = "This verification link is invalid or has expired.";

// Decision Log #37: real support destination, confirmed by the founder.
// A plain subject prefill only -- no body -- per this task's own "keep it
// simple, don't over-engineer" guidance; the person can add whatever
// context they need once their email client opens.
const SUPPORT_MAILTO_HREF = "mailto:support@soccernity.com?subject=Email%20verification%20help";

type Status = "verifying" | "verified" | "verified-pending-consent" | "error" | "missing";

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

// PENDING-CONSENT-MINOR STATE content -- see this file's own header
// comment for why this whole branch is a conservative, non-Figma-sourced
// interim design (Decision Log #38). Deliberately distinct from
// WHAT_HAPPENS_NEXT above, not a copy of it with one row swapped -- this
// state must never claim the same "you're all set" framing the ordinary
// Verified state uses.
const PENDING_CONSENT_STEPS = [
  {
    title: "Your email address is confirmed",
    body: "You will not be asked to verify this address again.",
  },
  {
    title: "Your account is still restricted",
    body: "Your guardian has not yet approved your account. Some features stay switched off until they do.",
  },
  {
    title: "Check your live status any time",
    body: "See exactly what is switched off, and resend the approval request, from your guardian consent status page.",
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
      .then((result) => {
        if (cancelled) return;
        // Decision Log #38: branch on the real, additive
        // guardianConsentStatus field rather than always rendering the
        // ordinary "you're all set" Verified state.
        setStatus(result.guardianConsentStatus === "pending" ? "verified-pending-consent" : "verified");
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

        {/* CONSERVATIVE INTERIM DESIGN -- no Figma frame exists for this
            state (see this file's own header comment, Decision Log #38).
            Deliberately reuses the ordinary Verified state's icon/card/
            button scaffolding and CSS classes -- the email genuinely was
            verified, so the same success icon is honest here -- but the
            heading, body copy, list content, and CTA are all distinct:
            this branch must never claim full access ("you can sign in...
            from now on" / "Continue to Soccernity") the way the ordinary
            Verified state does. Links to the real, existing
            /guardian-consent route (GuardianConsentPage.tsx), where the
            minor can see their live status and trigger a resend -- never
            re-derives or guesses that status here. */}
        {status === "verified-pending-consent" && (
          <>
            <div className="verify-icon-circle verify-icon-circle--success" aria-hidden="true">
              ✓
            </div>
            <div className="verify-header">
              <h1 className="verify-heading">Email verified — approval still pending</h1>
              <p className="verify-subheading">
                Your email address is confirmed, but your account is still waiting on your guardian&rsquo;s
                approval. It stays restricted until they approve it.
              </p>
            </div>
            <div className="verify-card">
              <p className="verify-card__title">What this means right now</p>
              <div className="verify-list">
                {PENDING_CONSENT_STEPS.map((row, index) => (
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
              <Link to="/guardian-consent" className="verify-button verify-button--primary">
                Check my guardian consent status
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
              <a href={SUPPORT_MAILTO_HREF} className="verify-button verify-button--secondary">
                Contact support
              </a>
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
              <a href={SUPPORT_MAILTO_HREF} className="verify-button verify-button--secondary">
                Contact support
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
