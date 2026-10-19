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
// B-110 / B-125 (Decision Log #395, #402): `declined` is its own state here,
// never rendered as pending. After decline 1 or 2 the minor keeps a valid
// session and sees THIS page's decline view inside the account (Figma
// 5491:8241 desktop / 5501:8453 mobile) with the existing resend and
// change-guardian-email actions; no decline COUNT is ever shown (the status
// response has none, #395 B2, #403 item 2). The third decline revokes the
// session server-side, so that case never reaches this page. The Figma frame
// names the guardian and the decision date: the status response now returns
// `guardianFirstName` and `lastDecisionAt` (B-131), shown on the decline and
// approved pages (FC3a); when either is null the sentence falls back to
// "Your guardian" / no date.
//
// FC3a (docs/fc3a-onboarding-fixes-report.md): light theme (B-127); the resend
// button sends the MINOR's own registered email, because POST
// /auth/guardian-consent/resend looks the account up by the minor's email, not
// the guardian's (QA D-03); the "What you can still do" lists no longer promise
// following or a profile the server refuses a restricted-pending minor (QA
// D-13, #370).
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  AuthApiError,
  getGuardianConsentStatus,
  resendGuardianConsentRequest,
  type GuardianConsentStatus,
} from "../api/auth";
import { getUser } from "../api/users";
import { decodeAccessToken, getStoredAccessToken } from "../lib/session";
import { consentThemeVars } from "./guardian-consent/consentThemeVars";
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
    title: "Your profile will be visible",
    body: "Other Soccernity members can find and view your profile.",
  },
  {
    title: "Direct messages will be on",
    body: "People you follow can message you.",
  },
  {
    title: "You will be able to post in Banter Rooms & Community Groups",
    body: "Join the conversation in both, not just read it.",
  },
];

const STAYS_ON = [
  {
    title: "You’re hidden from search engines",
    body: "Your profile won’t appear on Google or to logged-out visitors.",
  },
  {
    title: "Only people you follow can message you",
    body: "Strangers still can’t start a chat.",
  },
  {
    title: "No ad targeting",
    body: "Under-18 accounts are excluded from targeted advertising.",
  },
];

// Decline view (Figma 5491:8241 / 5501:8453).
const DECLINED_OFF = [
  {
    title: "Your profile is hidden",
    body: "Other people can’t find or view your profile yet.",
  },
  {
    title: "Direct messages are off",
    body: "No one can message you until a guardian approves your account.",
  },
  {
    title: "Posting is limited",
    body: "You can read Banter Rooms and Community Groups, but not post in them.",
  },
];

const DECLINED_CAN_DO = [
  {
    title: "Send a new approval request",
    body: "We’ll email a fresh link to your guardian. The previous link stops working.",
  },
  {
    title: "Change your guardian’s email",
    body: "If the address is wrong, update it and a new request goes to the new email.",
  },
  {
    title: "Keep exploring while you wait",
    // QA D-13 (#407 item 4): following is refused for a restricted-pending
    // minor (uniform write block, #370), so it is not promised here. The
    // Figma frame 5491:8241 still says "follow teams" (register B-154).
    body: "You can still browse the Sports Hub and check scores. [COPY PENDING LEGAL REVIEW]",
  },
];

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// "Sarah approved your account on 15 August 2026. " (Figma 5108:6631). Falls
// back to the less specific sentence when the response has no name or date.
function approvedSentence(status: GuardianConsentStatus): string {
  const who = status.guardianFirstName ?? "Your guardian";
  const when = status.lastDecisionAt ?? status.consentTimestamp;
  return when ? `${who} approved your account on ${longDate(when)}. ` : `${who} has approved your account. `;
}

// "They chose not to approve your account on 15 August 2026. You can send a
// new request, or use a different guardian email." (Figma 5491:8241).
function declinedSentence(status: GuardianConsentStatus): string {
  const first = status.lastDecisionAt
    ? `They chose not to approve your account on ${longDate(status.lastDecisionAt)}.`
    : "They chose not to approve your account.";
  return `${first} You can send a new request, or use a different guardian email.`;
}

