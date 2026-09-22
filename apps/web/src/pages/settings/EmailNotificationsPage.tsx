// Email Notifications leaf. Figma: "Settings — Email Notifications"
// 2927:10205 (desktop) / "…— Mobile" 5696:8384.
//
// VERIFIED against live Figma MCP access (sprint-2/settings-figma-verification,
// 2026-09-22). Row set matches: a master "Turn on email notifications"
// toggle + real desc, plus 3 label-only sub-rows underneath ("New
// notifications", "Direct messages", "Posts emailed to you") — confirmed
// on BOTH breakpoints that none of the 3 sub-rows carries any description
// text at all, so the previously-invented desc for each was removed
// rather than corrected (SubRow.desc is now optional, rendered only when
// present). Fixed: lead ("Get notified by email when something happens.",
// invented) → mobile's real "Manage the emails Soccernity sends you."
// (desktop has no lead paragraph — heading goes straight to the master
// row); master row desc ("Get an email for new activity on your
// account.", invented) → the real copy both breakpoints agree on
// verbatim, below. Desktop's own heading node reads the singular "Email
// notification" (2927:10314) — the same isolated desktop-only typo
// pattern as PushNotificationsPage's "Push notification" — plural is
// kept, matching mobile, the rail label, and this page's own h2.
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
  desc?: string;
}

const SUB_ROWS: SubRow[] = [
  { id: "new-notifications", label: "New notifications" },
  { id: "direct-messages", label: "Direct messages" },
  { id: "posts-emailed", label: "Posts emailed to you" },
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
        <p className="settings-page__lead">Manage the emails Soccernity sends you.</p>
      </div>

      <ul className="notif-rows">
        <li className="notif-row">
          <div className="notif-row__body">
            <p className="notif-row__title">Turn on email notifications</p>
            <p className="notif-row__desc">
              Get email notifications to find out what&rsquo;s going on when you&rsquo;re not on
              Soccernity. You can turn them off anytime.
            </p>
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
              {r.desc ? <p className="notif-row__desc">{r.desc}</p> : null}
            </div>
            <DisabledToggle label={r.label} />
          </li>
        ))}
      </ul>
    </div>
  );
}
