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
// Error codes: AuthApiError.code carries the API's own `code` (api/twoFactorCodes.ts), never
// message text.
import { AuthApiError } from "./auth";
import {
  TWO_FACTOR_ALREADY_ENABLED,
  TWO_FACTOR_CODE_LOCKED,
  TWO_FACTOR_INCORRECT_PASSWORD,
  TWO_FACTOR_INVALID_CODE,
  TWO_FACTOR_NOT_ENABLED,
  TWO_FACTOR_NO_PENDING_ENROLMENT,
  errorBodyCode,
} from "./twoFactorCodes";

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

// `fallback401` is the code for a 401 that carries no recognised body code (an older API):
// a code check -> invalid_code, a password check -> incorrect_password.
async function failure(response: Response, fallback: string, fallback401: string): Promise<AuthApiError> {
  const code = await errorBodyCode(response);
  if (response.status === 401) {
    const known = code === TWO_FACTOR_INVALID_CODE || code === TWO_FACTOR_INCORRECT_PASSWORD;
    return new AuthApiError(fallback, { status: 401, code: known ? code : fallback401 });
  }
  if (response.status === 429) {
    return new AuthApiError("Too many incorrect codes.", { status: 429, code: TWO_FACTOR_CODE_LOCKED });
  }
  if (response.status === 409 && code === TWO_FACTOR_ALREADY_ENABLED) {
    return new AuthApiError("Two-factor authentication is already on.", { status: 409, code: TWO_FACTOR_ALREADY_ENABLED });
  }
  if (response.status === 409 && code === TWO_FACTOR_NOT_ENABLED) {
    return new AuthApiError("Two-factor authentication is not on.", { status: 409, code: TWO_FACTOR_NOT_ENABLED });
  }
  if (response.status === 400 && code === TWO_FACTOR_NO_PENDING_ENROLMENT) {
    return new AuthApiError("This setup has expired.", { status: 400, code: TWO_FACTOR_NO_PENDING_ENROLMENT });
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
  if (!response.ok) throw await failure(response, "Couldn’t start two-factor setup.", TWO_FACTOR_INVALID_CODE);
  return (await response.json()) as EnrolmentStart;
}

export async function confirmTwoFactorEnrolment(accessToken: string, code: string): Promise<string[]> {
  const response = await call(accessToken, "POST", "/auth/two-factor/enrol/confirm", { code });
  if (!response.ok) throw await failure(response, "That code didn’t work.", TWO_FACTOR_INVALID_CODE);
  return ((await response.json()) as { backupCodes: string[] }).backupCodes;
}

export async function regenerateBackupCodes(accessToken: string, password: string): Promise<string[]> {
  const response = await call(accessToken, "POST", "/auth/two-factor/backup-codes/regenerate", { password });
  if (!response.ok) throw await failure(response, "Couldn’t make new backup codes.", TWO_FACTOR_INCORRECT_PASSWORD);
  return ((await response.json()) as { backupCodes: string[] }).backupCodes;
}

export async function disableTwoFactor(accessToken: string, password: string): Promise<void> {
  const response = await call(accessToken, "POST", "/auth/two-factor/disable", { password });
  if (!response.ok) throw await failure(response, "Couldn’t turn off two-factor authentication.", TWO_FACTOR_INCORRECT_PASSWORD);
}
