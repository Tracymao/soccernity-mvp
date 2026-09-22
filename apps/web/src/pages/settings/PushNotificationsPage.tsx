// Push Notifications leaf. Figma: "Settings — Push Notifications"
// 2927:9954 (desktop) / "…— Mobile" 5696:8364.
//
// NOTE ON FIGMA ACCESS — same disclosure as the other Notification
// Preferences leaves: built without live Figma MCP access, reconstructed
// from docs/sprint-2-settings-family-consolidation-audit-report.md and
// docs/sprint-2-mobile-settings-community-message-rebuild-report.md
// (both record this frame's exact single row, "Turn on push
// notifications", + toggle — confirmed by
// docs/sprint-2-settings-desktop-scaffolding-sweep-report.md as the
// frame's only real content; its hidden "Push notification" duplicate
// heading and dead Submit button were both deleted as never-rendered
// scaffolding in that pass). Row description is NOT literal Figma copy —
// no source records one — a plain, disclosed best-effort gloss, same
// discipline as TwoFactorAuthPage.tsx.
//
// NO LIVE PUSH-NOTIFICATION BACKEND EXISTS. Checked directly: no device
// token / push-subscription concept anywhere in services/api (grep across
// services/api/src for "push.?(notification|token|subscription)" returns
// nothing). Renders visible, PERMANENTLY DISABLED, with a note — same
// precedent as every other backend-pending Settings control in this app.
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

export default function PushNotificationsPage() {
  if (!getStoredAccessToken()) {
    return (
      <p className="settings-status" role="status">
        Log in to manage push notifications. <Link to="/login">Log in</Link>
      </p>
    );
  }

  return (
    <div className="settings-page">
      <div>
        <h2 className="settings-page__title">Push notifications</h2>
        <p className="settings-page__lead">Get notified on this device when something happens.</p>
      </div>

      <ul className="notif-rows">
        <li className="notif-row">
          <div className="notif-row__body">
            <p className="notif-row__title">Turn on push notifications</p>
            <p className="notif-row__desc">Get a push notification on this device for new activity.</p>
            <p className="notif-row__note">
              Not adjustable yet — push notifications aren&rsquo;t available yet. This needs a backend
              push-delivery module first.
            </p>
          </div>
          <DisabledToggle label="Turn on push notifications" />
        </li>
      </ul>
    </div>
  );
}
