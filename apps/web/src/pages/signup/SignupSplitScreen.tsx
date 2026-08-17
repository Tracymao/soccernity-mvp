// Shared two-panel shell for all three signup-entry screens (Age Gate,
// Guardian Details Capture, Register). Figma renders each as a fixed
// 1440x900(+) canvas with no site header; this app nests every route
// (including this one) inside AppShell, which always renders the global
// Header (see src/layout/AppShell.tsx, src/app/router.tsx). That's a real
// layout conflict between the Figma design and this app's existing routing
// architecture -- flagged in this PR's report rather than silently
// reworking AppShell, which F1 built and other Sprint 1 PRs (F2/F4/F5/F6)
// depend on concurrently. The `margin: -32px` below cancels AppShell's
// content padding so this still reads as full-bleed *below* the header,
// the closest approximation available without touching shared layout.
import type { ReactNode, CSSProperties } from "react";
import { Link } from "react-router-dom";
import logoMark from "../../assets/icons/soccernity-logo-mark.svg";
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
      <div className="signup-split__left">
        <Link to="/" className="signup-split__logo" aria-label="Soccernity home">
          <img src={logoMark} alt="" width={32} height={32} />
          <span>Soccernity</span>
        </Link>
        {children}
      </div>
      <div className="signup-split__right">{rightPanel}</div>
    </div>
  );
}
