// Guardian Consent -- 11 Change Guardian Email (Minor). Figma:
// "Guardian Consent — 11 Change Guardian Email (Minor)" 5498:7164 (mobile
// 5501:8536), "Soccernity-MVP" (weZWWqggy9j13eX8bhFgs6). Route:
// /guardian-consent/change-email.
//
// Backend: POST /auth/guardian-consent/change-guardian-email (Decision Log
// #365, built by safeguarding/guardian-email-change-endpoint). Submitting
// RESTARTS the consent flow against the new address (Decision Log #60): the
// old approval link stops working, a fresh request goes to the new address,
// and the guardian must approve again. The "restarts from scratch" notice
// below is quoted from the frame and is shown BEFORE the user submits.
//
// Only reachable meaningfully while consent is pending -- the status page
// links here only in that state, and the page re-checks the real status
// (GET /auth/guardian-consent/status) rather than trusting the link, because
// the server refuses a confirmed or declined request anyway.
//
// DESIGN GAP, flagged rather than invented: the Figma frame has only an email
// field. The backend now also REQUIRES the guardian's name and relationship
// (the new address may be a different person, so the previous guardian's
// details must not stay attached to it), so two controls the frame doesn't
// draw are added here, plain, reusing the signup guardian step's relationship
// options. A follow-up design pass should add them to 5498:7164 / 5501:8536.
//
// Chrome: renders under AppShell (site Header) like /guardian-consent does;
// the frame's own "Top Bar — Soccernity" logo bar is not reproduced for the
// same reason GuardianConsent.css documents. Light --sn-* tokens, matching
// the frame (which is light) and the other recently converted account pages;
// the older consent pages still use dark-token vars from before that retrofit.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  AuthApiError,
  changeGuardianEmail,
  getGuardianConsentStatus,
  type GuardianConsentStatus,
} from "../../api/auth";
import { getStoredAccessToken } from "../../lib/session";
import { GUARDIAN_RELATIONSHIP_OPTIONS, type GuardianRelationship } from "../signup/types";
import "./ChangeGuardianEmailPage.css";

type LoadState = "loading" | "loaded" | "not-a-minor" | "error" | "no-session";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ChangeGuardianEmailPage() {
  const navigate = useNavigate();
  const token = getStoredAccessToken();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [status, setStatus] = useState<GuardianConsentStatus | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState<GuardianRelationship | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    if (!token) {
      setLoadState("no-session");
      return;
    }
    setLoadState("loading");
    try {
      setStatus(await getGuardianConsentStatus(token));
      setLoadState("loaded");
    } catch (err) {
      setLoadState(err instanceof AuthApiError && err.status === 404 ? "not-a-minor" : "error");
    }
  }, [token]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Enter your guardian's full name.");
      return;
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError("Enter a valid email address for your guardian.");
      return;
    }
    if (!relationship) {
      setError("Select their relationship to you.");
      return;
    }
    setBusy(true);
    try {
      await changeGuardianEmail(token as string, {
        name: name.trim(),
        email: email.trim(),
        relationship,
      });
      // The status page reads the real, now-updated guardian email ("We
      // emailed …"), so landing there is the confirmation.
      navigate("/guardian-consent");
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Couldn't update the guardian email. Please try again.");
      setBusy(false);
    }
  }

  if (loadState === "no-session") {
    return (
      <div className="cge" role="status">
        <p className="cge__status">
          Log in to change your guardian&rsquo;s email. <Link to="/login">Log in</Link>
        </p>
      </div>
    );
  }
  if (loadState === "loading") {
    return (
      <div className="cge" role="status">
        <p className="cge__status">Loading your account status…</p>
      </div>
    );
  }
  if (loadState === "not-a-minor") {
    return (
      <div className="cge" role="status">
        <p className="cge__status">
          This only applies to accounts registered as under 18. <Link to="/profile">Go to my profile</Link>
        </p>
      </div>
    );
  }
  if (loadState === "error" || !status) {
    return (
      <div className="cge" role="alert">
        <p className="cge__status cge__status--error">
          Couldn&rsquo;t load your guardian consent status. Please try again shortly.
        </p>
      </div>
    );
  }
  if (status.consentStatus !== "pending") {
    return (
      <div className="cge" role="status" data-testid="change-guardian-email-unavailable">
        <p className="cge__status">
          {status.consentStatus === "confirmed"
            ? "Your guardian has already approved your account, so their email can no longer be changed here."
            : "This request is closed, so the guardian email can't be changed."}{" "}
          <Link to="/guardian-consent">Back to my account status</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="cge" data-testid="change-guardian-email">
      <div className="cge__column">
        <div className="cge__header">
          <h1 className="cge__heading">Change your guardian&rsquo;s email</h1>
          <p className="cge__lead">
            Update the email address we use when we ask a parent or guardian to approve your account.
          </p>
        </div>

        <form className="cge__form" onSubmit={handleSubmit} noValidate>
          <div className="cge__card">
            <h2 className="cge__card-title">Guardian email</h2>

            <div className="cge__field">
              <span className="cge__label cge__label--muted">Current guardian email</span>
              <span className="cge__value">{status.guardianEmail}</span>
            </div>

            <div className="cge__field">
              <label className="cge__label" htmlFor="cge-name">
                Guardian&rsquo;s full name
              </label>
              <input
                id="cge-name"
                className="cge__input"
                type="text"
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
              />
            </div>

            <div className="cge__field">
              <label className="cge__label" htmlFor="cge-email">
                New guardian email
              </label>
              <input
                id="cge-email"
                className="cge__input"
                type="email"
                autoComplete="off"
                placeholder="parent@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
              <span className="cge__hint">Double-check this. The approval link goes to this address and nowhere else.</span>
            </div>

            <div className="cge__field">
              <label className="cge__label" htmlFor="cge-relationship">
                Their relationship to you
              </label>
              <select
                id="cge-relationship"
                className="cge__input"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value as GuardianRelationship)}
                disabled={busy}
              >
                <option value="">Select…</option>
                {GUARDIAN_RELATIONSHIP_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="cge__notice">
            <p className="cge__notice-title">Sending a new email restarts approval from scratch</p>
            <p className="cge__notice-body">
              Your account goes back to a pending state, the current approval link stops working, and a fresh request is
              sent to the new address. Your guardian will need to approve again before your account unlocks.
            </p>
          </div>

          {error && (
            <p className="cge__error" role="alert">
              {error}
            </p>
          )}

          <div className="cge__actions">
            <button type="submit" className="cge__btn cge__btn--primary" disabled={busy}>
              {busy ? "Sending…" : "Send new request"}
            </button>
            <Link to="/guardian-consent" className="cge__btn cge__btn--outline">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
