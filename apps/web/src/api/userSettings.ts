// The caller's own messaging and media settings (build register B-061, Decision Log #472
// adopted defaults (d) and (i)). Backend: services/api users module.
//
//   GET   /users/me/settings -> { dmPermission, mediaSensitive, readReceipts, isProfilePublic }
//   PATCH /users/me/settings   { dmPermission? , mediaSensitive? , readReceipts? , isProfilePublic? }  (any of them)
//
// dmPermission only ever TIGHTENS the safety rules: "following" and "none" stop other people
// STARTING a new conversation with you (existing chats keep working). mediaSensitive blurs your
// own post pictures and videos for everyone behind "tap to view", also on posts already published.
// readReceipts is the EFFECTIVE value: the saved choice, or the age default (on for an adult account,
// off for an under-18 account). A PATCH stores an explicit true or false. It decides whether the
// "Seen" state of the messages you SENT is shown; the server applies the rule to every message read.
// isProfilePublic (B-060, founder decision 2026-11-08) is the EFFECTIVE value: always true for an
// under-18 account, which cannot turn it off (a PATCH answers 403 `profile_visibility_not_available`).
// When false, anyone who is not the owner and does not follow the owner sees a minimal private card.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export type DmPermission = "everyone" | "following" | "none";

export const DM_PERMISSIONS: readonly DmPermission[] = ["everyone", "following", "none"];

export interface UserSettings {
  dmPermission: DmPermission;
  mediaSensitive: boolean;
  readReceipts: boolean;
  isProfilePublic: boolean;
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
