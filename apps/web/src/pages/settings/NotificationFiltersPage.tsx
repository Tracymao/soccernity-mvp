// Filters leaf. Figma: "Settings — Filters" 2926:9230 (desktop, formerly
// "Settings — Notifications (Mute & Filter)" — renamed by
// sprint-2/settings-duplicate-clusters-consolidation, Decision Log
// #230/#247) / "…— Mobile" 5696:8281.
//
// NOTE ON FIGMA ACCESS — same disclosure as the other Notification
// Preferences leaves: this PR was built without live Figma MCP access.
// Reconstructed from docs/sprint-2-settings-duplicate-clusters-
// consolidation-report.md, which records this frame's post-consolidation
// content directly: heading "Filters", subtitle "Choose what you see in
// your notifications.", and ONLY the quality-filter control — the frame's
// former "Mute notifications ›" nav row was deleted in that same Figma
// pass (decision #6). Muting is reached only via the Muted-accounts leaf
// now, not from here. Row description below is NOT literal Figma copy —
// it's the hub's own row-description text for this section, reused here
// since it's the one piece of real, documented copy that describes what
// this control does — flagged as a disclosed best-effort choice.
//
// NO LIVE NOTIFICATION-FILTERING BACKEND EXISTS. Checked directly: no
// notification-preferences/filter/mute concept anywhere in services/api
// (grep across services/api/src for "mute|notificationPreference" returns
// nothing — the notifications module is READ-SIDE ONLY, see
// services/api/src/modules/notifications/README.md). Per this app's
// established precedent for this exact situation (TwoFactorAuthPage.tsx /
// PrivacySettingsPage.tsx's disabled rows), the control renders visible,
// PERMANENTLY DISABLED, with a note. No Submit action — same "the Figma
// frame's own Submit button was dead, hidden scaffolding" finding
// documented in docs/sprint-2-settings-desktop-scaffolding-sweep-
// report.md applies to this frame too.
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

export default function NotificationFiltersPage() {
  if (!getStoredAccessToken()) {
    return (
      <p className="settings-status" role="status">
        Log in to manage your notification filters. <Link to="/login">Log in</Link>
      </p>
    );
  }

  return (
    <div className="settings-page">
      <div>
        <h2 className="settings-page__title">Filters</h2>
        <p className="settings-page__lead">Choose what you see in your notifications.</p>
      </div>

      <ul className="notif-rows">
        <li className="notif-row">
          <div className="notif-row__body">
            <p className="notif-row__title">Quality filter</p>
            <p className="notif-row__desc">
              Choose which lower-quality notifications to filter out.
            </p>
            <p className="notif-row__note">
              Not adjustable yet — notification filtering isn&rsquo;t available yet. This needs a
              backend notification-preferences module first.
            </p>
          </div>
          <DisabledToggle label="Quality filter" />
        </li>
      </ul>
    </div>
  );
}
