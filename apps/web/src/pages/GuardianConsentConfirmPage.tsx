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
// The Figma frame's "I do not consent" button is wired to the real
// POST /auth/guardian-consent/decline. A guardian may decline up to 3 times
// (Decision Log #389/#395): declines 1 and 2 leave the account active and
// restricted, only the third schedules it for deletion. So neither the
// footnote nor the post-decline state says a decline "closes the account and
// schedules it for deletion" (QA D-10, B-130, Decision Log #406 item 13); both
// carry the cap sentence below, addressed to the guardian. The backend's
// non-generic 400s ("already confirmed", "declined or withdrawn") are shown
// verbatim.
// B-021 / B-029 (Decision Log #372): the request summary the Figma frame
// draws is now built, from GET /auth/guardian-consent/request-summary (token
// in a header). The "Report incorrect details" action posts the token only --
// no note and no corrected date is collected from an unauthenticated caller.
// While a report is open the server refuses approval and card payment but
// keeps DECLINE available, so this page shows "approval is on hold", disables
// "I consent", and leaves "I do not consent" alone. A failed summary lookup
// (invalid / expired token) is not shown as its own error: the page keeps its
// existing behaviour and the real POST returns the real rejection.
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import {
  confirmGuardianConsent,
  declineGuardianConsent,
  getGuardianRequestSummary,
  reportIncorrectGuardianDetails,
  AuthApiError,
  type GuardianRequestSummary,
} from "../api/auth";
import CardVerificationPanel, { type CardGate } from "./guardian-consent/CardVerificationPanel";
import { consentThemeVars } from "./guardian-consent/consentThemeVars";
import "./guardian-consent/GuardianConsent.css";

const GENERIC_ERROR_MESSAGE =
  "This link is invalid or has expired. Ask the account holder to resend the approval request from their account.";

type Status = "idle" | "submitting" | "confirmed" | "declined" | "error";
type ReportState = "idle" | "sending" | "sent" | "error";

function ageOn(dobIso: string, today: Date): number | null {
  const [y, m, d] = dobIso.split("-").map(Number);
  if (!y || !m || !d) return null;
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
}

