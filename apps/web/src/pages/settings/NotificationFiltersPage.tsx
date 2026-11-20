// Filters leaf. Figma: "Settings — Filters" 2926:9230 (desktop) / "…— Mobile" 5696:8281, now
// the live states drawn by Figma pass W8 (docs/figma-w8-settings.md row B): Quality filter off
// 6990:54979 / mobile 6990:55939, on 6990:55149 / 6990:55968.
//
// LIVE (build register B-062, Decision Log #472 adopted default (c)). The one toggle reads and
// saves through GET and PATCH /notification-settings (`qualityFilter`). The rule text and the
// "not affected" line are the frame's wording, unchanged. The rule itself (hide new likes,
// comments and follows from accounts the person does not follow and has not interacted with in
// 30 days) is the server's; nothing is computed here.
//
// Wording follows the live frames, which differ from the earlier stub: lead "Choose which
// notifications you see."; the row has the rule as its description. The frame's back arrow is
// not drawn here (the Settings shell already carries navigation, same as the other leaves).
import { Link } from "react-router";
import { getStoredAccessToken } from "../../lib/session";
import NotificationToggleRows from "./NotificationToggleRows";

const ROWS = [
  {
    key: "qualityFilter" as const,
    label: "Quality filter",
    desc: "Hides likes, comments and follows from accounts you don’t follow and haven’t interacted with in the last 30 days.",
  },
];

export default function NotificationFiltersPage() {
  if (!getStoredAccessToken()) {
    return (
      <p className="settings-status" role="status">
        Log in to manage your notification filters. <Link to="/login">Log in</Link>
      </p>
    );
  }

  return (
    <div className="settings-page">
      <div>
        <h2 className="settings-page__title">Filters</h2>
        <p className="settings-page__lead">Choose which notifications you see.</p>
      </div>
      <NotificationToggleRows
        rows={ROWS}
        footnote={
          <p className="notif-footnote">Messages, fixtures, results and Contest notifications are not affected.</p>
        }
      />
    </div>
  );
}
