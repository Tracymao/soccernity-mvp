// Site header / chrome.
//
// Phase 2 of the founder-directed navbar correction (Decision Log #161).
// Structure and tokens follow the Figma Header COMPONENT_SET (node
// 2824:4309, "Soccernity-MVP" file weZWWqggy9j13eX8bhFgs6):
//   - "header 7" (2841:4104) -- logged-out: wordmark, search, icon nav,
//     Login button.
//   - "header 4" (2838:3502) -- logged-in: wordmark, search, icon nav,
//     messages icon, avatar.
//
// Auth state is read from the stored access token (src/lib/session.ts) --
// there is no AuthContext in this app yet (see that file's header
// comment). The header re-reads it on every navigation (via
// useLocation().key), so the login redirect and the logout redirect both
// flip the header between the two variants without a full reload.
//
// The avatar opens two different real overlays by design (Decision Log
// #162): the account dropdown on desktop, the Navigation Drawer on
// mobile -- picked by useIsMobile().
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import logoMark from "../assets/icons/soccernity-logo-mark.svg";
import searchIcon from "../assets/icons/search.svg";
import messagesIcon from "../assets/icons/messages.svg";
import { clearStoredSession, getStoredAccessToken } from "../lib/session";
import { primaryNavItems } from "./navigation";
import { useIsMobile } from "./useIsMobile";
import AccountDropdown from "./AccountDropdown";
import NavDrawer from "./NavDrawer";
import "./Header.css";

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Re-derived on every navigation -- login writes the token then
  // navigate()s, logout clears it then navigate()s, and either way this
  // recomputes because location.key changed.
  const hasSession = Boolean(getStoredAccessToken());

  const [menuOpen, setMenuOpen] = useState(false);

  // Close any open overlay when the route changes or the session ends.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.key, hasSession]);

  function handleLogout() {
    clearStoredSession();
    setMenuOpen(false);
    navigate("/");
  }

  return (
    <header className="sn-header">
      <div className="sn-header__brand">
        <NavLink to="/" className="sn-header__logo-link" aria-label="Soccernity home">
          <img src={logoMark} alt="" className="sn-header__logo-mark" width={32} height={32} />
          <span className="sn-header__wordmark">Soccernity</span>
        </NavLink>
      </div>

      <div className="sn-header__search" role="search">
        <img src={searchIcon} alt="" className="sn-header__search-icon" width={16} height={16} />
        {/* Placeholder only -- no search functionality yet, out of scope for the app shell. */}
        <input
          type="search"
          className="sn-header__search-input"
          placeholder="Search Soccernity"
          aria-label="Search Soccernity"
          disabled
        />
      </div>

      <nav className="sn-header__nav" aria-label="Primary">
        <ul className="sn-header__nav-list">
          {primaryNavItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                aria-label={item.label}
                className={({ isActive }) =>
                  isActive ? "sn-header__nav-link sn-header__nav-link--active" : "sn-header__nav-link"
                }
              >
                <span
                  className={
                    item.tinted
                      ? "sn-header__nav-icon sn-header__nav-icon--tinted"
                      : "sn-header__nav-icon"
                  }
                >
                  <img src={item.icon} alt="" />
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sn-header__auth">
        {hasSession ? (
          <div className="sn-header__account">
            {/* Messages: no /messages route yet (Decision Log #166) --
                shown for parity with the Figma "header 4" cluster but
                inert until that route exists. */}
            <button
              type="button"
              className="sn-header__messages"
              aria-label="Messages (not available yet)"
              title="Not available yet"
              disabled
            >
              <img src={messagesIcon} alt="" width={26} height={25} />
            </button>
            <button
              type="button"
              className="sn-header__avatar"
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            />
            {menuOpen && !isMobile && (
              <AccountDropdown onNavigate={() => setMenuOpen(false)} onLogout={handleLogout} />
            )}
          </div>
        ) : (
          <Link to="/login" className="sn-header__login-button">
            Login
          </Link>
        )}
      </div>

      {menuOpen && isMobile && (
        <NavDrawer onClose={() => setMenuOpen(false)} onLogout={handleLogout} />
      )}
    </header>
  );
}
