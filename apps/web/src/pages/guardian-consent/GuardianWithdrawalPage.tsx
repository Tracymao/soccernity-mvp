// Guardian withdrawal page -- a guardian taking back consent they already gave
// (build register B-080 / B-112, Decision Log #340, #395 B3, #403 item 15, #414 item 1).
// Route: /guardian-consent/withdraw. Figma "Guardian Withdrawal" frames, desktop
// 6654:2 / 6654:30 / 6654:57 / 6654:91 / 6654:118 / 6654:146, mobile 6654:26727 /
// 6654:26755 / 6654:26782 / 6654:26816 / 6654:26843 / 6654:26871, and the pre-filled
// Confirm 6820:29312 / 6820:29346 ("Soccernity-MVP", weZWWqggy9j13eX8bhFgs6).
//
// ONE route, six states. The guardian holds no Soccernity account, so every call is
// unauthenticated and the page lives under AuthChrome (the logo-only Top Bar the frames draw).
//
//   request    1  asks for the MINOR's account email  -> POST /auth/guardian-consent/withdraw/request
//   sent       2  one fixed answer for every outcome  (the page never says whether anything matched)
//   confirm    3  the withdrawal code                 -> POST /auth/guardian-consent/withdraw
//   success    4  consent withdrawn, account closed
//   invalid    5  the link/code is unknown, used or expired (a 400)
//   throttled  6  "Too many attempts" (a 429), "Try again" returns to the request step
//
// `?token=` selects the Confirm step with the code PRE-FILLED: that is the link in the
// withdrawal email (services/api registration-email.service.ts, B-016). The consent email and the
// Approved screen link here WITHOUT a token and so land on the request step (#414 item 1). Opening
// Confirm from "Enter a withdrawal code" leaves the field empty to paste into.
//
// Throttle: 5 attempts per 15 minutes per IP, held in configuration on the server (#403 item 15).
// The page shows no number and no countdown, only the fixed message the frame draws.
//
// Wording: the strings that say what withdrawing does to the child or the guardian's data carry
// [COPY PENDING LEGAL REVIEW] (Decision Log #414 item 1, #412 item 5) and have rows in
// docs/pending-copy-manifest.md. Labels, buttons and the invalid / too-many-attempts messages are
// functional and untagged. One known inconsistency is not resolved here: the "deleted after 30
// days" sentence (frames) differs from the legal draft (anonymised; consent record kept 6 months)
// and from the code email ("permanently deleted"); that is one counsel item (Decision Log #411
// item 7, B-200), left as drawn.
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { Link, useSearchParams } from "react-router";
import { AuthApiError, requestGuardianWithdrawal, withdrawGuardianConsent } from "../../api/auth";
import checkIcon from "../../assets/icons/withdrawal-check.svg";
import "./GuardianWithdrawalPage.css";

