// Chrome for the core auth routes: /login, /signup, /forgot-password,
// /reset-password. These render under this layout instead of AppShell, so
// they get the simple logo-only "Top Bar -- Soccernity" (AuthTopBar) and
// NOT the full site Header (content-icon nav + logged-in/out auth
// cluster).
//
// Founder decision, Build Plan Decision Log #172 (see also LoginPage.tsx's
// header comment): these four screens are pre-session and stand alone --
// the site Header's nav and auth cluster are noise on them, and it
// duplicated the wordmark / showed a "Login" affordance while the user
// was already on /login. The Figma frames for the adjacent auth-flow
// screens (Guardian Consent, Verify Email, Club Picker) already draw
// exactly this bar; this makes the shipped app match.
//
// The other auth-flow routes (/guardian-consent, /guardian-consent/confirm,
// /verify-email) and /profile deliberately stay under AppShell -- they
// were built to render full-bleed *within* AppShell's content area (see
// each one's own CSS header comment) and are out of scope for this
// change.
//
// __content keeps the same 32px padding AppShell uses on purpose: the
// auth screens cancel it with a negative margin for their full-bleed
// panels (LoginPage.css, SignupSplitScreen.css, ClubPickerStep.css), and
// changing it here would break that math for no benefit.
import { Outlet } from "react-router";
import AuthTopBar from "./AuthTopBar";
import "./AuthChrome.css";

export default function AuthChrome() {
  return (
    <div className="sn-auth-chrome">
      <AuthTopBar />
      <main className="sn-auth-chrome__content">
        <Outlet />
      </main>
    </div>
  );
}
