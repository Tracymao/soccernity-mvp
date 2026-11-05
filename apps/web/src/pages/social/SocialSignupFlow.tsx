// A NEW person who signed in with Google or Facebook (B-085; Decision Log #378, #468; backend B-084).
//
// The callback answered `registration_required`: the provider proved who they are, but NO account exists yet. This
// flow is rendered by SocialCallbackPage and holds the social registration token in component state only (never in
// storage or the URL). Steps, in the order the founder decided (#468):
//
//   (Facebook gave no email)  Enter your email -> Enter the code we sent   Figma 6966:46142 / 6966:46212
//   Hand-off: "One more step"                                              Figma 6966:46438
//   Age Gate -> (under 18) Guardian details                                the EXISTING steps, unchanged
//   Create account                                                         no frame (see SocialFinishStep)
//
// The Age Gate and the guardian flow ALWAYS apply after a social sign-in and no step is skipped. The provider's own
// date of birth is never asked for or used: the date of birth comes only from the Age Gate.
import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import AgeGateStep from "../signup/AgeGateStep";
import GuardianDetailsStep from "../signup/GuardianDetailsStep";
import SignupSplitScreen from "../signup/SignupSplitScreen";
import { lightAuthThemeVars } from "../signup/authThemeVars";
import { toIsoDate } from "../signup/age";
import registerIllustration from "../../assets/signup/register-illustration.svg";
import type { AgeGateValues, GuardianDetailsValues } from "../signup/types";
import {
  SOCIAL_EMAIL_CODE_INVALID,
  SOCIAL_EMAIL_CODE_RATE_LIMITED,
  SOCIAL_PROVIDER_LABELS,
  SOCIAL_REGISTRATION_INVALID,
  SOCIAL_SIGNUP_UNAVAILABLE,
  registerSocial,
  requestSocialEmailCode,
  verifySocialEmailCode,
  type SocialProfile,
  type SocialProvider,
} from "../../api/socialAuth";
import { AuthApiError } from "../../api/auth";
import { storeSession } from "../../lib/session";
import { routeForNextStep } from "../../lib/onboarding";
import SocialScreen from "./SocialScreen";
import "../signup/SignupSplitScreen.css";
import "./social.css";

type Step = "email" | "code" | "handoff" | "age-gate" | "guardian-details" | "finish" | "expired";

const EMPTY_DOB: AgeGateValues = { day: "", month: "", year: "" };
const EMPTY_GUARDIAN: GuardianDetailsValues = { name: "", email: "", relationship: "" };

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

interface Props {
  provider: SocialProvider;
  socialRegistrationToken: string;
  profile: SocialProfile;
}

