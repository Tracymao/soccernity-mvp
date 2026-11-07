// The page the email-change link opens. Figma (file weZWWqggy9j13eX8bhFgs6, desktop /
// mobile): Verified 6990:51373 / 6990:51993, Link expired 6990:51556 / 6990:52030.
// Route /email-change/confirm?token=... (the web path the backend builds into the
// emailed link; services/api email-change README). Public: the secret in the link is
// the credential, so no session is needed or used. Build register B-059.
//
// On load the token is sent ONCE to POST /auth/email-change/confirm. The call is memoised
// per token at module level, so React StrictMode's double effect (and a re-render) can
// never spend a single-use link twice; the memo is dropped on a network or server
// failure so "Try again" really retries.
//
//   204                          -> Verified
//   400 email_change_link_invalid -> Link expired (unknown, used, expired or superseded:
//                                    the server never says which)
//   no ?token=                    -> Link expired (nothing to send)
//   anything else                 -> a plain "try again" state
//
// A confirmed change ends EVERY session of the account on the server, so the page also
// clears this browser's session and sends the person to log in again. 204 has no body, so
// the new address is not shown (the frame draws it; there is no source for it here).
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  EMAIL_CHANGE_LINK_INVALID,
  EmailChangeApiError,
  confirmEmailChange,
} from "../../api/emailChange";
import { clearStoredSession } from "../../lib/session";
import checkIcon from "../../assets/icons/change-password-check.svg";
import alertIcon from "../../assets/icons/email-change-alert.svg";
import "../settings/EmailChange.css";

type Outcome = "verified" | "expired" | "error";

const inFlight = new Map<string, Promise<Outcome>>();

function confirmOnce(token: string): Promise<Outcome> {
  let promise = inFlight.get(token);
  if (!promise) {
    promise = confirmEmailChange(token)
      .then((): Outcome => "verified")
      .catch((err: unknown): Outcome => {
        if (err instanceof EmailChangeApiError && err.code === EMAIL_CHANGE_LINK_INVALID) return "expired";
        inFlight.delete(token);
        return "error";
      });
    inFlight.set(token, promise);
  }
  return promise;
}

export default function EmailChangeConfirmPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [outcome, setOutcome] = useState<Outcome | "working">(token ? "working" : "expired");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) {
      setOutcome("expired");
      return;
    }
    let cancelled = false;
    setOutcome("working");
    void confirmOnce(token).then((result) => {
      if (cancelled) return;
      if (result === "verified") clearStoredSession();
      setOutcome(result);
    });
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  if (outcome === "working") {
    return (
      <div className="ec-confirm">
        <p className="settings-status" role="status">
          Confirming your new email address…
        </p>
      </div>
    );
  }

  if (outcome === "verified") {
    return (
      <div className="ec-confirm">
        <div className="ec">
          <div className="ec__disc" aria-hidden="true">
            <img src={checkIcon} alt="" width={28} height={28} />
          </div>
          <div className="ec__header" role="status">
            <h2 className="ec__title">Your email is changed</h2>
            <p className="ec__lead">Your email address has been changed.</p>
          </div>
          <p className="ec__note ec__note--md">
            Use it to log in from now on. You’ve been signed out everywhere, so log in again.
          </p>
          <div className="ec__actions">
            <Link to="/login" className="ec__btn ec__btn--primary">
              Log in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (outcome === "error") {
    return (
      <div className="ec-confirm">
        <div className="ec">
          <div className="ec__header" role="alert">
            <h2 className="ec__title">We couldn’t confirm your email</h2>
            <p className="ec__lead">Something went wrong on our side. Your email hasn’t changed yet. Try again.</p>
          </div>
          <div className="ec__actions">
            <button type="button" className="ec__btn ec__btn--primary" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ec-confirm">
      <div className="ec">
        <div className="ec__disc" aria-hidden="true">
          <img src={alertIcon} alt="" width={28} height={28} />
        </div>
        <div className="ec__header" role="alert">
          <h2 className="ec__title">This link has expired</h2>
          <p className="ec__lead">Email change links only work for a limited time. Your email hasn’t changed.</p>
        </div>
        <div className="ec__actions">
          <Link to="/settings/account/information/change-email" className="ec__btn ec__btn--primary">
            Start again
          </Link>
          <Link to="/settings/account/information" className="ec__btn">
            Back to Account Information
          </Link>
        </div>
      </div>
    </div>
  );
}
