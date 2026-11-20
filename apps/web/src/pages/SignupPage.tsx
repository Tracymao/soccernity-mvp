// PR F3 -- Sprint 1 signup entry flow.
//
// Age Gate (Figma 5108:6626) -> branch: under 18 -> Guardian Details
// Capture (5108:6627) -> Register (407:1051); 18+ -> Register directly.
// See src/pages/signup/SignupFlow.tsx for the step machine, and this PR's
// report for the Figma/Build-Plan conflicts this flow surfaced.
import SignupFlow from "./signup/SignupFlow";

export default function SignupPage() {
  return <SignupFlow />;
}
