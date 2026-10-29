// Fetch wrapper for the Admin Console API (services/api `/admin/*`
// routes). Mirrors apps/web/src/api/*'s conventions -- a thin typed
// wrapper, an explicit error class, VITE_API_BASE_URL with the same
// localhost fallback -- but adds the one thing the admin side needs that
// apps/web's per-page clients do not carry themselves: transparent
// access-token refresh on 401 against the isolated admin auth path
// (POST /admin/auth/refresh, Decision Log #54).
//
// B-247: the access token is read from the in-memory session
// (lib/adminSession.ts) and the refresh runs through the httpOnly admin cookie
// (lib/adminRefresh.ts) -- there is no refresh token in JavaScript any more, so
// nothing here touches browser storage. Only the three admin auth routes
// (login, refresh, logout) send `credentials: "include"`; every other call
// authenticates with the Bearer header alone.
//
// AdminAuthContext installs a bridge (installAdminAuthBridge) so this module can
// signal a terminal auth failure (the refresh was rejected -> the session is
// dead -> route back to /login).
import { clearAdminSession, getAdminAccessToken } from "../lib/adminSession";
import { refreshAdminToken } from "../lib/adminRefresh";

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
  /** The refresh was rejected (401) -- the session is over. */
  onAuthLost(): void;
}

let bridge: AdminAuthBridge | null = null;

export function installAdminAuthBridge(next: AdminAuthBridge | null): void {
  bridge = next;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /**
   * A plain JSON-serializable body, OR a real `FormData` (sprint-5/admin-media-storage-frontend
   * — the multipart upload `POST /admin/media/upload` needs) — a
   * FormData body skips both the `Content-Type: application/json`
   * header (the browser sets its own multipart boundary automatically)
   * and `JSON.stringify`, see `rawRequest` below.
   */
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
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  // A FormData body must NOT set Content-Type itself — fetch/the browser
  // computes the real multipart boundary and sets the header for us;
  // overriding it here would break the boundary the server expects.
  if (options.body !== undefined && !isFormData) headers["Content-Type"] = "application/json";
  if (options.auth !== false && accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  return fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    headers,
    body: options.body !== undefined ? (isFormData ? (options.body as FormData) : JSON.stringify(options.body)) : undefined,
  });
}

export async function adminFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getAdminAccessToken();
  let res = await rawRequest(path, options, token);

  if (res.status === 401 && options.auth !== false) {
    // At most ONE refresh per rejected token (shared by parallel 401s and across
    // tabs, see lib/adminRefresh.ts) and the request is replayed at most once.
    const outcome = await refreshAdminToken(token);
    if (outcome === "signed-out") {
      // The cookie is gone, expired, revoked or reused: the session is over in
      // every tab. A 403 (Origin refused) or a network / 5xx failure leaves it
      // alone -- a configuration or transient error must not sign the operator out.
      clearAdminSession();
      bridge?.onAuthLost();
    } else if (outcome === "ok") {
      const refreshed = getAdminAccessToken();
      if (refreshed && refreshed !== token) {
        res = await rawRequest(path, options, refreshed);
      }
    }
  }

  if (res.status === 204) return undefined as T;

  const body = await parseBody(res);
  if (!res.ok) {
    throw new AdminApiError(res.status, messageFromBody(body, `Request failed (${res.status})`), body);
  }
  return body as T;
}
