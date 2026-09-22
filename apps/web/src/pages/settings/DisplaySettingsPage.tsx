// Display, Language & Region section hub. Figma: "Settings — Display,
// Language & Region" 2922:5832 (desktop, D20) / "…— Mobile" 5649:8140.
//
// VERIFIED against live Figma MCP access (sprint-2/settings-figma-verification,
// 2026-09-22) — confirms this frame's prior reconstruction (from other
// already-merged Figma session reports, not a live read at the time) was
// accurate. Lead "Manage how Soccernity content is displayed to you." and
// all 4 rows' descriptions match Figma verbatim on both breakpoints. The
// on-screen H2 uses settingsSections.ts's own resolved label ("Display,
// Language & Region") rather than the raw Figma heading string ("Display,
// Language and Region"), matching SecurityOverviewPage.tsx /
// NotificationPreferencesPage.tsx's own precedent of using the Decision
// Log #230 label verbatim. Fixed: the 4th row's label read "Data usage"
// (lowercase u) — both breakpoints' real text is "Data Usage" (capital
// U), matching the other 3 rows' Title Case convention.
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
    label: "Data Usage",
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
