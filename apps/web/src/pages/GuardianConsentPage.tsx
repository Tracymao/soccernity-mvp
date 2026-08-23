// Guardian Consent -- the MINOR's own authenticated status view.
// Figma sources: "Guardian Consent -- 5 Restricted Pending State"
// (5108:6630) and "Guardian Consent -- 6 Activation Confirmation"
// (5108:6631), "Soccernity-MVP" file (weZWWqggy9j13eX8bhFgs6). Renders one
// or the other based on the real GET /auth/guardian-consent/status
// response's consentStatus -- never a route param, never guessed.
//
// F5 ROUTING DECISION: this route (/guardian-consent) stays the minor's
// own status view -- see GuardianConsentConfirmPage.tsx's header comment
// for the full argument, including why the guardian's confirmation flow
// was split into a separate, new /guardian-consent/confirm route instead
// of living here.
//
// Auth: GET /auth/guardian-consent/status is JwtAuthGuard-only (the caller
// checking their OWN status), so this page needs a real access token --
// read via src/lib/session.ts, the only real session mechanism this app
// has today (see that file's own comment). No AuthContext/route-guarding
// exists yet, so a visit with no session present renders an explicit
// "log in to see this" state rather than crashing or silently calling the
// API with no token.
//
// RESTRICTED-PENDING SCOPE: the Figma frame for screen 5 carries its own
// "SCOPE OPEN" annotation asking whether restricted-pending also limits
// Grassroots record-keeping and Sports Hub. Per this PR's brief and
// auth/README.md's own documented scope (Section 8.3 step 5, verbatim:
// "no public profile visibility, no DMs from unverified accounts, no
// participation in Banter Rooms beyond read-only"), only those three
// restrictions are rendered below -- the open scope question is left
// exactly as open as the Figma frame itself left it, not resolved here.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  AuthApiError,
  getGuardianConsentStatus,
  resendGuardianConsentRequest,
  type GuardianConsentStatus,
} from "../api/auth";
import { getStoredAccessToken } from "../lib/session";
import { darkConsentThemeVars } from "./guardian-consent/consentThemeVars";
import "./guardian-consent/GuardianConsent.css";

type LoadState = "loading" | "loaded" | "not-a-minor" | "error" | "no-session";

const RESTRICTIONS = [
  {
    title: "Your profile is hidden",
    body: "Nobody can find you in search or open your profile page.",
  },
  {
    title: "Direct messages are off",
    body: "Accounts you have not verified cannot message you.",
  },
  {
    title: "Banter Rooms & Community Groups are read-only",
    body: "You can read posts and conversations, but you cannot post in either.",
  },
];

const NOW_UNLOCKED = [
  {
    title: "Your profile is visible",
    body: "Other Soccernity members can find and view your profile.",
  },
  {
    title: "Direct messages are on",
    body: "People you follow can message you.",
  },
  {
    title: "You can post in Banter Rooms & Community Groups",
    body: "Join the conversation in both, not just read it.",
  },
];

