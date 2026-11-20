// Muted accounts leaf. Figma: "Settings — Muted accounts" 2926:9482 (desktop) / "…— Mobile"
// 5696:8307, now the live states drawn by Figma pass W8 (docs/figma-w8-settings.md row B):
// all off 6990:55319 / mobile 6990:55997, two on 6990:55499 / 6990:56036.
//
// LIVE (build register B-062, Decision Log #472 adopted default (c)). The three rows map, in
// the frame's order, to the three mute options of GET and PATCH /notification-settings:
//   People you don’t follow      -> muteNonFollowing
//   People who don’t follow you  -> muteNonFollowers
//   People with a new account    -> muteNewAccounts
// They only stop NEW like, comment and follow notifications being stored; nothing already
// received is hidden. There is no per-account mute list (none is specified). What counts as a
// "new account" is the server's rule.
//
// Wording follows the live frames, which differ from the earlier stub: lead "Mute
// notifications from these people."; no row has a description.
import { Link } from "react-router";
import { getStoredAccessToken } from "../../lib/session";
import NotificationToggleRows from "./NotificationToggleRows";

const ROWS = [
  { key: "muteNonFollowing" as const, label: "People you don’t follow" },
  { key: "muteNonFollowers" as const, label: "People who don’t follow you" },
  { key: "muteNewAccounts" as const, label: "People with a new account" },
];

export default function MutedAccountsPage() {
  if (!getStoredAccessToken()) {
    return (
      <p className="settings-status" role="status">
        Log in to manage muted accounts. <Link to="/login">Log in</Link>
      </p>
    );
  }

  return (
    <div className="settings-page">
      <div>
        <h2 className="settings-page__title">Muted accounts</h2>
        <p className="settings-page__lead">Mute notifications from these people.</p>
      </div>
      <NotificationToggleRows rows={ROWS} />
    </div>
  );
}
