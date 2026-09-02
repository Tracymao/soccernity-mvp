// Mobile Navigation Drawer -- the canonical mobile-web primary nav
// (Decision Log #162). Opened by the header avatar on mobile viewports.
// Figma source: "Navigation Drawer -- Mobile" COMPONENT (node
// 5870:10689, "Soccernity-MVP" file weZWWqggy9j13eX8bhFgs6).
//
// A left slide-in panel over a scrim; tapping the scrim (or pressing
// Escape) closes it, matching the Figma component's own ON_CLICK ->
// CLOSE on the scrim.
//
// Identity block: the Figma design shows the signed-in user's name,
// @handle and avatar. None of that is available client-side -- there is
// no AuthContext, and the access token payload is only { sub, role }
// (see src/lib/session.ts). Rendered as a generic "Signed in" row
// rather than fabricating a name -- Decision Log #168.
//
// Messages / Notifications / Settings have no route in src/app/router.tsx
// yet (Decision Log #166) -- rendered non-navigating and visibly
// disabled.
import { useEffect } from "react";
import { NavLink } from "react-router";
import logoMark from "../assets/icons/soccernity-logo-mark.svg";
import { drawerNavItems } from "./navigation";
import "./NavDrawer.css";

interface NavDrawerProps {
  /** Close the drawer (scrim tap / Escape / item chosen). */
  onClose: () => void;
  /** Clears the session and redirects -- owned by Header. */
  onLogout: () => void;
}

export default function NavDrawer({ onClose, onLogout }: NavDrawerProps) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sn-drawer" role="dialog" aria-modal="true" aria-label="Navigation">
      <button
        type="button"
        className="sn-drawer__scrim"
        aria-label="Close navigation"
        onClick={onClose}
      />
      <div className="sn-drawer__panel">
        <div className="sn-drawer__brand">
          <img src={logoMark} alt="" width={22} height={22} />
          <span className="sn-drawer__wordmark">Soccernity</span>
        </div>

        <div className="sn-drawer__identity">
          <span className="sn-drawer__avatar" aria-hidden="true" />
          <span className="sn-drawer__signed-in">Signed in</span>
        </div>

        <nav className="sn-drawer__nav" aria-label="Primary">
          {drawerNavItems.map((item) =>
            item.available === false ? (
              <span
                key={item.to}
                className="sn-drawer__link sn-drawer__link--disabled"
                aria-disabled="true"
                title="Not available yet"
              >
                {item.label}
              </span>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  isActive ? "sn-drawer__link sn-drawer__link--active" : "sn-drawer__link"
                }
                onClick={onClose}
              >
                {item.label}
              </NavLink>
            ),
          )}
        </nav>

        <div className="sn-drawer__divider" />

        <button type="button" className="sn-drawer__logout" onClick={onLogout}>
          Log out
        </button>
      </div>
    </div>
  );
}
