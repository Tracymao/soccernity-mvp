// The five Settings sections, in Figma order. Labels are Decision Log #230's
// resolved wording (founder decisions #2/#3), baked into the Figma
// "Settings Shell" component (6339:16094) and the mobile hub
// ("Settings — Menu — Mobile", 6289:15068). Descriptions are the hub's
// own one-liners (sprint-2-settings-mobile-menu-hub-report.md §3).
//
// `built` is true only for sections whose leaf screens exist in code.
// The rest render SettingsSectionPlaceholder.
export type SettingsSectionId = "account" | "security" | "privacy" | "notifications" | "display";

export interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  to: string;
  description: string;
  built: boolean;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "account",
    label: "Account",
    to: "/settings/account",
    description: "Account information, password, and account status",
    built: true,
  },
  {
    id: "security",
    label: "Security & Account Settings",
    to: "/settings/security",
    description: "Two-factor authentication and account security",
    built: false,
  },
  {
    id: "privacy",
    label: "Privacy",
    to: "/settings/privacy",
    description: "Who can see your profile and posts, and how your data is used",
    built: true,
  },
  {
    id: "notifications",
    label: "Notification Preferences",
    to: "/settings/notifications",
    description: "Choose which notifications you get, and how you get them",
    built: false,
  },
  {
    id: "display",
    label: "Display, Language & Region",
    to: "/settings/display",
    description: "Accessibility, display, language, and data usage",
    built: false,
  },
];

export function sectionForPath(pathname: string): SettingsSectionId | null {
  const seg = pathname.split("/")[2];
  return SETTINGS_SECTIONS.find((s) => s.id === seg)?.id ?? null;
}
