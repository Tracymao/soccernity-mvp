// The per-screen header row inside the Admin Shell content region — the
// search pill + optional primary action button the Figma "Admin Shell"
// component exposes as `Show Action Button` / `Action Label` props
// (they're screen-configured, not shell chrome).
//
// PR 1 ships this so the placeholder screens have a real header. The
// search field is rendered but DISABLED and disclosed: there is no
// search endpoint anywhere in services/api's admin module — a working
// admin search is its own future backend + frontend task. `action` is
// wired to a callback; screens that have a backed action pass one, the
// rest omit it.
import type { ReactNode } from "react";
import searchIcon from "../assets/icons/search.svg";
import "./AdminPageHeader.css";

interface AdminPageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  action?: { label: string; onClick: () => void };
  /** Hide the (non-functional) search pill on screens whose Figma frame
   *  has no search field. Default: shown-but-disabled. */
  hideSearch?: boolean;
}

export default function AdminPageHeader({ title, subtitle, action, hideSearch }: AdminPageHeaderProps) {
  return (
    <div className="admin-page-header">
      <div className="admin-page-header__titles">
        <h1 className="admin-page-header__title">{title}</h1>
        {subtitle ? <p className="admin-page-header__subtitle">{subtitle}</p> : null}
      </div>
      <div className="admin-page-header__controls">
        {!hideSearch ? (
          <span
            className="admin-page-header__search"
            title="Admin search is not available yet — no search endpoint exists in services/api."
          >
            <img src={searchIcon} alt="" className="admin-page-header__search-icon" />
            <input
              type="search"
              placeholder="Search Soccernity"
              disabled
              aria-label="Search Soccernity (not available yet)"
            />
          </span>
        ) : null}
        {action ? (
          <button type="button" className="admin-page-header__action" onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
