// Shared two-pane card for the Forgot Password and Reset Password screens
// (PR F4). Left pane renders form content; right pane renders a decorative
// illustration and collapses on narrow viewports.
//
// Figma source: "Forgot Password" (node 409:1264) and "Reset Password"
// (node 409:1463) in the "Soccernity-MVP" file (weZWWqggy9j13eX8bhFgs6)
// draw this as a fixed 1440x900 canvas with just a logo bar and no site
// nav.
//
// DECISION LOG #172, resolved: /forgot-password and /reset-password (with
// /login and /signup) render under AuthChrome, which supplies the
// logo-only "Top Bar -- Soccernity" -- not AppShell's full site Header.
// So this card no longer needs its own logo lockup, and the earlier
// stopgap of "start below the Header, fluid instead of fixed" is now the
// actual intended layout: a responsive card sitting under the 90px Top
// Bar, inside AuthChrome's 32px content gutter (same gutter AppShell used
// to give it).
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