export default function SocialSignupFlow({ provider, socialRegistrationToken, profile }: Props) {
  const [step, setStep] = useState<Step>(profile.needsEmail ? "email" : "handoff");
  // The email shown on the last step: the provider's, or the one the person typed and verified.
  const [email, setEmail] = useState(profile.email ?? "");
  const [typedEmail, setTypedEmail] = useState("");
  const [dob, setDob] = useState<AgeGateValues>(EMPTY_DOB);
  const [country, setCountry] = useState("");
  const [age, setAge] = useState(0);
  const [isMinor, setIsMinor] = useState(false);
  const [guardian, setGuardian] = useState<GuardianDetailsValues>(EMPTY_GUARDIAN);
  const label = SOCIAL_PROVIDER_LABELS[provider];

  switch (step) {
    case "email":
      return (
        <EnterEmailStep
          providerLabel={label}
          token={socialRegistrationToken}
          initialEmail={typedEmail}
          onSent={(sentTo) => {
            setTypedEmail(sentTo);
            setStep("code");
          }}
          onExpired={() => setStep("expired")}
        />
      );

    case "code":
      return (
        <EnterCodeStep
          token={socialRegistrationToken}
          email={typedEmail}
          onVerified={(verified) => {
            setEmail(verified);
            setStep("handoff");
          }}
          onChangeEmail={() => setStep("email")}
          onExpired={() => setStep("expired")}
        />
      );

    case "handoff":
      return <HandOffStep onContinue={() => setStep("age-gate")} />;

    case "age-gate":
      return (
        <AgeGateStep
          initialValues={dob}
          initialCountry={country}
          onDenialBack={() => {
            setDob(EMPTY_DOB);
            setCountry("");
          }}
          onContinue={(values, computedAge, minor, selectedCountry) => {
            setDob(values);
            setCountry(selectedCountry);
            setAge(computedAge);
            setIsMinor(minor);
            setStep(minor ? "guardian-details" : "finish");
          }}
        />
      );

    case "guardian-details":
      return (
        <GuardianDetailsStep
          dob={dob}
          age={age}
          initialValues={guardian}
          onBack={() => setStep("age-gate")}
          onContinue={(values) => {
            setGuardian(values);
            setStep("finish");
          }}
        />
      );

    case "finish":
      return (
        <SocialFinishStep
          token={socialRegistrationToken}
          initialName={profile.displayName}
          email={email}
          dob={dob}
          country={country}
          isMinor={isMinor}
          guardianDetails={isMinor ? guardian : null}
          onExpired={() => setStep("expired")}
        />
      );

    case "expired":
      return (
        <SocialScreen
          title="This sign-in has expired"
          body={<p className="social-screen__body">Start again from the log-in page.</p>}
        >
          <div className="social-screen__actions">
            <Link className="social-secondary" to="/login">
              Back to log in
            </Link>
          </div>
        </SocialScreen>
      );

    default:
      return null;
  }
}

// ---- Enter your email (Figma 6966:46142, invalid email 6966:46212) -----------------------------------------------

