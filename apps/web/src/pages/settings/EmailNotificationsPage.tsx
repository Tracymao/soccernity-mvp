// Email Notifications leaf. Figma: "Settings — Email Notifications"
// 2927:10205 (desktop) / "…— Mobile" 5696:8384.
//
// NOTE ON FIGMA ACCESS — same disclosure as the other Notification
// Preferences leaves: built without live Figma MCP access, reconstructed
// from docs/sprint-2-component-hygiene-toggles-nav-report.md and
// docs/sprint-2-mobile-settings-community-message-rebuild-report.md,
// which both record this frame's real row set directly: a master "Turn
// on email notifications" toggle, plus 3 sub-rows underneath ("New
// notifications", "Direct messages", "Posts emailed to you") — confirmed
// as the frame's only real content by docs/sprint-2-settings-desktop-
// scaffolding-sweep-report.md (a hidden duplicate "Push notification"
// row, a leaked "Email Notification"/2FA block, and a dead Submit button
// were all deleted from this frame as never-rendered scaffolding in that
// pass). All 4 controls were unified onto the same real `Settings
// Toggle` pill component in a later Figma pass — see
// SettingsNotificationsPage.css's own header note. Row descriptions are
// NOT literal Figma copy — no source records any — a plain, disclosed
// best-effort gloss, same discipline as TwoFactorAuthPage.tsx.
//
// NO LIVE EMAIL-NOTIFICATION-PREFERENCE BACKEND EXISTS. Checked directly:
// services/api sends only transactional email (verification,
// guardian-consent, password-reset via Postmark — see
// PrivacySettingsPage.tsx's own "Marketing emails" note) and there is no
// per-user notification-email-preference column or endpoint anywhere.
// Renders visible, PERMANENTLY DISABLED, with a note — same precedent as
// every other backend-pending Settings control in this app. The 3
// sub-rows are rendered indented under the master row, matching the
// frame's own visual grouping, but are independently disabled (not
// gated behind the master toggle's — nonexistent — "on" state).
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

interface SubRow {
  id: string;
  label: string;
  desc: string;
}

const SUB_ROWS: SubRow[] = [
  {
    id: "new-notifications",
    label: "New notifications",
    desc: "New follows, likes, comments, and messages.",
  },
  { id: "direct-messages", label: "Direct messages", desc: "New direct messages you receive." },
  {
    id: "posts-emailed",
    label: "Posts emailed to you",
    desc: "Occasional posts from people and clubs you follow.",
  },
];

export default function EmailNotificationsPage() {
  if (!getStoredAccessToken()) {
    return (
      <p className="settings-status" role="status">
        Log in to manage email notifications. <Link to="/login">Log in</Link>
      </p>
    );
  }

  return (
    <div className="settings-page">
      <div>
        <h2 className="settings-page__title">Email notifications</h2>
        <p className="settings-page__lead">Get notified by email when something happens.</p>
      </div>

      <ul className="notif-rows">
        <li className="notif-row">
          <div className="notif-row__body">
            <p className="notif-row__title">Turn on email notifications</p>
            <p className="notif-row__desc">Get an email for new activity on your account.</p>
            <p className="notif-row__note">
              Not adjustable yet — email notification preferences aren&rsquo;t available yet. This
              needs a backend notification-preferences module first.
            </p>
          </div>
          <DisabledToggle label="Turn on email notifications" />
        </li>
      </ul>

      <ul className="notif-subrows">
        {SUB_ROWS.map((r) => (
          <li key={r.id} className="notif-row">
            <div className="notif-row__body">
              <p className="notif-row__title">{r.label}</p>
              <p className="notif-row__desc">{r.desc}</p>
            </div>
            <DisabledToggle label={r.label} />
          </li>
        ))}
      </ul>
    </div>
  );
}
