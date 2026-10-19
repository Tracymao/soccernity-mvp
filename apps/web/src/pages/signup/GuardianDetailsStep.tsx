// Guardian Details Capture -- Figma node 5108:6627
// ("Guardian Consent — 2 Guardian Details Capture"). Reached only when the
// Age Gate step declared an age under 18 (Decision Log #8).
//
// Per Build Plan Section 8.3 step 2, this screen captures guardian name,
// email and relationship "before account creation completes" -- account
// creation itself still happens on Register (matching Section 4.1's
// separate POST /auth/register vs POST /auth/guardian-consent endpoints,
// and Guardian.minorUserId in Section 3, which can only exist once a User
// row does). So "Send approval request" below advances to Register with
// these details carried forward, rather than firing a network request of
// its own -- the actual account-creation + guardian-consent-request
// happens together once Register is submitted. See SignupFlow.tsx.
//
// B-075 (Decision Log #393 (a), Option A): ONE "Guardian's full name" field
// (Figma 5108:6627 / mobile 5539:7354) posted as the single `guardian.name`
// RegisterDto already takes, and NO country select -- the country is
// collected once, at the Age Gate (B-073). Link lifetime reads "3 days" per
// the frame (72h TTL, Decision Log #62).
import { useState } from "react";
import type { FormEvent } from "react";
import SignupSplitScreen from "./SignupSplitScreen";
import DecorativeRings from "./DecorativeRings";
import { lightAuthThemeVars } from "./authThemeVars";
import { formatLongDate } from "./age";
import { GUARDIAN_RELATIONSHIP_OPTIONS } from "./types";
import type { AgeGateValues, GuardianDetailsValues } from "./types";
import "./SignupSplitScreen.css";

interface GuardianDetailsStepProps {
  dob: AgeGateValues;
  age: number;
  initialValues: GuardianDetailsValues;
  onBack: () => void;
  // eslint-disable-next-line no-unused-vars -- named param in a function-
  // type signature, not a real function body; see AgeGateStep.tsx for why.
  onContinue: (values: GuardianDetailsValues) => void;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function GuardianDetailsStep({ dob, age, initialValues, onBack, onContinue }: GuardianDetailsStepProps) {
  const [name, setName] = useState(initialValues.name);
  const [email, setEmail] = useState(initialValues.email);
  const [relationship, setRelationship] = useState(initialValues.relationship);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!name.trim()) {
      setError("Enter your guardian's full name.");
      return;
    }
    if (!isValidEmail(email)) {
      setError("Enter a valid email address for your guardian.");
      return;
    }
    if (!relationship) {
      setError("Select their relationship to you.");
      return;
    }

    setError(null);
    onContinue({ name: name.trim(), email, relationship });
  }

  return (
    <SignupSplitScreen
      variant="light"
      rightTone="navy"
      themeVars={lightAuthThemeVars}
      rightPanel={
        <>
          <DecorativeRings className="signup-split__rings" />
          <div className="signup-split__right-copy">
            <h2>A grown-up needs to say yes first.</h2>
            <p>
              We will email your parent or guardian a link. They read what Soccernity is, what we collect, and then
              approve or decline. Nothing goes public until they do.
            </p>
          </div>
        </>
      }
    >
      <p className="signup-split__eyebrow">Guardian approval</p>
      <h1 className="signup-split__heading">Ask a parent or guardian to approve your account</h1>
      <p className="signup-split__subheading">
        You told us you were born on {formatLongDate(dob)}, so you are {age}. We need a parent or guardian to give
        permission before your account goes live.
      </p>

      <form className="signup-form" onSubmit={handleSubmit} noValidate>
        <div className="signup-form__group">
          <label className="signup-form__label" htmlFor="guardian-name">
            Guardian&rsquo;s full name
          </label>
          <input
            id="guardian-name"
            className="signup-form__input"
            placeholder="Parent or guardian’s name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
          />
        </div>

        <div className="signup-form__group">
          <label className="signup-form__label" htmlFor="guardian-email">
            Guardian&rsquo;s email address
          </label>
          <input
            id="guardian-email"
            className="signup-form__input"
            type="email"
            placeholder="parent@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
          <p className="signup-form__hint">Double-check this. The approval link goes here and nowhere else.</p>
        </div>

        <div className="signup-form__group">
          <label className="signup-form__label" htmlFor="guardian-relationship">
            Their relationship to you
          </label>
          <select
            id="guardian-relationship"
            className="signup-form__select"
            value={relationship}
            onChange={(event) => setRelationship(event.target.value as GuardianDetailsValues["relationship"])}
          >
            <option value="" disabled>
              Select relationship
            </option>
            {GUARDIAN_RELATIONSHIP_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="signup-form-error" role="alert">
            {error}
          </p>
        )}

        <div className="signup-info-panel">
          <p className="signup-info-panel__title">What we send them</p>
          <p className="signup-info-panel__body">
            One email with a secure link. It explains what your account can do, what we collect, and lets them
            approve or decline. The link expires after 3 days.
          </p>
        </div>

        <button type="submit" className="signup-button">
          Send approval request
        </button>

        {/* Verbatim Figma copy for node 5111:6669, including its own
            "[COPY PENDING LEGAL REVIEW]" bracket -- that's the designer's
            placeholder note baked into the frame text, not something this
            PR added. Left as-is; DPIA/legal sign-off (Build Plan Section
            8.1) owns finalising it, not figma-to-code. */}
        <p className="signup-form__fineprint">
          We only use this email address to request and record consent. [COPY PENDING LEGAL REVIEW]
        </p>
      </form>

      <button type="button" className="signup-split__back" onClick={onBack}>
        Back
      </button>
    </SignupSplitScreen>
  );
}