function EnterEmailStep({
  providerLabel,
  token,
  initialEmail,
  onSent,
  onExpired,
}: {
  providerLabel: string;
  token: string;
  initialEmail: string;
  onSent: (email: string) => void;
  onExpired: () => void;
}) {
  const [value, setValue] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const trimmed = value.trim();
    if (!isValidEmail(trimmed)) {
      setError("Enter a valid email address, for example name@example.com.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await requestSocialEmailCode(token, trimmed);
      onSent(trimmed);
    } catch (err) {
      const code = err instanceof AuthApiError ? err.code : undefined;
      if (code === SOCIAL_REGISTRATION_INVALID) {
        onExpired();
      } else if (code === SOCIAL_EMAIL_CODE_RATE_LIMITED) {
        setError("Too many codes have been requested. Start again from the log-in page.");
      } else if (err instanceof AuthApiError && err.status === 400) {
        setError("Enter a valid email address, for example name@example.com.");
      } else {
        setError("Couldn’t send the code. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SocialScreen
      title="Enter your email"
      body={
        // The Figma copy says "we'll send you a link to confirm it". The API sends a 6-digit CODE, so the wording
        // says code (frame vs server: the server wins; flagged for a Figma follow-up).
        <p className="social-screen__body">
          {providerLabel} didn’t share an email address with us. Enter the one you want to use and we’ll send you a code
          to confirm it.
        </p>
      }
    >
      <form className="social-form" onSubmit={submit} noValidate>
        <div className="social-field">
          <label className="social-field__label" htmlFor="social-email">
            Email
          </label>
          <input
            id="social-email"
            className="social-field__input"
            type="email"
            autoComplete="email"
            placeholder="example@website.com"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "social-email-error" : undefined}
          />
        </div>
        {error && (
          <p className="social-error" role="alert" id="social-email-error">
            <span className="social-error__bar" aria-hidden="true" />
            {error}
          </p>
        )}
        <button type="submit" className="social-primary" disabled={busy}>
          {busy ? "Sending…" : "Continue"}
        </button>
        <Link className="social-link" to="/login">
          Use a different sign-in method
        </Link>
      </form>
    </SocialScreen>
  );
}

// ---- Enter the code (no Figma frame: the frames drew a link; the API sends a code) --------------------------------

function EnterCodeStep({
  token,
  email,
  onVerified,
  onChangeEmail,
  onExpired,
}: {
  token: string;
  email: string;
  onVerified: (email: string) => void;
  onChangeEmail: () => void;
  onExpired: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const result = await verifySocialEmailCode(token, code);
      onVerified(result.email);
    } catch (err) {
      const errCode = err instanceof AuthApiError ? err.code : undefined;
      if (errCode === SOCIAL_REGISTRATION_INVALID) {
        onExpired();
      } else if (errCode === SOCIAL_EMAIL_CODE_INVALID) {
        setError("That code didn’t work. Check it, or ask for a new one.");
      } else {
        setError("Couldn’t check the code. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (busy) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await requestSocialEmailCode(token, email);
      setCode("");
      setNotice("We sent a new code.");
    } catch (err) {
      const errCode = err instanceof AuthApiError ? err.code : undefined;
      if (errCode === SOCIAL_REGISTRATION_INVALID) {
        onExpired();
      } else if (errCode === SOCIAL_EMAIL_CODE_RATE_LIMITED) {
        setError("Too many codes have been requested. Start again from the log-in page.");
      } else {
        setError("Couldn’t send a new code. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SocialScreen
      title="Check your email"
      body={
        <p className="social-screen__body">
          We sent a 6-digit code to {email}. Enter it here to confirm your email address.
        </p>
      }
    >
      <form className="social-form" onSubmit={submit} noValidate>
        <div className="social-field">
          <label className="social-field__label" htmlFor="social-code">
            Code
          </label>
          <input
            id="social-code"
            className="social-field__input social-field__input--code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            aria-invalid={error ? true : undefined}
          />
        </div>
        {error && (
          <p className="social-error" role="alert">
            <span className="social-error__bar" aria-hidden="true" />
            {error}
          </p>
        )}
        {notice && (
          <p className="social-screen__body" role="status">
            {notice}
          </p>
        )}
        <button type="submit" className="social-primary" disabled={busy}>
          {busy ? "Checking…" : "Continue"}
        </button>
        <button type="button" className="social-link" onClick={() => void resend()} disabled={busy}>
          Send a new code
        </button>
        <button type="button" className="social-link" onClick={onChangeEmail}>
          Use a different email
        </button>
      </form>
    </SocialScreen>
  );
}

// ---- Hand-off to the Age Gate (Figma 6966:46438) -----------------------------------------------------------------

function HandOffStep({ onContinue }: { onContinue: () => void }) {
  return (
    <SocialScreen
      title="One more step"
      body={
        <>
          <p className="social-screen__body">Before we create your account, we need to check your age.</p>
          {/* Tagged [COPY PENDING LEGAL REVIEW] in Figma (6966:46508) -- implemented as drawn, pending counsel. */}
          <p className="social-screen__body">
            Next you’ll enter your date of birth and country. We don’t use a date of birth from Google or Facebook. [COPY
            PENDING LEGAL REVIEW]
          </p>
        </>
      }
    >
      <div className="social-screen__actions social-screen__actions--loose">
        <button type="button" className="social-primary" onClick={onContinue}>
          Continue
        </button>
        <Link className="social-link" to="/login">
          Cancel
        </Link>
      </div>
    </SocialScreen>
  );
}

// ---- Create account (NO Figma frame) -----------------------------------------------------------------------------
//
// Built on the Register screen's own shell and fields (Figma 407:1051 / RegisterStep) because no frame draws this
// step: the name (a provider gives one name; the Register steps collect first and last), the verified email read
// only, the date of birth read only (from the Age Gate), and the same Terms and Privacy line. Flagged for a Figma
// follow-up. There is no password: a social account gets an unusable one on the server.

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function SocialFinishStep({
  token,
  initialName,
  email,
  dob,
  country,
  isMinor,
  guardianDetails,
  onExpired,
}: {
  token: string;
  initialName: string;
  email: string;
  dob: AgeGateValues;
  country: string;
  isMinor: boolean;
  guardianDetails: GuardianDetailsValues | null;
  onExpired: () => void;
}) {
  const navigate = useNavigate();
  const initial = splitName(initialName);
  const [firstName, setFirstName] = useState(initial.first);
  const [lastName, setLastName] = useState(initial.last);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!firstName.trim() || !lastName.trim()) {
      setError("Enter your full name.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await registerSocial({
        socialRegistrationToken: token,
        displayName: `${firstName.trim()} ${lastName.trim()}`,
        dateOfBirth: toIsoDate(dob),
        countryCode: country,
        ...(isMinor && guardianDetails
          ? {
              guardian: {
                name: guardianDetails.name.trim(),
                email: guardianDetails.email.trim(),
                relationship: guardianDetails.relationship as Exclude<GuardianDetailsValues["relationship"], "">,
              },
            }
          : {}),
      });
      storeSession(result);
      navigate(routeForNextStep(result.user.nextStep), { replace: true });
    } catch (err) {
      const code = err instanceof AuthApiError ? err.code : undefined;
      if (code === SOCIAL_REGISTRATION_INVALID) {
        onExpired();
      } else if (code === SOCIAL_SIGNUP_UNAVAILABLE) {
        // One generic answer that names no cause, so neither does this line.
        setError(
          "We couldn’t create an account with this sign-in. If you already have a Soccernity account, log in with your email and password.",
        );
      } else {
        setError(err instanceof AuthApiError && err.status === 400 ? err.message : "Something went wrong. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SignupSplitScreen
      variant="light"
      themeVars={lightAuthThemeVars}
      rightPanel={<img src={registerIllustration} alt="" className="signup-split__illustration" />}
    >
      <h1 className="signup-split__heading">Create your account</h1>
      <p className="signup-split__subheading">Check your details, then create your Soccernity account.</p>

      <form className="signup-form" onSubmit={submit} noValidate>
        <div className="signup-form__group">
          <span className="signup-form__label" id="social-name-label">
            Full Name
          </span>
          <div className="signup-form__row" role="group" aria-labelledby="social-name-label">
            <input
              className="signup-form__input"
              placeholder="First Name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              aria-label="First name"
              autoComplete="given-name"
            />
            <input
              className="signup-form__input"
              placeholder="Last Name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              aria-label="Last name"
              autoComplete="family-name"
            />
          </div>
        </div>

        <div className="signup-form__group">
          <label className="signup-form__label" htmlFor="social-finish-email">
            Email
          </label>
          <input id="social-finish-email" className="signup-form__input" value={email} readOnly aria-readonly="true" />
        </div>

        <div className="signup-form__group">
          <label className="signup-form__label" htmlFor="social-finish-dob">
            Date of Birth
          </label>
          <input
            id="social-finish-dob"
            className="signup-form__input"
            value={`${dob.day.padStart(2, "0")} / ${dob.month.padStart(2, "0")} / ${dob.year}`}
            readOnly
            aria-readonly="true"
          />
        </div>

        {error && (
          <p className="signup-form-error" role="alert">
            {error}
          </p>
        )}

        <p className="signup-form__fineprint">
          By creating an account, you agree to our{" "}
          <a className="signup-form__accent-text" href="/terms" target="_blank" rel="noopener noreferrer">
            Terms
          </a>{" "}
          and have read and acknowledge the{" "}
          <a className="signup-form__accent-text" href="/privacy" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>
          .
        </p>

        <button type="submit" className="signup-button" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="signup-split__footer">
        Changed your mind? <Link to="/login">Back to log in.</Link>
      </p>
    </SignupSplitScreen>
  );
}
