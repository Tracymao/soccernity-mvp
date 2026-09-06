// The Admin Console frame — the shared "Admin Shell" Figma component
// (node 6014:12948) as a React layout. Every authenticated screen renders
// inside it via <Outlet/>.
//
//  - 260px sidebar: Soccernity logo, the signed-in admin's identity
//    block (links to /profile), the 8-item nav, Settings pinned to the
//    bottom.
//  - content region: a top bar carrying the Log Out action, then the
//    routed screen.
//
// The Figma shell also shows a search pill and a configurable primary
// action button in the content area. Those are per-screen, not shell
// chrome (Dashboard has no action; "Articles" has "Create Article";
// etc.) — screens render <AdminPageHeader> for that. The shell itself
// stays minimal.
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { ADMIN_NAV_PRIMARY, ADMIN_NAV_SETTINGS, COMPETITIONS_KEY, type AdminNavItem } from "./adminNav";
import logoMark from "../assets/icons/logo-mark.svg";
import "./AdminShell.css";

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function NavItem({ item }: { item: AdminNavItem }) {
  return (
    <NavLink
      to={item.path}
      className={({ isActive }) => "admin-nav__item" + (isActive ? " admin-nav__item--active" : "")}
    >
      {item.key === COMPETITIONS_KEY ? (
        <span className="admin-nav__icon admin-nav__bars" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      ) : (
        <span
          className="admin-nav__icon admin-nav__icon--mask"
          style={{ maskImage: `url(${item.icon})`, WebkitMaskImage: `url(${item.icon})` }}
          aria-hidden
        />
      )}
      <span className="admin-nav__label">{item.label}</span>
    </NavLink>
  );
}

export default function AdminShell() {
  const { admin, logout } = useAdminAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const name = admin?.fullName?.trim() || "Admin";
  const roleLabel = admin?.role
    ? admin.role.charAt(0).toUpperCase() + admin.role.slice(1)
    : "Admin";

  return (
    <div className="admin-shell">
      <aside className="admin-shell__sidebar">
        <div className="admin-shell__brand">
          <img src={logoMark} alt="" className="admin-shell__logo" />
          <span className="admin-shell__wordmark">Soccernity</span>
        </div>

        <NavLink to="/profile" className="admin-shell__identity">
          <span className="admin-shell__avatar" aria-hidden>
            {initialsFor(name)}
          </span>
          <span className="admin-shell__identity-text">
            <span className="admin-shell__identity-name">{name}</span>
            <span className="admin-shell__identity-role">{roleLabel}</span>
          </span>
        </NavLink>

        <nav className="admin-nav" aria-label="Admin sections">
          <div className="admin-nav__group">
            {ADMIN_NAV_PRIMARY.map((item) => (
              <NavItem key={item.key} item={item} />
            ))}
          </div>
          <div className="admin-nav__group admin-nav__group--pinned">
            <NavItem item={ADMIN_NAV_SETTINGS} />
          </div>
        </nav>
      </aside>

      <div className="admin-shell__main">
        <header className="admin-shell__topbar">
          <button type="button" className="admin-shell__logout" onClick={handleLogout}>
            Log Out
          </button>
        </header>
        <main className="admin-shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
