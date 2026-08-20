// Site header / chrome.
//
// Structure and tokens follow the Header COMPONENT_SET (node 2824:4309,
// "Soccernity-MVP" file weZWWqggy9j13eX8bhFgs6), "header 7" variant --
// the logged-out state (wordmark, search, primary nav, Login CTA). Once
// F2 (Login) lands and real auth state exists, the right-hand slot here
// should switch to the avatar/notification cluster from "header 1"
// instead of always rendering the Login button.
import { NavLink } from "react-router";
import logoMark from "../assets/icons/soccernity-logo-mark.svg";
import searchIcon from "../assets/icons/search.svg";
import { primaryNavItems } from "./navigation";
import "./Header.css";

export default function Header() {
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
                className={({ isActive }) =>
                  isActive ? "sn-header__nav-link sn-header__nav-link--active" : "sn-header__nav-link"
                }
              >
                {item.label.toUpperCase()}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sn-header__auth">
        <NavLink to="/login" className="sn-header__login-button">
          Login
        </NavLink>
      </div>
    </header>
  );
}
