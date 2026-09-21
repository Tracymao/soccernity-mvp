// Mobile Settings hub (/settings/menu). Figma: "Settings — Menu — Mobile"
// 6289:15068 — Decision Log #244: a standalone hub screen routing to the
// five section pages (founder decision #7). On desktop the persistent rail
// already does this job, so the route redirects to the /settings landing.
import { Link, Navigate } from "react-router";
import { useIsMobile } from "../../layout/useIsMobile";
import { SETTINGS_SECTIONS } from "./settingsSections";

export default function SettingsMenuPage() {
  const isMobile = useIsMobile();
  if (!isMobile) return <Navigate to="/settings" replace />;

  return (
    <div className="settings-page">
      <h2 className="settings-page__title">Settings</h2>
      <ul className="settings-links">
        {SETTINGS_SECTIONS.map((s) => (
          <li key={s.id}>
            <Link to={s.to} className="settings-link">
              <span>
                <span className="settings-link__label">{s.label}</span>
                <span className="settings-link__desc">{s.description}</span>
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
