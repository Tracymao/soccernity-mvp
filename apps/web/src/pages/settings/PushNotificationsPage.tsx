// Push Notifications leaf. Figma: "Settings — Push Notifications"
// 2927:9954 (desktop) / "…— Mobile" 5696:8364.
//
// VERIFIED against live Figma MCP access (sprint-2/settings-figma-verification,
// 2026-09-22). Single row, "Turn on push notifications" + toggle, is the
// frame's only real content on both breakpoints (matches code). Fixed:
// lead ("Get notified on this device when something happens.", invented)
// → mobile's real "Manage push notifications on your devices." (desktop
// has no lead paragraph at all — heading goes straight to the row); row
// desc ("Get a push notification on this device for new activity.",
// invented) → the real copy both breakpoints agree on verbatim, below.
// Desktop's own heading node reads the singular "Push notification"
// (2927:10063) — an isolated typo against mobile's plural ("Push
// notifications", matching this page's own rail label and h2) — plural
// is kept, matching the already-correct code and every other reference
// to this section.
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
        <p className="settings-page__lead">Manage push notifications on your devices.</p>
      </div>

      <ul className="notif-rows">
        <li className="notif-row">
          <div className="notif-row__body">
            <p className="notif-row__title">Turn on push notifications</p>
            <p className="notif-row__desc">
              Get push notifications to find out what&rsquo;s going on when you&rsquo;re not on
              Soccernity. You can turn them off anytime.
            </p>
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
