// Admin two-factor client (B-271; backend B-270, Decision Log #446). services/api:
//   - admin-auth.controller.ts          /admin/auth/login/two-factor[/enrol/start|/enrol/confirm]  (PRE-SESSION)
//   - admin-two-factor.controller.ts    /admin/auth/two-factor/*                                    (signed in)
//   - admin-staff-roles.controller.ts   POST /admin/staff/:id/two-factor/reset                      (superadmin)
//
// The pre-session calls use plain fetch, never adminFetch: there is no access token yet, and
// adminFetch answers a 401 by trying a refresh and signing the operator out, which is wrong for
// "that code did not work". The ONLY credential on those calls is the challenge or enrolment
// token in the request body, which the caller keeps in memory (never storage). The two calls
// that finish a sign-in (login/two-factor, enrol/confirm) set the httpOnly admin refresh
// cookie, so every pre-session call sends credentials: "include" and the cookie-mode header,
// like adminLogin does.
import { adminFetch } from "./adminClient";
import type {
  AdminAuthResult,
  AdminEnrolmentRequired,
  AdminLoginResult,
  AdminTwoFactorChallenge,
} from "./adminAuth";
import { ADMIN_COOKIE_MODE_HEADERS } from "../lib/adminRefresh";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

// services/api two-factor.constants.ts, copied here (apps/admin cannot import from services/api).
export const TWO_FACTOR_CODE_LOCKED_CODE = "two_factor_code_locked";
export const TWO_FACTOR_NO_PENDING_ENROLMENT_CODE = "two_factor_no_pending_enrolment";
export const TWO_FACTOR_NOT_ENABLED_CODE = "two_factor_not_enabled";
export const CANNOT_RESET_OWN_TWO_FACTOR_CODE = "cannot_reset_own_two_factor";
// The API's one message for a wrong, replayed or already-used code (INVALID_CODE_MESSAGE).
export const INVALID_CODE_MESSAGE = "That code did not work. Check it and try again.";

export class AdminTwoFactorError extends Error {
  readonly status: number;
  /** The machine-readable `code` in the response body, when there is one. */
  readonly code: string | null;
  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "AdminTwoFactorError";
    this.status = status;
    this.code = code;
  }
}

// Tells the three answers of POST /admin/auth/login apart (see AdminLoginResult).
export function isTwoFactorChallenge(result: AdminLoginResult): result is AdminTwoFactorChallenge {
  return "twoFactorRequired" in result && result.twoFactorRequired === true;
}

export function isEnrolmentRequired(result: AdminLoginResult): result is AdminEnrolmentRequired {
  return "twoFactorEnrolmentRequired" in result && result.twoFactorEnrolmentRequired === true;
}

// What a failed code step means to the screen. 401 with the API's "did not work" message is a
// wrong or used code; any other 401 (or the "start enrolment first" 400) means the challenge or
// enrolment token is gone and the only way out is to sign in again; any 429 (the per-account
// lock carries code two_factor_code_locked, the per-IP limit carries none) is the locked wording.
export type CodeFailure = "wrong" | "locked" | "expired" | "other";

export function classifyCodeFailure(err: unknown): CodeFailure {
  if (!(err instanceof AdminTwoFactorError)) return "other";
  if (err.status === 429) return "locked";
  if (err.status === 401) return err.message === INVALID_CODE_MESSAGE ? "wrong" : "expired";
  if (err.status === 400) return err.code === TWO_FACTOR_NO_PENDING_ENROLMENT_CODE ? "expired" : "wrong";
  return "other";
}

async function readBody(res: Response): Promise<{ message: string | null; code: string | null; json: unknown }> {
  const text = await res.text();
  if (!text) return { message: null, code: null, json: undefined };
  try {
    const json = JSON.parse(text) as { message?: unknown; code?: unknown };
    const message =
      typeof json.message === "string"
        ? json.message
        : Array.isArray(json.message) && typeof json.message[0] === "string"
          ? json.message[0]
          : null;
    return { message, code: typeof json.code === "string" ? json.code : null, json };
  } catch {
    return { message: null, code: null, json: undefined };
  }
}

async function postPreSession<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ADMIN_COOKIE_MODE_HEADERS },
      credentials: "include",
      body: JSON.stringify(body),
    });
  } catch {
    throw new AdminTwoFactorError(0, "Network error");
  }
  const parsed = await readBody(res);
  if (!res.ok) {
    throw new AdminTwoFactorError(res.status, parsed.message ?? `Request failed (${res.status})`, parsed.code);
  }
  return parsed.json as T;
}

// POST /admin/auth/login/two-factor { challengeToken, code } -> the session (like login).
// `code` is a 6-digit authenticator code OR a backup code.
export function completeTwoFactorLogin(challengeToken: string, code: string): Promise<AdminAuthResult> {
  return postPreSession<AdminAuthResult>("/admin/auth/login/two-factor", { challengeToken, code });
}

export interface EnrolmentStart {
  /** The base32 secret, for typing into an authenticator app. */
  secret: string;
  /** The otpauth:// URI the QR code encodes. */
  otpauthUri: string;
}

// POST /admin/auth/login/two-factor/enrol/start { enrolmentToken }.
export function startEnrolmentAtSignIn(enrolmentToken: string): Promise<EnrolmentStart> {
  return postPreSession<EnrolmentStart>("/admin/auth/login/two-factor/enrol/start", { enrolmentToken });
}

export type AdminEnrolmentResult = AdminAuthResult & { backupCodes: string[] };

// POST /admin/auth/login/two-factor/enrol/confirm { enrolmentToken, code } -> the SESSION and the
// 10 backup codes, shown once. The caller must hold the session until the codes are saved.
export function confirmEnrolmentAtSignIn(enrolmentToken: string, code: string): Promise<AdminEnrolmentResult> {
  return postPreSession<AdminEnrolmentResult>("/admin/auth/login/two-factor/enrol/confirm", {
    enrolmentToken,
    code,
  });
}

// ---- Signed in (adminFetch: Bearer access token) ----

export interface AdminTwoFactorStatus {
  enabled: boolean;
  backupCodesRemaining: number;
}

// GET /admin/auth/two-factor/status.
export function getAdminTwoFactorStatus(): Promise<AdminTwoFactorStatus> {
  return adminFetch<AdminTwoFactorStatus>("/admin/auth/two-factor/status");
}

// POST /admin/auth/two-factor/backup-codes/regenerate { password } -> 10 new codes; the current
// ones stop working. A wrong password is a 401 ("Incorrect password"), surfaced by adminFetch as
// an AdminApiError.
export function regenerateAdminBackupCodes(password: string): Promise<{ backupCodes: string[] }> {
  return adminFetch<{ backupCodes: string[] }>("/admin/auth/two-factor/backup-codes/regenerate", {
    method: "POST",
    body: { password },
  });
}

// POST /admin/staff/:id/two-factor/reset (superadmin only; never your own account).
export function resetAdminTwoFactor(id: string): Promise<{ id: string; twoFactorEnabled: false }> {
  return adminFetch<{ id: string; twoFactorEnabled: false }>(`/admin/staff/${id}/two-factor/reset`, {
    method: "POST",
  });
}
