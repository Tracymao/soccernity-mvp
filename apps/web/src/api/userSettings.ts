// The caller's own messaging and media settings (build register B-061, Decision Log #472
// adopted defaults (d) and (i)). Backend: services/api users module.
//
//   GET   /users/me/settings -> { dmPermission, mediaSensitive }
//   PATCH /users/me/settings   { dmPermission? , mediaSensitive? }  (either or both)
//
// dmPermission only ever TIGHTENS the safety rules: "following" and "none" stop other people
// STARTING a new conversation with you (existing chats keep working). mediaSensitive blurs your
// own post pictures and videos for everyone behind "tap to view", also on posts already published.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export type DmPermission = "everyone" | "following" | "none";

export const DM_PERMISSIONS: readonly DmPermission[] = ["everyone", "following", "none"];

export interface UserSettings {
  dmPermission: DmPermission;
  mediaSensitive: boolean;
}

export class UserSettingsApiError extends Error {
  readonly status?: number;

  constructor(message: string, options?: { status?: number }) {
    super(message);
    this.name = "UserSettingsApiError";
    this.status = options?.status;
  }
}

const NETWORK_MESSAGE = "Couldn't reach the Soccernity server. Please try again shortly.";

async function send(accessToken: string, init: { method?: string; body?: string }, what: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/users/me/settings`, {
      method: init.method,
      body: init.body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch {
    throw new UserSettingsApiError(NETWORK_MESSAGE);
  }
  if (!response.ok) {
    throw new UserSettingsApiError(`${what} (${response.status}).`, { status: response.status });
  }
  return response;
}

export async function getUserSettings(accessToken: string): Promise<UserSettings> {
  const response = await send(accessToken, {}, "Couldn't load your settings");
  return (await response.json()) as UserSettings;
}

export async function updateUserSettings(accessToken: string, patch: Partial<UserSettings>): Promise<UserSettings> {
  const response = await send(
    accessToken,
    { method: "PATCH", body: JSON.stringify(patch) },
    "Couldn't save your change",
  );
  return (await response.json()) as UserSettings;
}