function formatLongDate(iso: string): string {
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// The cap sentence, addressed to the guardian (B-130, Decision Log #406 item
// 13). Same facts as the sentence on the minor's decline page
// (GuardianConsentPage.tsx), reworded for the person who decides.
const GUARDIAN_CAP_SENTENCE =
  "You can decline up to 3 times. Changing the guardian email does not reset the count. After the third decline the account is scheduled for deletion. [COPY PENDING LEGAL REVIEW]";

// Decision Log #377 removed "Build a player profile" (no player profile in the
// MVP), and #407 item 4 (QA D-13) stops promising following (a restricted-
// pending minor cannot follow, #370).
const WHAT_THEY_CAN_DO = [
  {
    title: "Check scores and fixtures",
    body: "Browse the Sports Hub, including grassroots and pro fixtures. [COPY PENDING LEGAL REVIEW]",
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

// safeguarding/guardian-contact-public-visibility (legal-copy Part C row
// 32): disclosed here because it widens what a guardian consents to.
const GUARDIAN_CONTACT_NOTICE = {
  title: "Your email on their profile",
  body:
    "While the account holder is under 18, your email address appears on their profile, labelled " +
    "“Guardian contact”, and any logged-in Soccernity user can see it. Under-18 accounts cannot " +
    "receive ordinary direct messages, so this is how others can reach you about them. It is removed " +
    "automatically when they turn 18.",
};

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "the account holder";
}

export default function GuardianConsentConfirmPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState(GENERIC_ERROR_MESSAGE);
  // sprint-1/coppa-card-verification: only "needed" blocks the consent button;
  // the server enforces the same rule regardless.
  const [cardGate, setCardGate] = useState<CardGate>("loading");
  const [summary, setSummary] = useState<GuardianRequestSummary | null>(null);
  const [reportState, setReportState] = useState<ReportState>("idle");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getGuardianRequestSummary(token)
      .then((result) => {
        if (!cancelled) setSummary(result);
      })
      .catch(() => {
        // Deliberately silent -- see the header comment.
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // True while support has not resolved a report (this session's or an earlier one).
  const onHold = (summary?.incorrectDetailsReported ?? false) || reportState === "sent";

  async function handleReport() {
    if (!token) return;
    setReportState("sending");
    try {
      await reportIncorrectGuardianDetails(token);
      setReportState("sent");
    } catch {
      setReportState("error");
    }
  }

  async function handleConsent(event: FormEvent) {
    event.preventDefault();
    if (!token || !agreed || cardGate === "needed" || onHold) return;

    setStatus("submitting");
    try {
      await confirmGuardianConsent(token);
      setStatus("confirmed");
    } catch (error) {
      setErrorMessage(error instanceof AuthApiError ? error.message : GENERIC_ERROR_MESSAGE);
      setStatus("error");
    }
  }

  async function handleDecline() {
    if (!token) return;

    setStatus("submitting");
    try {
      await declineGuardianConsent(token);
      setStatus("declined");
    } catch (error) {
      setErrorMessage(error instanceof AuthApiError ? error.message : GENERIC_ERROR_MESSAGE);
      setStatus("error");
    }
  }

  return (
    <div className="consent-page" style={consentThemeVars} data-testid="guardian-consent-confirm-page">
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
              Your approval has been recorded. The account holder can now continue registration. You can close
              this page. [COPY PENDING LEGAL REVIEW]
            </p>
          </div>
        ) : status === "declined" ? (
          <div className="consent-card">
            <h1 className="consent-page__heading">Your decision has been recorded</h1>
            <p className="consent-status-message" role="status">
              <span>You have declined permission for this account, so it stays switched off. [COPY PENDING LEGAL REVIEW]</span>{" "}
              {GUARDIAN_CAP_SENTENCE} You can close this page.
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

            {summary && (
              <div className="consent-card consent-card--tint" data-testid="request-summary">
                <p className="consent-card__title">About this request</p>
                <dl className="consent-summary">
                  <div className="consent-summary__row">
                    <dt>Who is asking</dt>
                    <dd>{summary.minorName}</dd>
                  </div>
                  <div className="consent-summary__row">
                    <dt>Date of birth given</dt>
                    <dd>
                      {formatLongDate(summary.dateOfBirth)}
                      {ageOn(summary.dateOfBirth, new Date()) !== null
                        ? ` (age ${ageOn(summary.dateOfBirth, new Date())})`
                        : ""}
                    </dd>
                  </div>
                  <div className="consent-summary__row">
                    <dt>You were named as</dt>
                    <dd>{summary.guardianRelationship}</dd>
                  </div>
                  <div className="consent-summary__row">
                    <dt>Requested on</dt>
                    <dd>{formatLongDate(summary.requestedAt)}</dd>
                  </div>
                </dl>
                <p className="consent-footnote">
                  Your email address appears on {firstName(summary.minorName)}&rsquo;s profile as their line of
                  contact. [COPY PENDING LEGAL REVIEW]
                </p>
                <p className="consent-footnote">
                  {firstName(summary.minorName)}&rsquo;s photo and username are visible to other Soccernity
                  members. [COPY PENDING LEGAL REVIEW]
                </p>
                {reportState !== "sent" && !summary.incorrectDetailsReported && (
                  <button
                    type="button"
                    className="consent-link-button"
                    onClick={handleReport}
                    disabled={reportState === "sending"}
                  >
                    Report incorrect details [COPY PENDING LEGAL REVIEW]
                  </button>
                )}
                {reportState === "error" && (
                  <p className="consent-status-message consent-status-message--error" role="alert">
                    Couldn&rsquo;t send that just now. Please try again shortly.
                  </p>
                )}
              </div>
            )}

            {onHold && (
              <div className="consent-card consent-card--tint" role="status" data-testid="approval-on-hold">
                <p className="consent-card__title">Approval is on hold</p>
                <p className="consent-page__subheading">
                  You told us some of these details are incorrect. Support will review them and contact you, and
                  you can approve once that is done. You can still decline this request below. [COPY PENDING LEGAL
                  REVIEW]
                </p>
              </div>
            )}

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

            <div className="consent-card">
              <p className="consent-card__title">{GUARDIAN_CONTACT_NOTICE.title}</p>
              <p className="consent-page__subheading">{GUARDIAN_CONTACT_NOTICE.body}</p>
            </div>

            {token && <CardVerificationPanel token={token} onGateChange={setCardGate} />}

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
                      disabled={!agreed || status === "submitting" || cardGate === "needed" || onHold}
                    >
                      {status === "submitting" ? "Submitting…" : "I consent"}
                    </button>
                    <button
                      type="button"
                      className="consent-button consent-button--secondary"
                      onClick={handleDecline}
                      disabled={status === "submitting"}
                    >
                      I do not consent
                    </button>
                  </div>

                  <p className="consent-footnote">
                    {GUARDIAN_CAP_SENTENCE} Read our <Link to="/privacy">Privacy Policy</Link>.
                  </p>
                </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
