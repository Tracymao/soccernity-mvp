// Two-Factor Auth (SMS) leaf. Figma: "Settings — Two-Factor Auth (SMS)"
// 2926:8294 (desktop) / "…— Mobile" 5696:8213.
//
// VERIFIED against live Figma MCP access (sprint-2/settings-figma-verification,
// 2026-09-22), replacing the prior no-access reconstruction. Real copy pulled
// directly from both nodes: desktop's two row descriptions ("Text message" /
// "Authentication app") now match Figma verbatim — the earlier best-effort
// gloss was wrong. Desktop carries no lead paragraph under the header at all
// (jumps straight from the title to the two rows); mobile does have one
// ("Choose a second way to confirm it's you when you log in."). Since this
// app renders one shared component for both breakpoints, mobile's real copy
// is used as the lead rather than inventing text or omitting one entirely —
// real content from either breakpoint beats invented content. This frame's
// only OTHER piece of content — a "Submit" button — was already confirmed
// dead, hidden (visible:false) scaffolding, deleted in Figma before this
// codebase's own settings-desktop-scaffolding-sweep session; the real frame
// has no submit action at all, just the two toggle rows.
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
  {
    id: "sms",
    label: "Text message",
    desc: "Use your mobile phone to receive a text message with an authentication code to enter when you log in to Soccernity.",
  },
  {
    id: "app",
    label: "Authentication app",
    desc: "Use your mobile authentication app to receive an authentication code to enter when you log in to Soccernity.",
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
          Choose a second way to confirm it&rsquo;s you when you log in.
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
