// Honest "designed, not built in the app yet" state for the three Settings
// sections whose leaf screens are follow-up PRs (Security & Account
// Settings, Notification Preferences, Display, Language & Region). The
// nav rail / hub still list them (matching Figma); clicking one lands here
// instead of a 404 or fake content. Same disclosed-incompleteness tone as
// LeaderboardPage's unsupported club filter and apps/admin's stubs.
import { Link } from "react-router";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "./settingsSections";

export default function SettingsSectionPlaceholder({ section }: { section: SettingsSectionId }) {
  const s = SETTINGS_SECTIONS.find((x) => x.id === section)!;
  return (
    <div className="settings-page">
      <h2 className="settings-page__title">{s.label}</h2>
      <div className="settings-placeholder" role="status">
        <p className="settings-page__lead">
          <strong>Not built yet.</strong> This section is designed but its screens haven&rsquo;t been added to the
          app. It will cover: {s.description.toLowerCase()}.
        </p>
        <p className="settings-page__lead">
          <Link to="/settings/account">Go to Account settings</Link>
        </p>
      </div>
    </div>
  );
}