export default function GuardianConsentPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [status, setStatus] = useState<GuardianConsentStatus | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  // The signed-in minor's own profile: its email is what the resend route
  // looks the account up by (QA D-03), and its name personalises the approved
  // heading. Non-fatal when it fails to load.
  const [minorName, setMinorName] = useState<string | null>(null);
  const [minorEmail, setMinorEmail] = useState<string | null>(null);

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

  useEffect(() => {
    const userId = token ? decodeAccessToken(token)?.sub : undefined;
    if (!token || !userId) return;
    let cancelled = false;
    getUser(token, userId)
      .then((user) => {
        if (cancelled) return;
        setMinorEmail(user.email);
        setMinorName(user.displayName);
      })
      .catch(() => {
        // Not fatal: the page still works; a resend then fetches it again.
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleResend() {
    if (!status || !token) return;
    setResendState("sending");
    try {
      // POST /auth/guardian-consent/resend takes the MINOR's registered email
      // (guardian-consent.service.ts resendConsent), not the guardian's
      // address from the status response -- sending that silently did nothing
      // (QA D-03).
      let email = minorEmail;
      if (!email) {
        const userId = decodeAccessToken(token)?.sub;
        if (!userId) throw new Error("no user id in the session");
        email = (await getUser(token, userId)).email;
        setMinorEmail(email);
      }
      await resendGuardianConsentRequest(email);
      setResendState("sent");
      // A resend after decline 1 or 2 reopens the request as pending on the
      // server; re-read the status so the page moves out of the decline view.
      if (status.consentStatus === "declined") await loadStatus();
    } catch {
      setResendState("error");
    }
  }

  const minorFirstName = minorName ? minorName.trim().split(/\s+/)[0] : null;

  if (loadState === "no-session") {
    return (
      <div className="consent-page" style={consentThemeVars}>
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
      <div className="consent-page" style={consentThemeVars}>
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
      <div className="consent-page" style={consentThemeVars}>
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
      <div className="consent-page" style={consentThemeVars}>
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
      <div className="consent-page" style={consentThemeVars} data-testid="guardian-consent-confirmed">
        <div className="consent-page__column">
          <div className="consent-icon-circle consent-icon-circle--approved" aria-hidden="true">
            ✓
          </div>
          <div>
            <h1 className="consent-page__heading">
              {minorFirstName ? `Your account is approved, ${minorFirstName}` : "Your account is approved"}
            </h1>
            <p className="consent-page__subheading">
              {approvedSentence(status)}
              Continue registration to finish setting up your profile. [COPY PENDING LEGAL REVIEW]
            </p>
          </div>

          <div className="consent-card">
            <p className="consent-card__title">Switched on when you finish registration</p>
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
                  <span className="consent-pill--status consent-pill--status-on">SOON</span>
                </div>
              ))}
            </div>
          </div>

          <div className="consent-card consent-card--tint">
            <p className="consent-card__title">Some protections stay on because you&rsquo;re under 18</p>
            <div className="consent-list consent-list--plain">
              {STAYS_ON.map((row) => (
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
            <p className="consent-footnote">Your guardian can review or withdraw consent at any time.</p>
          </div>

          <div className="consent-actions">
            {/* B-125: "Continue registration" resolves the next onboarding
                step from the server (Create Profile), never a hard-coded
                destination. */}
            <Link
              to="/continue"
              className="consent-button consent-button--primary"
              style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              Continue registration
            </Link>
            {/* The privacy settings page exists now, but is not part of this
                routing change -- left as the disabled placeholder it was. */}
            <button type="button" className="consent-button consent-button--secondary" disabled title="Coming soon">
              Review privacy settings
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status.consentStatus === "declined") {
    return (
      <div className="consent-page" style={consentThemeVars} data-testid="guardian-consent-declined">
        <div className="consent-page__column">
          <div className="consent-icon-circle" aria-hidden="true">
            ✓
          </div>
          <div>
            <h1 className="consent-page__heading">
              {status.guardianFirstName ?? "Your guardian"} hasn&rsquo;t approved your account
            </h1>
            <p className="consent-page__subheading">{declinedSentence(status)}</p>
          </div>

          <div className="consent-card">
            <p className="consent-card__title">Still switched off</p>
            <div className="consent-list">
              {DECLINED_OFF.map((row) => (
                <div className="consent-row" key={row.title}>
                  <span className="consent-row__icon consent-row__icon--off" aria-hidden="true">
                    ✓
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
            <p className="consent-card__title">What you can do now</p>
            <div className="consent-list consent-list--plain">
              {DECLINED_CAN_DO.map((row) => (
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
            <p className="consent-footnote">
              Not sure why they declined? Ask your parent or guardian directly &mdash; Soccernity can&rsquo;t share
              the reason.
            </p>
            {/* Static sentence from the frame (Decision Log #403 item 2): it
                states the cap but never a running count. */}
            <p className="consent-footnote" data-testid="decline-cap-sentence">
              A guardian can decline up to 3 times. Changing your guardian&rsquo;s email does not reset the count.
              After the third decline your account is scheduled for deletion. [COPY PENDING LEGAL REVIEW]
            </p>
          </div>

          <div className="consent-actions">
            <button
              type="button"
              className="consent-button consent-button--primary"
              onClick={handleResend}
              disabled={!status.canResend || resendState === "sending"}
            >
              {resendState === "sending" ? "Sending…" : "Resend approval request"}
            </button>
            <Link
              to="/guardian-consent/change-email"
              className="consent-button consent-button--secondary"
              style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              Change guardian email
            </Link>
          </div>

          {resendState === "error" && (
            <p className="consent-status-message consent-status-message--error" role="alert">
              Couldn&rsquo;t send that just now. Please try again shortly.
            </p>
          )}
        </div>
      </div>
    );
  }

  // consentStatus === "pending"
  return (
    <div className="consent-page" style={consentThemeVars} data-testid="guardian-consent-pending">
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
                <span className="consent-row__title">Browse and read</span>
                {/* QA D-13 (#407 item 4): the old "Browse and follow" row
                    promised following, which the server refuses until a
                    guardian approves (#370). */}
                <span className="consent-row__body">
                  Look around the Sports Hub, the Blog and Banter Rooms. Following and posting switch on once your
                  guardian approves. [COPY PENDING LEGAL REVIEW]
                </span>
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
          {/* safeguarding/guardian-email-change-endpoint (Decision Log #365):
              the endpoint now exists; this opens the standalone Change
              Guardian Email screen (Figma 5498:7164). Only offered while
              consent is pending, which is the only state this branch
              renders. */}
          <Link
            to="/guardian-consent/change-email"
            className="consent-button consent-button--secondary"
            style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            Change guardian email
          </Link>
        </div>

        {resendState === "sent" && (
          <p className="consent-footnote" role="status">
            We&rsquo;ve sent a new approval email to {status.guardianEmail}. The previous link no longer works.
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
