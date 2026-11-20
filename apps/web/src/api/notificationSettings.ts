// Notification settings (build register B-062, Decision Log #472 adopted default (c)).
// Backend: services/api/src/modules/notifications/notification-settings.controller.ts.
//
//   GET   /notification-settings  -> the four booleans (no row stored means all false)
//   PATCH /notification-settings  -> partial; any of the four, answers with all four
//
// The options only decide whether a NEW like, comment or follow notification is stored for the
// caller. Nothing already received is hidden, and message, fixture, result, Contest and every
// other notification type is never affected.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export type NotificationSettingKey =
  | "qualityFilter"
  | "muteNonFollowing"
  | "muteNonFollowers"
  | "muteNewAccounts";

export type NotificationSettings = Record<NotificationSettingKey, boolean>;

export class NotificationSettingsApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "NotificationSettingsApiError";
    this.status = status;
  }
}

async function send(accessToken: string, init: { method?: string; body?: string }): Promise<NotificationSettings> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/notification-settings`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body,
    });
  } catch {
    throw new NotificationSettingsApiError("Couldn't reach the Soccernity server. Please try again shortly.");
  }
  if (!response.ok) {
    throw new NotificationSettingsApiError(`Notification settings request failed (${response.status}).`, response.status);
  }
  return (await response.json()) as NotificationSettings;
}

export function getNotificationSettings(accessToken: string): Promise<NotificationSettings> {
  return send(accessToken, {});
}

export function updateNotificationSettings(
  accessToken: string,
  changes: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  return send(accessToken, { method: "PATCH", body: JSON.stringify(changes) });
}
