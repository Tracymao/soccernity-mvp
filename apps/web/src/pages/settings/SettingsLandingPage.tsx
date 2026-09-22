// Settings landing (/settings). Figma: "Settings — Overview" desktop
// 6295:15068 (Active=None: identity + 5 section links) / mobile 6297:15173
// (identity + one prominent "All settings" card → the menu hub). NOT the
// Account section page (2905:4798, "Settings — Account") — that is
// AccountOverviewPage. Decision Log #230 decision #8.
//
// Identity row shows only backed fields (displayName + email from
// GET /users/:id) — no bio/location/counts/@handle (Decision Log #58).
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { getUser, type UserProfile } from "../../api/users";
import { decodeAccessToken, getStoredAccessToken } from "../../lib/session";
import { useIsMobile } from "../../layout/useIsMobile";
import { SETTINGS_SECTIONS } from "./settingsSections";

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export default function SettingsLandingPage() {
  const isMobile = useIsMobile();
  const token = getStoredAccessToken();
  const sub = token ? decodeAccessToken(token)?.sub : undefined;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token || !sub) return;
    let cancelled = false;
    getUser(token, sub)
      .then((p) => !cancelled && setProfile(p))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [token, sub]);

  if (!token || !sub) {
    return (
      <p className="settings-status" role="status">
        Log in to manage your settings. <Link to="/login">Log in</Link>
      </p>
    );
  }

  return (
    <div className="settings-page">
      <div>
        <h2 className="settings-page__title">{isMobile ? "Settings" : "Overview"}</h2>
        <p className="settings-page__lead">Manage your Soccernity account, privacy, and preferences</p>
      </div>

      {profile ? (
        <div className="settings-identity">
          <span className="settings-identity__disc" aria-hidden="true">
            {initialsFor(profile.displayName)}
          </span>
          <div>
            <p className="settings-identity__name">{profile.displayName}</p>
            <p className="settings-identity__email">{profile.email}</p>
          </div>
        </div>
      ) : failed ? (
        <p className="settings-status" role="alert">
          Couldn&rsquo;t load your details right now.
        </p>
      ) : null}

      {isMobile ? (
        <Link to="/settings/menu" className="settings-allcard">
          <span>
            <span className="settings-link__label">All settings</span>
            <span className="settings-link__desc">Account, security, privacy, notifications, and display</span>
          </span>
          <span className="settings-link__chev" aria-hidden="true">
            &rsaquo;
          </span>
        </Link>
      ) : (
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
      )}
    </div>
  );
}