type Step = "request" | "sent" | "confirm" | "success" | "invalid" | "throttled";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function GuardianWithdrawalPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tokenFromLink = (searchParams.get("token") ?? "").trim();

  const [step, setStep] = useState<Step>(tokenFromLink ? "confirm" : "request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(tokenFromLink);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the new heading when the step changes, so a screen reader announces it.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  // Back to frame 1 with nothing carried over: a refresh must not re-fill a spent code.
  function backToRequest() {
    setError(null);
    setCode("");
    if (searchParams.has("token")) {
      const next = new URLSearchParams(searchParams);
      next.delete("token");
      setSearchParams(next, { replace: true });
    }
    setStep("request");
  }

  function toEmptyConfirm() {
    setError(null);
    setCode("");
    if (searchParams.has("token")) {
      const next = new URLSearchParams(searchParams);
      next.delete("token");
      setSearchParams(next, { replace: true });
    }
    setStep("confirm");
  }

  async function submitRequest(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const value = email.trim();
    if (!EMAIL_PATTERN.test(value)) {
      setError("Enter the email address of the Soccernity account.");
      return;
    }
    setBusy(true);
    try {
      await requestGuardianWithdrawal(value);
      setStep("sent");
    } catch (err) {
      if (err instanceof AuthApiError && err.status === 429) {
        setStep("throttled");
      } else if (err instanceof AuthApiError && err.status === 400) {
        setError("Enter the email address of the Soccernity account.");
      } else {
        setError(err instanceof AuthApiError ? err.message : "Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitWithdrawal(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const value = code.trim();
    if (!value) {
      setError("Paste the withdrawal code from the email.");
      return;
    }
    setBusy(true);
    try {
      await withdrawGuardianConsent(value);
      setCode("");
      setStep("success");
    } catch (err) {
      if (err instanceof AuthApiError && err.status === 429) {
        setStep("throttled");
      } else if (err instanceof AuthApiError && err.status === 400) {
        // Unknown, used, expired, or consent not confirmed: one generic answer.
        setStep("invalid");
      } else {
        setError(err instanceof AuthApiError ? err.message : "Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gw" data-testid="guardian-withdrawal" data-step={step}>
      <div className="gw__column">
        {step === "request" && (
          <>
            <Icon />
            <Header headingRef={headingRef} title="Withdraw your consent">
              Enter the email address of the Soccernity account you gave consent for. We will send a withdrawal
              link to the guardian email on that account. [COPY PENDING LEGAL REVIEW]
            </Header>
            <form className="gw__form" onSubmit={submitRequest} noValidate>
              <div className="gw__field">
                <label className="gw__label" htmlFor="gw-email">
                  Email address of the Soccernity account
                </label>
                <input
                  id="gw-email"
                  className="gw__input"
                  type="email"
                  autoComplete="off"
                  placeholder="account email address"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-describedby="gw-email-hint"
                />
                <p id="gw-email-hint" className="gw__hint">
                  This is the email the account was registered with, not your own.
                </p>
              </div>
              {error && <Alert>{error}</Alert>}
              <div className="gw__actions">
                <button type="submit" className="gw__button gw__button--primary" disabled={busy}>
                  {busy ? "Sending…" : "Send withdrawal link"}
                </button>
              </div>
            </form>
          </>
        )}

        {step === "sent" && (
          <>
            <Icon />
            <Header headingRef={headingRef} title="Check the guardian’s inbox">
              If that account has confirmed guardian consent, a withdrawal link has been sent to the guardian. The
              link can be used once. [COPY PENDING LEGAL REVIEW]
            </Header>
            <div className="gw__panel">
              <p className="gw__panel-text">
                Nothing has changed yet. Consent is only withdrawn when the guardian confirms from the link. [COPY
                PENDING LEGAL REVIEW]
              </p>
            </div>
            <div className="gw__actions">
              <button type="button" className="gw__button gw__button--primary" onClick={toEmptyConfirm}>
                Enter a withdrawal code
              </button>
              <Link to="/" className="gw__button gw__button--outline">
                Done
              </Link>
            </div>
          </>
        )}

        {step === "confirm" && (
          <>
            <Icon />
            <Header headingRef={headingRef} title="Confirm withdrawing consent">
              Withdrawing consent closes the account straight away. This cannot be undone from this page. [COPY
              PENDING LEGAL REVIEW]
            </Header>
            <form className="gw__form" onSubmit={submitWithdrawal} noValidate>
              <div className="gw__field">
                <label className="gw__label" htmlFor="gw-code">
                  Withdrawal code
                </label>
                <input
                  id="gw-code"
                  className="gw__input"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="paste your withdrawal code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  aria-describedby="gw-code-hint"
                />
                <p id="gw-code-hint" className="gw__hint">
                  From the email we sent to the guardian. It can only be used once.
                </p>
              </div>
              <div className="gw__card">
                <p className="gw__card-title">What happens next</p>
                <p className="gw__card-text">The account is closed and the person can no longer sign in. [COPY PENDING LEGAL REVIEW]</p>
                <p className="gw__card-text">The details they entered are deleted after 30 days. [COPY PENDING LEGAL REVIEW]</p>
              </div>
              {error && <Alert>{error}</Alert>}
              <div className="gw__actions">
                <button type="submit" className="gw__button gw__button--primary" disabled={busy}>
                  {busy ? "Withdrawing…" : "Withdraw consent"}
                </button>
                <Link to="/" className="gw__button gw__button--outline">
                  Cancel
                </Link>
              </div>
            </form>
          </>
        )}

        {step === "success" && (
          <>
            <Icon />
            <Header headingRef={headingRef} title="Consent withdrawn">
              Your withdrawal has been recorded and the account has been closed. [COPY PENDING LEGAL REVIEW]
            </Header>
            <div className="gw__card">
              <p className="gw__card-title">What happens next</p>
              <p className="gw__card-text">The details they entered are deleted after 30 days. [COPY PENDING LEGAL REVIEW]</p>
              <p className="gw__card-text">We have emailed the account holder to tell them. [COPY PENDING LEGAL REVIEW]</p>
            </div>
            <div className="gw__actions">
              <Link to="/" className="gw__button gw__button--outline">
                Done
              </Link>
            </div>
          </>
        )}

        {step === "invalid" && (
          <>
            <AlertIcon />
            <Header headingRef={headingRef} title="This withdrawal link can’t be used">
              The link may already have been used, or it may have expired. Nothing has been changed.
            </Header>
            <div className="gw__panel">
              <p className="gw__panel-text">You can ask for a new withdrawal link at any time.</p>
            </div>
            <div className="gw__actions">
              <button type="button" className="gw__button gw__button--primary" onClick={backToRequest}>
                Request a new link
              </button>
              <Link to="/" className="gw__button gw__button--outline">
                Done
              </Link>
            </div>
          </>
        )}

        {step === "throttled" && (
          <>
            <AlertIcon />
            <Header headingRef={headingRef} title="Too many attempts">
              You have tried too many times in a short while. Please wait a little and try again.
            </Header>
            <div className="gw__panel">
              <p className="gw__panel-text">Nothing has been changed.</p>
            </div>
            <div className="gw__actions">
              <button type="button" className="gw__button gw__button--primary" onClick={backToRequest}>
                Try again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Header({
  title,
  headingRef,
  children,
}: {
  title: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  children: string;
}) {
  return (
    <div className="gw__header">
      <h1 className="gw__heading" ref={headingRef} tabIndex={-1}>
        {title}
      </h1>
      <p className="gw__lead">{children}</p>
    </div>
  );
}

function Icon() {
  return <img className="gw__icon" src={checkIcon} alt="" width={88} height={88} />;
}

function AlertIcon() {
  return (
    <div className="gw__icon gw__icon--alert" aria-hidden="true">
      !
    </div>
  );
}

function Alert({ children }: { children: string }) {
  return (
    <p className="gw__alert" role="alert">
      {children}
    </p>
  );
}
