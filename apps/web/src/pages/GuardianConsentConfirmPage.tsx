// Guardian Consent -- guardian's own confirmation view (Build Plan Section
// 8.3 step 4). Figma source: "Guardian Consent -- 4 Web Consent
// Confirmation", node 5108:6629, "Soccernity-MVP" file
// (weZWWqggy9j13eX8bhFgs6).
//
// Route: /guardian-consent/confirm?token=<consentToken>. Public and
// unauthenticated -- deliberately -- mirroring the backend's own trust
// model exactly: POST /auth/guardian-consent has no JwtAuthGuard because
// the guardian clicking the emailed link is not a Soccernity account
// holder at all (guardian-consent.controller.ts's own header comment).
// Modeled directly on ResetPasswordPage.tsx's established pattern for
// this same shape of flow: token read from ?token= via useSearchParams,
// an unauthenticated POST, generic error messaging for an invalid/expired
// token (this endpoint's own non-enumeration posture -- see
// guardian-consent.service.ts's confirmConsent()).
//
// F5 ROUTING DECISION (argued here, not silently picked -- see this PR's
// description for the full writeup): this is a NEW route,
// /guardian-consent/confirm, split out from the pre-existing
// /guardian-consent route (which stays the MINOR's own authenticated
// status view -- see GuardianConsentPage.tsx). Two structurally different
// audiences/auth states -- an unauthenticated guardian confirming via an
// emailed token vs. an authenticated minor checking their own status --
// don't belong behind one route/component, and this split mirrors the
// backend's own POST /auth/guardian-consent vs. GET
// /auth/guardian-consent/status split exactly.
//
// FIGMA-VS-SPEC CONFLICT (flagged, not silently resolved -- see this PR's
// description): the source frame renders a personalized "Request Summary"
// panel (the minor's name, date of birth, the guardian's named
// relationship, and the request date) above the safeguarding-education
// content below. Rendering that requires a GET-by-consent-token lookup
// endpoint that does not exist anywhere in Section 4.1 or in the merged
// sprint-1/f5-f6-missing-endpoints PR -- POST /auth/guardian-consent
// accepts a token and returns only `{ message }`, nothing to read back
// before the guardian decides. Rather than invent that endpoint (out of
// this task's frontend-only scope) or fabricate placeholder data as if it
// were real, that summary panel is omitted entirely; the safeguarding
// education content below it (what the account can do / what's collected
// / what stays off) is real, generic, non-personalized product copy from
// the same frame and is kept.
//
// The Figma frame's "I do not consent" button has no matching backend
// action either -- there is no decline/reject endpoint, only confirm.
// Declining is therefore modeled as "take no action" (the account simply
// stays in its existing restricted-pending state, which is already true
// without any call), not as a button that silently does nothing when
// clicked -- clicking it shows an explicit inline message saying exactly
// that, rather than a no-op.
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { confirmGuardianConsent, AuthApiError } from "../api/auth";
import { darkConsentThemeVars } from "./guardian-consent/consentThemeVars";
import "./guardian-consent/GuardianConsent.css";

const GENERIC_ERROR_MESSAGE =
  "This link is invalid or has expired. Ask the account holder to resend the approval request from their account.";

type Status = "idle" | "submitting" | "confirmed" | "error";

const WHAT_THEY_CAN_DO = [
  {
    title: "Build a player profile",
    body: "Position, club or school team, and stats they add themselves.",
  },
  {
    title: "Follow teams and check scores",
    body: "Browse the Sports Hub and follow grassroots and pro fixtures.",
  },
  {
    title: "Post and comment in Community",
    body: "Share updates and reply to other players. Everything is moderated.",
  },
  {
    title: "Join Banter Rooms & Community Groups",
    body: "Group chats and community spaces about matches, with under-18 safety settings applied.",
  },
];

const WHAT_STAYS_OFF = [
  {
    title: "Public search engine listing",
    body: "The profile will not be indexed by Google or shown to logged-out visitors.",
  },
  {
    title: "Messages from unverified accounts",
    body: "Only accounts they follow can start a direct message.",
  },
  {
    title: "Targeted advertising",
    body: "Under-18 accounts are excluded from ad targeting.",
  },
];

