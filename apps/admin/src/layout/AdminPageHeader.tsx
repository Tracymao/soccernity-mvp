// The per-screen header row inside the Admin Shell content region — the
// search bar + optional primary action button the Figma "Admin Shell"
// component exposes as `Show Action Button` / `Action Label` props
// (they're screen-configured, not shell chrome).
//
// The search bar is the real, working one (B-114, Decision Log #463): a
// form that opens /search?q=. Most screens still pass `hideSearch`, because
// their Figma frames draw no bar; the Users screen shows it, as the
// frame does. `action` is wired to a callback; screens that have a backed
// action pass one, the rest omit it.
import type { ReactNode } from "react";
import AdminSearchBar from "../components/search/AdminSearchBar";
import "./AdminPageHeader.css";

interface AdminPageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  action?: { label: string; onClick: () => void };
  /** Hide the search bar on screens whose Figma frame has none. Default: shown. */
  hideSearch?: boolean;
}

export default function AdminPageHeader({ title, subtitle, action, hideSearch }: AdminPageHeaderProps) {
  return (
    <div className="admin-page-header">
      <div className="admin-page-header__titles">
        <h1 className="admin-page-header__title">{title}</h1>
        {subtitle ? <p className="admin-page-header__subtitle">{subtitle}</p> : null}
      </div>
      {action ? (
        <div className="admin-page-header__controls">
          <button type="button" className="admin-page-header__action" onClick={action.onClick}>
            {action.label}
          </button>
        </div>
      ) : null}
      {!hideSearch ? (
        <div className="admin-page-header__search">
          <AdminSearchBar />
        </div>
      ) : null}
    </div>
  );
}
