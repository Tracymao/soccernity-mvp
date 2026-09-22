// Two-Factor Auth (SMS) leaf. Figma: "Settings — Two-Factor Auth (SMS)"
// 2926:8294 (desktop) / "…— Mobile" 5696:8213.
//
// NOTE ON FIGMA ACCESS — same disclosure as SecurityOverviewPage.tsx: this
// PR was built without live Figma MCP access. Reconstructed from
// docs/sprint-2-component-hygiene-toggles-nav-report.md (the two real
// toggle rows on this frame, "Text message" / "Authentication app", and
// their component swap to the shared `Settings Toggle` control) and
// docs/sprint-2-settings-desktop-scaffolding-sweep-report.md (confirming
// this frame's only OTHER piece of content — a "Submit" button — was dead,
// hidden (visible:false) scaffolding, deleted as never-rendered; the real
// frame has no submit action at all, just the two toggle rows). Row
// descriptions below are NOT literal Figma copy — no source in this
// codebase records description text for either row — they're a plain,
// disclosed best-effort gloss, flagged in the PR report.
//
// NO LIVE 2FA BACKEND EXISTS. Checked directly: no 2FA/TOTP/SMS-verification
// module anywhere in services/api (grep across services/api/src for
// "two.?factor|totp|2fa" returns nothing). Per CLAUDE.md's standing
// discipline and this app's own established precedent for this exact
// situation (PrivacySettingsPage.tsx's disabled toggles/rows, each visible
// with a plain-language note — never a control that looks live but
// silently does nothing), both rows below render as real, visible,
// PERMANENTLY-DISABLED toggles with a note explaining why. There is no
// Save/Submit action to fake a success path for — the Figma frame itself
// never had one (its own "Submit" button was dead, hidden scaffolding,
// confirmed and deleted in Figma before this PR — see the sweep report
// above), so nothing here pretends a change was saved.
import { Link } from "react-router";
import { getStoredAccessToken } from "../../lib/session";
import "./SettingsSecurityPage.css";

interface Row {
  id: string;
  label: string;
  desc: string;
}

const ROWS: Row[] = [
  { id: "sms", label: "Text message", desc: "Get a one-time code by text message when you sign in." },
  {
    id: "app",
    label: "Authentication app",
    desc: "Use an authenticator app to generate sign-in codes.",
  },
];

function DisabledToggle({ label }: { label: string }) {
  // Purely visual, always off, always disabled — neither method has a
  // backend to turn on. Same "colour + knob position, never colour alone"
  // discipline as PrivacySettingsPage's VisualToggle.
  return (
    <span className="security-toggle" role="img" aria-label={`${label}: off (not adjustable yet)`}>
      <span className="security-toggle__knob" />
    </span>
  );
}

export default function TwoFactorAuthPage() {
  if (!getStoredAccessToken()) {
    return (
      <p className="settings-status" role="status">
        Log in to manage two-factor authentication. <Link to="/login">Log in</Link>
      </p>
    );
  }

  return (
    <div className="settings-page">
      <div>
        <h2 className="settings-page__title">Two-factor authentication</h2>
        <p className="settings-page__lead">
          Add a second step when you sign in, on top of your password.
        </p>
      </div>

      <ul className="security-rows">
        {ROWS.map((r) => (
          <li key={r.id} className="security-row">
            <div className="security-row__body">
              <p className="security-row__title">{r.label}</p>
              <p className="security-row__desc">{r.desc}</p>
              <p className="security-row__note">
                Not adjustable yet — two-factor authentication isn&rsquo;t available yet. This needs a
                backend security module first.
              </p>
            </div>
            <DisabledToggle label={r.label} />
          </li>
        ))}
      </ul>
    </div>
  );
}
