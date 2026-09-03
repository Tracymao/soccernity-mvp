// Shared two-panel shell for all three signup-entry screens (Age Gate,
// Guardian Details Capture, Register). Figma renders each as a fixed
// 1440x900(+) canvas with just a logo bar and no site nav.
//
// DECISION LOG #172, resolved: the /signup route (and /login, /forgot-
// password, /reset-password) render under AuthChrome, which supplies the
// logo-only "Top Bar -- Soccernity" -- not AppShell's full site Header.
// So this component no longer draws its own wordmark lockup (it would
// double up under the Top Bar). AuthChrome keeps AppShell's 32px content
// padding, so SignupSplitScreen.css's `margin: -32px` full-bleed
// technique is unchanged.
import type { ReactNode, CSSProperties } from "react";
import "./SignupSplitScreen.css";

interface SignupSplitScreenProps {
  variant: "dark" | "light";
  themeVars: CSSProperties;
  /** Left panel content, rendered below the logo (eyebrow/heading/form/etc). */
  children: ReactNode;
  /** Right panel content -- safeguarding copy + rings, or the Register illustration. */
  rightPanel: ReactNode;
}

export default function SignupSplitScreen({ variant, themeVars, children, rightPanel }: SignupSplitScreenProps) {
  return (
    <div className={`signup-split signup-split--${variant}`} style={themeVars}>
      <div className="signup-split__left">{children}</div>
      <div className="signup-split__right">{rightPanel}</div>
    </div>
  );
}
