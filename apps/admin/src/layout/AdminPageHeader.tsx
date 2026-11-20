// The per-screen header row inside the Admin Shell content region — the
// search bar + optional primary action button the Figma "Admin Shell"
// component exposes as `Show Action Button` / `Action Label` props
// (they're screen-configured, not shell chrome).
//
// The search bar is the real, working one (B-114, Decision Log #463, #464):
// a form that opens /search?q=, shown on EVERY admin screen, because the Admin
// Shell Figma component carries it in all variants. The only screen that swaps
// it is the results page, which passes its own bar through `search` so the
// bar can show the query and the running search. `action` is wired to a
// callback; screens that have a backed action pass one, the rest omit it.
import type { ReactNode } from "react";
import AdminSearchBar from "../components/search/AdminSearchBar";
import "./AdminPageHeader.css";

interface AdminPageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  action?: { label: string; onClick: () => void };
  /** Replaces the default search bar. Only the results page uses it. */
  search?: ReactNode;
}

export default function AdminPageHeader({ title, subtitle, action, search }: AdminPageHeaderProps) {
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
      <div className="admin-page-header__search">{search ?? <AdminSearchBar />}</div>
    </div>
  );
}
