// Shared two-pane shell for the auth flow (Login, Signup, Forgot Password,
// Reset Password, Guardian Consent -- PRs F2-F5). Left pane renders form
// content; right pane renders a decorative illustration and collapses on
// narrow viewports.
//
// Figma source: "Forgot Password" (node 409:1264) and "Reset Password"
// (node 409:1463) in the "Soccernity-MVP" file (weZWWqggy9j13eX8bhFgs6)
// draw this as a fixed 1440x900 canvas with its own logo lockup and no site
// header/nav. That doesn't match this app: apps/web/src/app/router.tsx (PR
// F1, merged) nests every auth route as a child of the shared AppShell,
// which always renders the site Header (logo + nav) above routed content.
// Rather than duplicate a second logo/nav inside this pane -- which would
// visually double up under the real Header -- this layout starts below the
// Header and is fluid/responsive instead of a fixed 1440x900 canvas. Flagged
// as a Figma-vs-ground-truth conflict in the PR report; a human should
// confirm this is the right call (vs. giving auth routes a header-less
// layout route) rather than it being silently picked.
import type { ReactNode } from "react";
import authIllustration from "../../assets/illustrations/auth-goalkeeper.svg";
import "./Auth.css";

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="sn-auth">
      <div className="sn-auth__panel">
        <div className="sn-auth__panel-inner">{children}</div>
      </div>
      <div className="sn-auth__illustration" aria-hidden="true">
        <img src={authIllustration} alt="" />
      </div>
    </div>
  );
}
