// Desktop account dropdown -- opened by the header avatar on desktop
// viewports (Decision Log #162: mobile opens the Navigation Drawer
// instead). Figma source: "Dropdown menu/notification on" (node
// 2841:5363, "Soccernity-MVP" file weZWWqggy9j13eX8bhFgs6): Profile,
// Notification, Settings, Log out.
//
// - Settings has no route in src/app/router.tsx yet (Decision Log #166)
//   -- rendered non-navigating and visibly disabled rather than as a link
//   to the 404 page.
// - The Figma "Notification" row's unread-count badge is now real
//   (sprint-3/notification-centre-to-code, Decision Log #291) -- `Header`
//   fetches it (GET /notifications/unread-count) and passes it down here,
//   the same way it already passes `profile` to NavDrawer.
import { Link } from "react-router";
import { accountMenuItems } from "./navigation";
import "./AccountDropdown.css";

interface AccountDropdownProps {
  /** Called after an item is chosen (to close the menu). */
  onNavigate: () => void;
  /** Clears the session and redirects -- owned by Header. */
  onLogout: () => void;
  /** From Header's GET /notifications/unread-count fetch. */
  unreadCount: number;
}

export default function AccountDropdown({ onNavigate, onLogout, unreadCount }: AccountDropdownProps) {
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
            {item.to === "/notifications" && unreadCount > 0 && (
              <span className="sn-account-dropdown__badge">{unreadCount}</span>
            )}
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
