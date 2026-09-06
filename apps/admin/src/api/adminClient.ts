// Fetch wrapper for the Admin Console API (services/api `/admin/*`
// routes). Mirrors apps/web/src/api/*'s conventions — a thin typed
// wrapper, an explicit error class, VITE_API_BASE_URL with the same
// localhost fallback — but adds the one thing the admin side needs that
// apps/web never built: transparent access-token refresh on 401 against
// the isolated admin auth path (POST /admin/auth/refresh, Decision Log
// #54).
//
// AdminAuthContext installs a bridge (installAdminAuthBridge) so this
// module can read the current tokens, persist rotated ones, and signal a
// terminal auth failure (refresh itself 401s → session is dead → route
// back to /login). Nothing here touches localStorage directly; the
// bridge owns that.

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export class AdminApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.body = body;
  }
}

export interface AdminAuthBridge {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  /** A refresh rotated the token pair — persist and adopt the new tokens. */
  onTokensRotated(tokens: { accessToken: string; refreshToken: string }): void;
  /** Refresh failed / no refresh token — the session is over. */
  onAuthLost(): void;
}

let bridge: AdminAuthBridge | null = null;

export function installAdminAuthBridge(next: AdminAuthBridge | null): void {
  bridge = next;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Attach the admin bearer token and refresh-retry on 401. Default true. */
  auth?: boolean;
  /** Extra headers (e.g. an explicit bearer for logout-everywhere). */
  headers?: Record<string, string>;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "message" in body) {
    const m = (body as { message: unknown }).message;
    if (typeof m === "string") return m;
    if (Array.isArray(m) && typeof m[0] === "string") return m[0];
  }
  return fallback;
}

async function rawRequest(path: string, options: RequestOptions, accessToken: string | null): Promise<Response> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.auth !== false && accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  return fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

// Shared in-flight refresh so a burst of concurrent 401s triggers exactly
// one POST /admin/auth/refresh.
let refreshInFlight: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  if (!bridge) return false;
  const refreshToken = bridge.getRefreshToken();
  if (!refreshToken) {
    bridge.onAuthLost();
    return false;
  }
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          bridge?.onAuthLost();
          return false;
        }
        const data = (await res.json()) as { accessToken: string; refreshToken: string };
        bridge?.onTokensRotated({ accessToken: data.accessToken, refreshToken: data.refreshToken });
        return true;
      } catch {
        bridge?.onAuthLost();
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export async function adminFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = bridge?.getAccessToken() ?? null;
  let res = await rawRequest(path, options, token);

  if (res.status === 401 && options.auth !== false && bridge) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      res = await rawRequest(path, options, bridge.getAccessToken());
    }
  }

  if (res.status === 204) return undefined as T;

  const body = await parseBody(res);
  if (!res.ok) {
    throw new AdminApiError(res.status, messageFromBody(body, `Request failed (${res.status})`), body);
  }
  return body as T;
}
