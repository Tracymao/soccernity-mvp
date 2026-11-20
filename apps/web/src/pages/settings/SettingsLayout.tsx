// Settings Shell. Figma: "Settings Shell" COMPONENT_SET 6339:16094 (desktop:
// persistent 5-row left rail, `Active` variant per section, `None` on the
// landing) and, on mobile, "Settings Back Bar — Mobile" 6348:16292 (a
// "‹ Settings" bar above section content) with "Settings — Menu — Mobile"
// 6289:15068 as the standalone hub. Decision Log #230 / #249 / #252.
// Built by sprint-2/settings-shell-to-code-account (PR 1 of a staged set).
//
// Desktop: "Settings" H1 + rail + <Outlet/> content panel. The rail's
// active row follows the URL (section = first segment after /settings).
// Mobile: no rail (the Figma mobile frames have none). Section/leaf pages
// get the back bar → /settings/menu; the landing (/settings) and the hub
// (/settings/menu) get none, matching the frames.
//
// NOT reproduced: the Figma header-4 navbar inside the shell and the
// logo-only mobile "Settings Top Bar" (6360:16337) — AppShell already
// renders the shared site Header above every routed page (same call every
// other converted page made). The empty left gutter (rail at x 344) is not
// reproduced either; the rail sits in the normal page column.
//
// Deliberately NOT session-gated here: DeactivateAccountPage clears the
// stored session on success and then shows its own confirmation, which a
// layout-level gate would replace with a login prompt. Pages that need a
// session gate themselves.
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useIsMobile } from "../../layout/useIsMobile";
import { SETTINGS_SECTIONS, sectionForPath } from "./settingsSections";
import "./SettingsLayout.css";

export default function SettingsLayout() {
  const { pathname } = useLocation();
  const isMobile = useIsMobile();
  const active = sectionForPath(pathname);
  const isRootOrMenu = pathname === "/settings" || pathname === "/settings/menu";

  if (isMobile) {
    return (
      <div className="settings-shell settings-shell--mobile">
        {!isRootOrMenu && (
          <Link to="/settings/menu" className="settings-backbar">
            <span aria-hidden="true">&lsaquo;</span> Settings
          </Link>
        )}
        <div className="settings-panel">
          <Outlet />
        </div>
      </div>
    );
  }

  return (
    <div className="settings-shell">
      <h1 className="settings-shell__title">Settings</h1>
      <div className="settings-shell__body">
        <nav className="settings-rail" aria-label="Settings sections">
          {SETTINGS_SECTIONS.map((s) => (
            <NavLink
              key={s.id}
              to={s.to}
              className={
                active === s.id ? "settings-rail__row settings-rail__row--active" : "settings-rail__row"
              }
              aria-current={active === s.id ? "page" : undefined}
            >
              <span>{s.label}</span>
              <span aria-hidden="true">&rsaquo;</span>
            </NavLink>
          ))}
        </nav>
        <div className="settings-panel">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
