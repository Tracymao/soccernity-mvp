// Admin auth + profile client — services/api `/admin/auth/*` and
// `/admin/profile` (Decision Log #54,
// services/api/src/modules/admin/README.md).
//
// Response shapes mirror services/api's admin-response.mapper.ts
// (AdminAuthResponse / AdminTokenPairResponse / AdminSummary) exactly.
// Read that file, not this comment, if a shape changes.
import { adminFetch } from "./adminClient";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export type AdminRole = string; // services/api: "editor" | "moderator" | "superadmin"

export interface AdminSummary {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: AdminRole;
  accountStatus: string; // "active" | "deactivated"
  createdAt: string;
  updatedAt: string;
}

export interface AdminTokenPair {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface AdminAuthResult extends AdminTokenPair {
  admin: AdminSummary;
}

export class AdminAuthError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
  }
}

// POST /admin/auth/login — { email, password } → 200 AdminAuthResponse.
// Same non-enumerating posture as POST /auth/login: a wrong email and a
// wrong password both return the same generic 401. This client surfaces
// that as a single "Invalid email or password" message regardless.
export async function adminLogin(email: string, password: string): Promise<AdminAuthResult> {
  const res = await fetch(`${API_BASE_URL}/admin/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 401) {
    throw new AdminAuthError(401, "Invalid email or password.");
  }
  if (res.status === 429) {
    throw new AdminAuthError(429, "Too many attempts. Please wait a minute and try again.");
  }
  if (!res.ok) {
    throw new AdminAuthError(res.status, `Sign in failed (${res.status}). Please try again.`);
  }
  return (await res.json()) as AdminAuthResult;
}

// POST /admin/auth/logout — best-effort. A network failure must not trap
// the operator in a session they asked to end; the caller clears local
// state regardless of the outcome here.
export async function adminLogout(refreshToken: string, accessToken: string | null): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/admin/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    /* ignore — local session is cleared by the caller either way */
  }
}

// GET /admin/profile — AdminJwtAuthGuard. Used on app boot to hydrate the
// signed-in admin's identity (the shell's name/role block). Goes through
// adminFetch so a boot-time expired access token is transparently
// refreshed before the session is treated as invalid.
export function getAdminProfile(): Promise<AdminSummary> {
  return adminFetch<AdminSummary>("/admin/profile");
}
