// Muted accounts leaf. Figma: "Settings — Muted accounts" 2926:9482
// (desktop, formerly "Settings — Mute New Accounts" — renamed by
// sprint-2/settings-duplicate-clusters-consolidation, Decision Log
// #230/#247, decision #5: the screen covers three groups, not just "new
// accounts", so "Muted accounts" fits better) / "…— Mobile" 5696:8307.
//
// NOTE ON FIGMA ACCESS — same disclosure as the other Notification
// Preferences leaves: built without live Figma MCP access, reconstructed
// from docs/sprint-2-settings-family-consolidation-audit-report.md and
// docs/sprint-2-mobile-settings-community-message-rebuild-report.md,
// which both record this frame's exact 3 rows directly: "People you
// don't follow", "People who don't follow you", "People with a new
// account" — under a "Mute notifications from people:" framing. Row
// descriptions are NOT literal Figma copy — no source records any — a
// plain, disclosed best-effort gloss, same discipline as
// TwoFactorAuthPage.tsx.
//
// NO LIVE MUTE/BLOCK BACKEND EXISTS. Checked directly: no mute or block
// concept anywhere in services/api (grep across services/api/src for
// "\bmute|\bblock(ed)?User" returns nothing) — there is no per-caller
// content-muting mechanism at all, only the unrelated admin-side
// account-suspension flag (Decision Log #303). Renders visible,
// PERMANENTLY DISABLED, with a note — same precedent as every other
// backend-pending Settings control in this app.
import { Link } from "react-router";
import { getStoredAccessToken } from "../../lib/session";
import "./SettingsNotificationsPage.css";

function DisabledToggle({ label }: { label: string }) {
  return (
    <span className="notif-toggle" role="img" aria-label={`${label}: off (not adjustable yet)`}>
      <span className="notif-toggle__knob" />
    </span>
  );
}

interface Row {
  id: string;
  label: string;
  desc: string;
}

const ROWS: Row[] = [
  {
    id: "not-following",
    label: "People you don't follow",
    desc: "Mute notifications from accounts you don't follow.",
  },
  {
    id: "not-followers",
    label: "People who don't follow you",
    desc: "Mute notifications from accounts that don't follow you.",
  },
  {
    id: "new-accounts",
    label: "People with a new account",
    desc: "Mute notifications from recently created accounts.",
  },
];

export default function MutedAccountsPage() {
  if (!getStoredAccessToken()) {
    return (
      <p className="settings-status" role="status">
        Log in to manage muted accounts. <Link to="/login">Log in</Link>
      </p>
    );
  }

  return (
    <div className="settings-page">
      <div>
        <h2 className="settings-page__title">Muted accounts</h2>
        <p className="settings-page__lead">Mute notifications from people:</p>
      </div>

      <ul className="notif-rows">
        {ROWS.map((r) => (
          <li key={r.id} className="notif-row">
            <div className="notif-row__body">
              <p className="notif-row__title">{r.label}</p>
              <p className="notif-row__desc">{r.desc}</p>
              <p className="notif-row__note">
                Not adjustable yet — muting isn&rsquo;t available yet. This needs a backend
                notification-preferences module first.
              </p>
            </div>
            <DisabledToggle label={r.label} />
          </li>
        ))}
      </ul>
    </div>
  );
}
