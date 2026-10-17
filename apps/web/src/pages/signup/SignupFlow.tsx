// Step machine for the signup entry flow (Sprint 1, PR F3).
//
// Age Gate (Figma 5108:6626)
//   -> under 18 (Decision Log #8): Guardian Details Capture (5108:6627)
//        -> Register (407:1051)
//   -> 18+: Register (407:1051) directly
//
// B-073: the Age Gate also collects the country, held here and sent on
// Register for every signup (RegisterDto.countryCode). B-075: Guardian
// Details no longer asks for a country.
//
// All three steps live under the single /signup route wired by F1
// (src/app/router.tsx: "F3 (age gate + signup)") -- this is deliberate,
// matching how Register (407:1051) has no dedicated Figma screen of its
// own in this flow's numbering and the flow is one continuous signup
// journey, not three separate pages a user could deep-link into
// mid-flow (a mid-flow deep link would have no DOB/guardian state to
// resume from). See Build Plan Section 8.3 for the six-screen safeguarding
// workflow this implements steps 1-2 of (steps 3-6 -- the consent email,
// the guardian's own confirmation screen, and activation -- are backend
// and PR F5's guardian-consent route, not this PR's scope).
import { useState } from "react";
import AgeGateStep from "./AgeGateStep";
import GuardianDetailsStep from "./GuardianDetailsStep";
import RegisterStep from "./RegisterStep";
import type { AgeGateValues, GuardianDetailsValues } from "./types";

type Step = "age-gate" | "guardian-details" | "register";

const EMPTY_DOB: AgeGateValues = { day: "", month: "", year: "" };
const EMPTY_GUARDIAN: GuardianDetailsValues = { name: "", email: "", relationship: "" };

export default function SignupFlow() {
  const [step, setStep] = useState<Step>("age-gate");
  const [dob, setDob] = useState<AgeGateValues>(EMPTY_DOB);
  const [country, setCountry] = useState("");
  const [age, setAge] = useState(0);
  const [isMinor, setIsMinor] = useState(false);
  const [guardianDetails, setGuardianDetails] = useState<GuardianDetailsValues>(EMPTY_GUARDIAN);

  switch (step) {
    case "age-gate":
      return (
        <AgeGateStep
          initialValues={dob}
          initialCountry={country}
          // B-073 / Decision Log #394 A4: a below-minimum-age denial followed
          // by "Back to sign up" drops the held date of birth AND country.
          onDenialBack={() => {
            setDob(EMPTY_DOB);
            setCountry("");
          }}
          onContinue={(values, computedAge, minor, selectedCountry) => {
            setDob(values);
            setCountry(selectedCountry);
            setAge(computedAge);
            setIsMinor(minor);
            setStep(minor ? "guardian-details" : "register");
          }}
        />
      );

    case "guardian-details":
      return (
        <GuardianDetailsStep
          dob={dob}
          age={age}
          initialValues={guardianDetails}
          onBack={() => setStep("age-gate")}
          onContinue={(values) => {
            setGuardianDetails(values);
            setStep("register");
          }}
        />
      );

    case "register":
      return (
        <RegisterStep dob={dob} country={country} isMinor={isMinor} guardianDetails={isMinor ? guardianDetails : null} />
      );

    default:
      return null;
  }
}
