// Notification Preferences section hub. Figma: "Settings — Notification
// Preferences" 2926:9721 (desktop) / "…— Mobile" 5696:8340 — the D15/M15
// hub Decision Log #230's founder decisions kept (decision #3), extended
// from 2 rows to 4 (decision #1): Push notifications · Email
// notifications · Filters · Muted accounts. On-screen heading corrected
// from the frame's stale "Preferences" to "Notification Preferences",
// matching the rail label — same fix
// sprint-2/settings-shell-componentization already applied in Figma
// itself (Build Plan Decision Log #249).
//
// VERIFIED against live Figma MCP access (sprint-2/settings-figma-verification,
// 2026-09-22). Row set/order/targets were already correct. Copy fixed:
// desktop renders NO lead paragraph and NO row descriptions at all (just
// bold labels + chevrons); mobile has both, and mobile's real text differs
// from what was previously guessed here — used below since it's real,
// present content and the code renders a lead + per-row desc shape mobile
// actually has. Lead was "Choose which notifications you get, and how you
// get them." (invented, no Figma source), now "Choose how you'd like to
// hear from Soccernity." (mobile's real copy). Push/Email row descs were
// invented ("Get notified on this device" / "Get notified by email"), now
// "Manage push notifications on your devices" / "Manage the emails
// Soccernity sends you" (mobile's real copy). Filters/Muted-accounts row
// descs already matched mobile's real copy, just missing the trailing
// period both rows actually have.
//
// The redundant competing hub ("Settings — Notification Preferences (By
// Type)", 2922:5602 — rows Filter/Preference, no matching leaves) was
// archived in Figma and is not reproduced here (matching Security's own
// D9-not-D8-intermediate precedent).
import { Link } from "react-router";
import { getStoredAccessToken } from "../../lib/session";

interface Row {
  label: string;
  desc: string;
  to: string;
}

const ROWS: Row[] = [
  {
    label: "Push notifications",
    desc: "Manage push notifications on your devices",
    to: "/settings/notifications/push",
  },
  {
    label: "Email notifications",
    desc: "Manage the emails Soccernity sends you",
    to: "/settings/notifications/email",
  },
  {
    label: "Filters",
    desc: "Choose which lower-quality notifications to filter out.",
    to: "/settings/notifications/filters",
  },
  {
    label: "Muted accounts",
    desc: "Choose whose notifications you don't want to see.",
    to: "/settings/notifications/muted-accounts",
  },
];

export default function NotificationPreferencesPage() {
  if (!getStoredAccessToken()) {
    return (
      <p className="settings-status" role="status">
        Log in to manage your notification preferences. <Link to="/login">Log in</Link>
      </p>
    );
  }

  return (
    <div className="settings-page">
      <div>
        <h2 className="settings-page__title">Notification Preferences</h2>
        <p className="settings-page__lead">
          Choose how you&rsquo;d like to hear from Soccernity.
        </p>
      </div>
      <ul className="settings-links">
        {ROWS.map((r) => (
          <li key={r.label}>
            <Link to={r.to} className="settings-link">
              <span>
                <span className="settings-link__label">{r.label}</span>
                <span className="settings-link__desc">{r.desc}</span>
              </span>
              <span className="settings-link__chev" aria-hidden="true">
                &rsaquo;
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
