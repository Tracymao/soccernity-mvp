// Web push settings (build register B-062 / B-285, Decision Log #472 adopted default (e)).
// Backend: services/api/src/modules/push/push-settings.controller.ts.
//
//   GET    /notification-settings/push               -> { available, publicKey? }
//   POST   /notification-settings/push/subscription  -> 200 (idempotent on the endpoint)
//   DELETE /notification-settings/push/subscription  -> 204 (only the caller's own row)
//
// `available` is false until the founder sets the VAPID keys; POST and DELETE then answer 503
// `push_not_configured`. There is no read of "is THIS browser subscribed": the browser itself
// (PushManager.getSubscription) is the source of truth for that.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export interface PushStatus {
  available: boolean;
  publicKey?: string;
}

export interface BrowserPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export class PushApiError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "PushApiError";
    this.status = status;
    this.code = code;
  }
}

async function send(accessToken: string, method: string, path: string, body?: unknown): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/notification-settings/push${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new PushApiError("Couldn't reach the Soccernity server. Please try again shortly.");
  }
  if (!response.ok) {
    let code: string | undefined;
    try {
      const parsed = (await response.clone().json()) as { code?: unknown };
      if (typeof parsed.code === "string") code = parsed.code;
    } catch {
      /* no JSON body */
    }
    throw new PushApiError(`Push request failed (${response.status}).`, response.status, code);
  }
  return response;
}

export async function getPushStatus(accessToken: string): Promise<PushStatus> {
  const response = await send(accessToken, "GET", "");
  return (await response.json()) as PushStatus;
}

export async function savePushSubscription(accessToken: string, subscription: BrowserPushSubscription): Promise<void> {
  await send(accessToken, "POST", "/subscription", subscription);
}

export async function deletePushSubscription(accessToken: string, endpoint: string): Promise<void> {
  await send(accessToken, "DELETE", "/subscription", { endpoint });
}
