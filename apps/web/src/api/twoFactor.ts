// User two-factor settings client (B-087 / B-111; backend B-086, services/api
// modules/two-factor, Decision Log #446). Authenticator-app (TOTP) only: there is no SMS.
//
//   GET  /auth/two-factor/status                    -> { enabled, backupCodesRemaining }
//   POST /auth/two-factor/enrol/start               -> { secret, otpauthUri }
//   POST /auth/two-factor/enrol/confirm { code }    -> { backupCodes }  (the ONLY time they are returned)
//   POST /auth/two-factor/backup-codes/regenerate { password } -> { backupCodes }
//   POST /auth/two-factor/disable { password }      -> 204
//
// The secret and the backup codes returned here are credentials. Callers keep them in
// component state only: never logged, never in storage or a URL, cleared on unmount.
// Nothing in this file logs a response body.
//
// Error `code`s the pages branch on (AuthApiError.code):
//   two_factor_invalid_code     401 on a code check. One answer by design for a wrong code, a
//                               replayed code and a spent backup code.
//   two_factor_wrong_password   401 on regenerate / disable.
//   two_factor_locked           429: five wrong codes lock code entry for that account.
//   two_factor_already_enabled  409 on enrol/start.
//   two_factor_not_enabled      409 on regenerate / disable.
//   two_factor_no_pending       400 on enrol/confirm: the enrolment expired (it lives ten minutes).
import { AuthApiError } from "./auth";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export interface TwoFactorStatus {
  enabled: boolean;
  backupCodesRemaining: number;
}

export interface EnrolmentStart {
  /** Base32 secret, for the manual-entry fallback. */
  secret: string;
  /** otpauth:// URI the QR code encodes. */
  otpauthUri: string;
}

const NETWORK_MESSAGE = "Couldn’t reach the Soccernity server. Please try again shortly.";

async function call(
  accessToken: string,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, string>,
): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (body) headers["Content-Type"] = "application/json";
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkError) {
    throw new AuthApiError(NETWORK_MESSAGE, { cause: networkError });
  }
}

async function bodyCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { code?: unknown };
    return typeof body.code === "string" ? body.code : null;
  } catch {
    return null;
  }
}

async function failure(response: Response, fallback: string, wrongCredential: string): Promise<AuthApiError> {
  if (response.status === 401) {
    return new AuthApiError(fallback, { status: 401, code: wrongCredential });
  }
  if (response.status === 429) {
    return new AuthApiError("Too many incorrect codes.", { status: 429, code: "two_factor_locked" });
  }
  const code = await bodyCode(response);
  if (response.status === 409 && code === "two_factor_already_enabled") {
    return new AuthApiError("Two-factor authentication is already on.", { status: 409, code: "two_factor_already_enabled" });
  }
  if (response.status === 409 && code === "two_factor_not_enabled") {
    return new AuthApiError("Two-factor authentication is not on.", { status: 409, code: "two_factor_not_enabled" });
  }
  if (response.status === 400 && code === "two_factor_no_pending_enrolment") {
    return new AuthApiError("This setup has expired.", { status: 400, code: "two_factor_no_pending" });
  }
  return new AuthApiError(fallback, { status: response.status });
}

export async function getTwoFactorStatus(accessToken: string): Promise<TwoFactorStatus> {
  const response = await call(accessToken, "GET", "/auth/two-factor/status");
  if (!response.ok) {
    throw new AuthApiError("Couldn’t load your two-factor settings.", { status: response.status });
  }
  return (await response.json()) as TwoFactorStatus;
}

export async function startTwoFactorEnrolment(accessToken: string): Promise<EnrolmentStart> {
  const response = await call(accessToken, "POST", "/auth/two-factor/enrol/start");
  if (!response.ok) throw await failure(response, "Couldn’t start two-factor setup.", "two_factor_invalid_code");
  return (await response.json()) as EnrolmentStart;
}

export async function confirmTwoFactorEnrolment(accessToken: string, code: string): Promise<string[]> {
  const response = await call(accessToken, "POST", "/auth/two-factor/enrol/confirm", { code });
  if (!response.ok) throw await failure(response, "That code didn’t work.", "two_factor_invalid_code");
  return ((await response.json()) as { backupCodes: string[] }).backupCodes;
}

export async function regenerateBackupCodes(accessToken: string, password: string): Promise<string[]> {
  const response = await call(accessToken, "POST", "/auth/two-factor/backup-codes/regenerate", { password });
  if (!response.ok) throw await failure(response, "Couldn’t make new backup codes.", "two_factor_wrong_password");
  return ((await response.json()) as { backupCodes: string[] }).backupCodes;
}

export async function disableTwoFactor(accessToken: string, password: string): Promise<void> {
  const response = await call(accessToken, "POST", "/auth/two-factor/disable", { password });
  if (!response.ok) throw await failure(response, "Couldn’t turn off two-factor authentication.", "two_factor_wrong_password");
}
