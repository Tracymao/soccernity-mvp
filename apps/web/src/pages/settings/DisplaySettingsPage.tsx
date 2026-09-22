// Display, Language & Region section hub. Figma: "Settings — Display,
// Language & Region" 2922:5832 (desktop, D20) / "…— Mobile" 5649:8140.
//
// NOTE ON FIGMA ACCESS: this PR was built without live Figma MCP access
// (the file's own plugin connector needs interactive re-authorization
// this session doesn't have). Content below is reconstructed from this
// codebase's own already-merged Figma session reports, not a fresh
// screenshot/context read — flagged in the PR report:
//   - Title/intro copy: docs/sprint-2-notification-bell-navbar-slot-report.md
//     §"Task 4 detail" — this frame's title/body were corrected in that
//     pass ("display and languages and region" -> "Display, Language and
//     Region"; "Manage how X content is displayed to you." -> "Manage how
//     Soccernity content is displayed to you."). The on-screen H2 below
//     uses settingsSections.ts's own resolved label ("Display, Language &
//     Region") rather than the raw Figma string, matching
//     SecurityOverviewPage.tsx / NotificationPreferencesPage.tsx's own
//     precedent of using the Decision Log #230 label verbatim.
//   - The 4 rows' own description text (read live, corrected in the same
//     pass, and independently corroborated by
//     docs/sprint-2-settings-display-leaves-report.md §3, which records
//     reading this exact copy off the hub before wiring its leaf
//     reactions): Accessibility "Adjust contrast, motion and text size";
//     Display "Choose how content is laid out on your screen"; Language
//     "Set the language Soccernity is shown in"; Data Usage "Control
//     media autoplay and download quality".
//
// The 4 rows now resolve to real leaf screens (sprint-2/settings-display-
// leaves, Decision Log #246) — closing the redirect-to-placeholder gap
// SettingsSectionPlaceholder.tsx covered before this PR.
import { Link } from "react-router";
import { getStoredAccessToken } from "../../lib/session";

interface Row {
  label: string;
  desc: string;
  to: string;
}

const ROWS: Row[] = [
  {
    label: "Accessibility",
    desc: "Adjust contrast, motion and text size",
    to: "/settings/display/accessibility",
  },
  {
    label: "Display",
    desc: "Choose how content is laid out on your screen",
    to: "/settings/display/density",
  },
  {
    label: "Language",
    desc: "Set the language Soccernity is shown in",
    to: "/settings/display/language",
  },
  {
    label: "Data usage",
    desc: "Control media autoplay and download quality",
    to: "/settings/display/data-usage",
  },
];

export default function DisplaySettingsPage() {
  if (!getStoredAccessToken()) {
    return (
      <p className="settings-status" role="status">
        Log in to manage your display, language, and region settings. <Link to="/login">Log in</Link>
      </p>
    );
  }

  return (
    <div className="settings-page">
      <div>
        <h2 className="settings-page__title">Display, Language &amp; Region</h2>
        <p className="settings-page__lead">Manage how Soccernity content is displayed to you.</p>
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