export default function GuardianConsentPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [status, setStatus] = useState<GuardianConsentStatus | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const token = getStoredAccessToken();

  const loadStatus = useCallback(async () => {
    if (!token) {
      setLoadState("no-session");
      return;
    }
    setLoadState("loading");
    try {
      const result = await getGuardianConsentStatus(token);
      setStatus(result);
      setLoadState("loaded");
    } catch (error) {
      if (error instanceof AuthApiError && error.status === 404) {
        setLoadState("not-a-minor");
      } else {
        setLoadState("error");
      }
    }
  }, [token]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleResend() {
    if (!status) return;
    setResendState("sending");
    try {
      await resendGuardianConsentRequest(status.guardianEmail);
      setResendState("sent");
    } catch {
      setResendState("error");
    }
  }

  if (loadState === "no-session") {
    return (
      <div className="consent-page" style={darkConsentThemeVars}>
        <div className="consent-page__column">
          <div className="consent-card">
            <p className="consent-status-message" role="status">
              Log in to see your guardian consent status.
            </p>
            <div className="consent-actions">
              <Link to="/login" className="consent-button consent-button--primary" style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                Log in
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loadState === "loading") {
    return (
      <div className="consent-page" style={darkConsentThemeVars}>
        <div className="consent-page__column">
          <p className="consent-status-message" role="status">
            Loading your account status…
          </p>
        </div>
      </div>
    );
  }

  if (loadState === "not-a-minor") {
    return (
      <div className="consent-page" style={darkConsentThemeVars}>
        <div className="consent-page__column">
          <div className="consent-card">
            <p className="consent-status-message" role="status">
              This page only applies to accounts registered as under 18. There&rsquo;s nothing to show here for your
              account.
            </p>
            <div className="consent-actions">
              <Link
                to="/profile"
                className="consent-button consent-button--primary"
                style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                Go to my profile
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loadState === "error" || !status) {
    return (
      <div className="consent-page" style={darkConsentThemeVars}>
        <div className="consent-page__column">
          <p className="consent-status-message consent-status-message--error" role="alert">
            Couldn&rsquo;t load your guardian consent status. Please try again shortly.
          </p>
        </div>
      </div>
    );
  }

  if (status.consentStatus === "confirmed") {
    return (
      <div className="consent-page" style={darkConsentThemeVars} data-testid="guardian-consent-confirmed">
        <div className="consent-page__column">
          <h1 className="consent-page__heading">You&rsquo;re all set</h1>
          <p className="consent-page__subheading">
            {status.consentTimestamp
              ? `Your guardian approved your account on ${new Date(status.consentTimestamp).toLocaleDateString(
                  "en-GB",
                  { day: "numeric", month: "long", year: "numeric" },
                )}. Everything that was switched off is now on.`
              : "Your guardian has approved your account. Everything that was switched off is now on."}
          </p>

          <div className="consent-card">
            <p className="consent-card__title">Now switched on</p>
            <div className="consent-list">
              {NOW_UNLOCKED.map((row) => (
                <div className="consent-row" key={row.title}>
                  <span className="consent-row__icon consent-row__icon--on" aria-hidden="true">
                    ✓
                  </span>
                  <div className="consent-row__text">
                    <span className="consent-row__title">{row.title}</span>
                    <span className="consent-row__body">{row.body}</span>
                  </div>
                  <span className="consent-pill--status consent-pill--status-on">ON</span>
                </div>
              ))}
            </div>
          </div>

          <div className="consent-card consent-card--tint">
            <p className="consent-card__title">Some protections stay on because you&rsquo;re under 18</p>
            <p className="consent-row__body">
              You&rsquo;re hidden from search engines, only people you follow can message you, and there&rsquo;s no
              ad targeting for under-18 accounts.
            </p>
          </div>

          <div className="consent-actions">
            <Link
              to="/profile"
              className="consent-button consent-button--primary"
              style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              Go to my profile
            </Link>
            {/* No /privacy-settings route or backend page exists anywhere in
                this app yet -- flagged, not silently linked to nothing. */}
            <button type="button" className="consent-button consent-button--secondary" disabled title="Coming soon">
              Review privacy settings
            </button>
          </div>
        </div>
      </div>
    );
  }

  // consentStatus === "pending"
  return (
    <div className="consent-page" style={darkConsentThemeVars} data-testid="guardian-consent-pending">
      <div className="consent-page__column">
        <span className="consent-pill">WAITING FOR GUARDIAN APPROVAL</span>
        <div>
          <h1 className="consent-page__heading">Your account is waiting for approval</h1>
          <p className="consent-page__subheading">
            We emailed {status.guardianEmail}. Until they approve, the things below are switched off to keep you
            safe.
          </p>
        </div>

        <div className="consent-card">
          <p className="consent-card__title">Switched off until your guardian approves</p>
          <div className="consent-list">
            {RESTRICTIONS.map((row) => (
              <div className="consent-row" key={row.title}>
                <span className="consent-row__icon consent-row__icon--off" aria-hidden="true">
                  –
                </span>
                <div className="consent-row__text">
                  <span className="consent-row__title">{row.title}</span>
                  <span className="consent-row__body">{row.body}</span>
                </div>
                <span className="consent-pill--status">OFF</span>
              </div>
            ))}
          </div>
        </div>

        <div className="consent-card consent-card--tint">
          <p className="consent-card__title">What you can still do</p>
          <div className="consent-list consent-list--plain">
            <div className="consent-row">
              <span className="consent-row__icon consent-row__icon--on" aria-hidden="true">
                ✓
              </span>
              <div className="consent-row__text">
                <span className="consent-row__title">Browse and follow</span>
                <span className="consent-row__body">Follow teams, players and grassroots leagues.</span>
              </div>
            </div>
            <div className="consent-row">
              <span className="consent-row__icon consent-row__icon--on" aria-hidden="true">
                ✓
              </span>
              <div className="consent-row__text">
                <span className="consent-row__title">Check scores and fixtures</span>
                <span className="consent-row__body">The Sports Hub works normally.</span>
              </div>
            </div>
            <div className="consent-row">
              <span className="consent-row__icon consent-row__icon--on" aria-hidden="true">
                ✓
              </span>
              <div className="consent-row__text">
                <span className="consent-row__title">Set up your profile</span>
                <span className="consent-row__body">Add your position and photo. It stays private until approval.</span>
              </div>
            </div>
          </div>
        </div>

        {/* sprint-1/f5-f6-bugfixes -- Bug 1 fix, option (a): the dead
            "you can resend once every 24 hours" footnote that used to sit
            below this block is removed, not reworded. Its condition
            (`!status.canResend`) can never be true here: the backend
            defines `canResend` as exactly `consentStatus === 'pending'`
            (guardian-consent.service.ts's getConsentStatus()), and this
            whole branch only ever renders when consentStatus is already
            'pending' -- so the footnote described a real cooldown rule
            that doesn't exist anywhere server-side (confirmed:
            resendConsent() has no such check at all). `disabled={!status
            .canResend || ...}` below is left as-is -- it's inert today for
            the same reason, but stays correctly wired for the day a real
            cooldown (option (b), a genuine backend addition -- see this
            PR's description) makes `canResend` actually vary. */}
        <div className="consent-actions">
          <button
            type="button"
            className="consent-button consent-button--primary"
            onClick={handleResend}
            disabled={!status.canResend || resendState === "sending"}
          >
            {resendState === "sending" ? "Sending…" : "Resend approval request"}
          </button>
          {/* No PATCH-guardian-email endpoint exists anywhere in Section 4.1
              -- flagged, not silently wired to nothing. */}
          <button type="button" className="consent-button consent-button--secondary" disabled title="Coming soon">
            Change guardian email
          </button>
        </div>

        {resendState === "sent" && (
          <p className="consent-footnote" role="status">
            If your guardian&rsquo;s email is still pending, a new request has been sent.
          </p>
        )}
        {resendState === "error" && (
          <p className="consent-status-message consent-status-message--error" role="alert">
            Couldn&rsquo;t send that just now. Please try again shortly.
          </p>
        )}
      </div>
    </div>
  );
}