export default function GuardianConsentConfirmPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [declined, setDeclined] = useState(false);
  const [errorMessage, setErrorMessage] = useState(GENERIC_ERROR_MESSAGE);

  async function handleConsent(event: FormEvent) {
    event.preventDefault();
    if (!token || !agreed) return;

    setStatus("submitting");
    try {
      await confirmGuardianConsent(token);
      setStatus("confirmed");
    } catch (error) {
      setErrorMessage(error instanceof AuthApiError ? error.message : GENERIC_ERROR_MESSAGE);
      setStatus("error");
    }
  }

  return (
    <div className="consent-page" style={darkConsentThemeVars} data-testid="guardian-consent-confirm-page">
      <div className="consent-page__column">
        {!token ? (
          <div className="consent-card">
            <p className="consent-status-message consent-status-message--error" role="alert">
              This link is missing its approval token. Please use the exact link from the email you received.
            </p>
          </div>
        ) : status === "confirmed" ? (
          <div className="consent-card">
            <h1 className="consent-page__heading">Thank you</h1>
            <p className="consent-status-message" role="status">
              Your approval has been recorded. The account is now active -- you can close this page.
            </p>
          </div>
        ) : (
          <>
            <div className="consent-card">
              <p className="consent-eyebrow">GUARDIAN CONSENT REQUEST</p>
              <h1 className="consent-page__heading">Do you give permission for this account to be activated?</h1>
              <p className="consent-page__subheading">
                You were named as the parent or guardian for a new Soccernity account. Please read this before you
                decide -- it explains what the account can do and what we collect.
              </p>
            </div>

            <div className="consent-card">
              <p className="consent-card__title">What the account holder will be able to do</p>
              <div className="consent-list">
                {WHAT_THEY_CAN_DO.map((row) => (
                  <div className="consent-row" key={row.title}>
                    <span className="consent-row__icon consent-row__icon--on" aria-hidden="true">
                      ✓
                    </span>
                    <div className="consent-row__text">
                      <span className="consent-row__title">{row.title}</span>
                      <span className="consent-row__body">{row.body}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="consent-card">
              <p className="consent-card__title">What stays switched off for under-18 accounts</p>
              <div className="consent-list">
                {WHAT_STAYS_OFF.map((row) => (
                  <div className="consent-row" key={row.title}>
                    <span className="consent-row__icon consent-row__icon--off" aria-hidden="true">
                      –
                    </span>
                    <div className="consent-row__text">
                      <span className="consent-row__title">{row.title}</span>
                      <span className="consent-row__body">{row.body}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {declined ? (
              <div className="consent-card consent-card--tint">
                <p className="consent-status-message" role="status">
                  Understood -- you don&rsquo;t need to do anything else. The account will remain restricted and
                  pending until you decide to approve it from this same link.
                </p>
              </div>
            ) : (
              <form onSubmit={handleConsent}>
                <div className="consent-card" style={{ gap: "24px" }}>
                  <div className="consent-checkbox-row">
                    <input
                      type="checkbox"
                      id="consent-confirm-checkbox"
                      checked={agreed}
                      onChange={(event) => setAgreed(event.target.checked)}
                    />
                    <label htmlFor="consent-confirm-checkbox">
                      I confirm I am this account holder&rsquo;s parent or legal guardian, and I give permission for
                      this account to be activated.{" "}
                      <span className="consent-fineprint">[COPY PENDING LEGAL REVIEW]</span>
                    </label>
                  </div>

                  {status === "error" && (
                    <p className="consent-status-message consent-status-message--error" role="alert">
                      {errorMessage}
                    </p>
                  )}

                  <div className="consent-actions">
                    <button
                      type="submit"
                      className="consent-button consent-button--primary"
                      disabled={!agreed || status === "submitting"}
                    >
                      {status === "submitting" ? "Submitting…" : "I consent"}
                    </button>
                    <button
                      type="button"
                      className="consent-button consent-button--secondary"
                      onClick={() => setDeclined(true)}
                      disabled={status === "submitting"}
                    >
                      I do not consent
                    </button>
                  </div>

                  <p className="consent-footnote">
                    Declining keeps the account restricted and pending.{" "}
                    <span className="consent-fineprint">
                      [COPY PENDING LEGAL REVIEW -- expiry/deletion/withdrawal copy from the Figma frame is not
                      reproduced here since it isn't backed by a real policy yet.]
                    </span>{" "}
                    Read our <Link to="/">Privacy Policy</Link>.
                  </p>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
