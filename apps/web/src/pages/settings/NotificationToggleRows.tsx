// Shared body of the two live Notification Preferences leaves (Filters, Muted accounts):
// loading, load error, saving and failed-save states around a list of toggle rows.
import type { ReactNode } from "react";
import type { NotificationSettingKey } from "../../api/notificationSettings";
import { useNotificationSettings } from "./useNotificationSettings";
import SettingToggle from "./SettingToggle";
import "./SettingsNotificationsPage.css";

export interface ToggleRow {
  key: NotificationSettingKey;
  label: string;
  desc?: string;
}

export default function NotificationToggleRows({ rows, footnote }: { rows: ToggleRow[]; footnote?: ReactNode }) {
  const { load, settings, saving, saveFailed, toggle, retry } = useNotificationSettings();

  if (load === "error") {
    return (
      <div className="notif-state">
        <p className="notif-state__line" role="alert">
          Couldn&rsquo;t load your settings.
        </p>
        <button type="button" className="notif-state__retry" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }
  if (load === "loading" || !settings) {
    return (
      <p className="notif-state__line" role="status">
        Loading your settings&hellip;
      </p>
    );
  }

  return (
    <>
      <ul className="notif-rows notif-rows--live">
        {rows.map((row) => (
          <li key={row.key} className="notif-row">
            <div className="notif-row__body">
              <p className="notif-row__title" id={`notif-${row.key}`}>
                {row.label}
              </p>
              {row.desc ? <p className="notif-row__desc">{row.desc}</p> : null}
            </div>
            <SettingToggle
              labelledBy={`notif-${row.key}`}
              checked={settings[row.key]}
              disabled={saving.has(row.key)}
              onChange={() => toggle(row.key)}
            />
          </li>
        ))}
      </ul>
      {footnote}
      {saving.size > 0 ? (
        <p className="notif-state__line" role="status">
          Saving&hellip;
        </p>
      ) : null}
      {saveFailed ? (
        <p className="notif-state__line notif-state__line--error" role="alert">
          Couldn&rsquo;t save that change. It has been put back. Check your connection and try again.
        </p>
      ) : null}
    </>
  );
}
