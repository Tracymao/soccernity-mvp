// Desktop account dropdown -- opened by the header avatar on desktop
// viewports (Decision Log #162: mobile opens the Navigation Drawer
// instead). Figma source: "Dropdown menu/notification on" (node
// 2841:5363, "Soccernity-MVP" file weZWWqggy9j13eX8bhFgs6): Profile,
// Notification, Settings, Log out.
//
// - Notification and Settings have no route in src/app/router.tsx yet
//   (Decision Log #166) -- rendered non-navigating and visibly disabled
//   rather than as links to the 404 page.
// - The Figma "Notification" row shows an unread-count badge; no
//   unread-count source exists in this codebase, so it renders without a
//   number (Decision Log #167).
import { Link } from "react-router";
import { accountMenuItems } from "./navigation";
import "./AccountDropdown.css";

interface AccountDropdownProps {
  /** Called after an item is chosen (to close the menu). */
  onNavigate: () => void;
  /** Clears the session and redirects -- owned by Header. */
  onLogout: () => void;
}

export default function AccountDropdown({ onNavigate, onLogout }: AccountDropdownProps) {
  return (
    <div className="sn-account-dropdown" role="menu" aria-label="Account">
      {accountMenuItems.map((item) =>
        item.available === false ? (
          <span
            key={item.to}
            className="sn-account-dropdown__item sn-account-dropdown__item--disabled"
            role="menuitem"
            aria-disabled="true"
            title="Not available yet"
          >
            {item.label}
          </span>
        ) : (
          <Link
            key={item.to}
            to={item.to}
            className="sn-account-dropdown__item"
            role="menuitem"
            onClick={onNavigate}
          >
            {item.label}
          </Link>
        ),
      )}
      <button
        type="button"
        className="sn-account-dropdown__item sn-account-dropdown__logout"
        role="menuitem"
        onClick={onLogout}
      >
        Log out
      </button>
    </div>
  );
}
