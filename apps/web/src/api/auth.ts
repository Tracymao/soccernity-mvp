// Auth Service client -- MVP Build Plan Section 4.1.
//
// Both `POST /auth/login` (PR B3) and `POST /auth/register` (PR B2) are
// real, merged endpoints as of `sprint-2/auth-response-shape-
// reconciliation`, which is also the PR that reconciled this file's
// `LoginResponse`/`RegisterResponse` interfaces against the real backend
// DTOs -- they were speculative pre-B2/B3 scaffolding before that. The
// authoritative source of truth for both shapes is
// `services/api/src/modules/auth/auth-response.mapper.ts`
// (`AuthResponse`/`toAuthUserSummary`) and
// `services/api/src/modules/auth/README.md`'s "response shape
// reconciliation" note -- read those, not this comment, if either shape
// changes again.
import type { GuardianRelationship } from "../pages/signup/types";

// No VITE_ env convention existed anywhere in apps/web before these PRs.
// Falls back to services/api's default local port (services/api/src/main.ts).
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export interface LoginRequest {
  email: string;
  password: string;
}

// Section 5.7: access token is short-lived (15 min) and carries only
// `userId` + `role` inside the JWT itself -- no `isMinor`/`consentStatus`
// trusted claims there (services/api's token.types.ts's non-negotiable).
// That's a separate concern from this response body, though: `user` here
// intentionally DOES include `isMinor`/`verificationStatus` -- a fresh,
// one-time HTTP response reading the caller's own current state back to
// them, per auth-response.mapper.ts's `AuthUserSummary`. Refresh token is
// rotating/revocable (Redis-backed per PR B1). This mirrors the real
// `AuthResponse` shape both `POST /auth/login` and `POST /auth/register`
// return as of sprint-2/auth-response-shape-reconciliation.
export interface LoginResponse {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: AuthUserSummary;
}

// Shared by LoginResponse and RegisterResponse -- mirrors
// services/api's auth-response.mapper.ts's AuthUserSummary exactly.
// Never includes `passwordHash`; deliberately does include
// `isMinor`/`verificationStatus` (see the comment above LoginResponse).
export interface AuthUserSummary {
  id: string;
  email: string;
  phone: string | null;
  displayName: string;
  dateOfBirth: string;
  isMinor: boolean;
  role: "fan" | "player" | "admin";
  verificationStatus: string;
  createdAt: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
  /** ISO 8601 date, e.g. "2011-09-04" -- from the Age Gate step. */
  dateOfBirth: string;
  /**
   * Present only when the Age Gate step determined the account is a minor
   * (under 18 -- Decision Log #8, Build Plan Section 9). Guardian's
   * minorUserId, consentStatus, consentToken and consentTimestamp
   * (Section 3 / schema.prisma) are all server-assigned, never sent by the
   * client.
   */
  guardian?: {
    name: string;
    email: string;
    relationship: GuardianRelationship;
  };
}

// As of sprint-2/auth-response-shape-reconciliation, `POST /auth/register`
// returns the identical token/user shape `POST /auth/login` does (see
// LoginResponse above) -- previously this interface had no token fields
// at all and a narrower, ad hoc `user` subset; both were speculative
// scaffolding, not the real DTO. `guardian` is unaffected by that PR --
// still only present when the registrant declared as a minor.
export interface RegisterResponse {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: AuthUserSummary;
  guardian: {
    id: string;
    name: string;
    email: string;
    relationship: GuardianRelationship;
    consentStatus: string;
  } | null;
}

// Shared by login() and registerUser() -- both are "a request to the auth
// API failed" and neither caller (LoginPage.tsx, RegisterStep.tsx)
// branches on anything beyond `instanceof AuthApiError` + `.message`, so
// two near-identical classes (one carrying `status`, one carrying
// `cause`) would just be duplication. `status` and `cause` are both
// optional debugging metadata, not control flow -- a request can supply
// either, both, or neither.
export class AuthApiError extends Error {
  readonly status?: number;
  readonly cause?: unknown;

  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message);
    this.name = "AuthApiError";
    this.status = options?.status;
    this.cause = options?.cause;
  }
}

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (networkError) {
    // Network-level failure -- expected right now, since no backend route
    // exists yet for this endpoint. Surface as a typed error so the UI
    // can distinguish "backend unreachable" from "bad credentials".
    throw new AuthApiError("Could not reach the Soccernity server. Please try again shortly.", {
      cause: networkError,
    });
  }

  if (!response.ok) {
    let message = "Something went wrong signing you in.";
    if (response.status === 401) {
      message = "That email and password don't match.";
    }
    throw new AuthApiError(message, { status: response.status });
  }

  return (await response.json()) as LoginResponse;
}

// --- Guardian consent (Build Plan Section 8.3, F5) ------------------------
//
// GuardianConsentDto/{message} shape mirrors
// services/api/src/modules/auth/guardian-consent/guardian-consent.controller.ts
// exactly. confirmGuardianConsent/resendGuardianConsentRequest are both
// deliberately unauthenticated (no Bearer header) -- the guardian is not a
// Soccernity account holder, and the token/email themselves are the
// credential, mirroring resetPassword's own trust model in lib/authApi.ts.
// getGuardianConsentStatus is the one authenticated call of the three (it's
// the MINOR checking their own status), so it takes an access token.

export interface GuardianConsentStatus {
  consentStatus: string;
  guardianEmail: string;
  canResend: boolean;
  consentTimestamp: string | null;
}

export async function confirmGuardianConsent(consentToken: string): Promise<{ message: string }> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/guardian-consent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consentToken }),
    });
  } catch (networkError) {
    throw new AuthApiError("Couldn't reach the Soccernity server. Please try again shortly.", {
      cause: networkError,
    });
  }

  if (!response.ok) {
    // Deliberately generic -- matches the backend's own non-enumeration
    // posture (guardian-consent.service.ts's confirmConsent()): an
    // unknown, expired, or already-rotated token all land here
    // indistinguishably.
    throw new AuthApiError("This link is invalid or has expired. Ask the account holder to resend the request.", {
      status: response.status,
    });
  }

  return (await response.json()) as { message: string };
}

export async function getGuardianConsentStatus(accessToken: string): Promise<GuardianConsentStatus> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/guardian-consent/status`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (networkError) {
    throw new AuthApiError("Couldn't reach the Soccernity server. Please try again shortly.", {
      cause: networkError,
    });
  }

  if (!response.ok) {
    throw new AuthApiError(`Couldn't load your guardian consent status (${response.status}).`, {
      status: response.status,
    });
  }

  return (await response.json()) as GuardianConsentStatus;
}

export async function resendGuardianConsentRequest(email: string): Promise<{ message: string }> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/guardian-consent/resend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  } catch (networkError) {
    throw new AuthApiError("Couldn't reach the Soccernity server. Please try again shortly.", {
      cause: networkError,
    });
  }

  if (!response.ok) {
    throw new AuthApiError(`Couldn't send that request (${response.status}).`, { status: response.status });
  }

  return (await response.json()) as { message: string };
}

// --- Account lifecycle (F6, sprint-1/f5-f6-missing-endpoints) -------------
//
// All three are JwtAuthGuard-only, 204-No-Content-on-success, and require
// the current password as a re-entry confirmation step -- mirrored here
// exactly (see auth.controller.ts). The UI calling these MUST collect the
// password before calling, never send a blank/omitted one.

export async function changePassword(
  accessToken: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  } catch (networkError) {
    throw new AuthApiError("Couldn't reach the Soccernity server. Please try again shortly.", {
      cause: networkError,
    });
  }

  if (!response.ok) {
    const message = response.status === 401 ? "Your current password is incorrect." : "Couldn't change your password.";
    throw new AuthApiError(message, { status: response.status });
  }
}

export async function deactivateAccount(accessToken: string, password: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/deactivate-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ password }),
    });
  } catch (networkError) {
    throw new AuthApiError("Couldn't reach the Soccernity server. Please try again shortly.", {
      cause: networkError,
    });
  }

  if (!response.ok) {
    const message = response.status === 401 ? "That password is incorrect." : "Couldn't deactivate your account.";
    throw new AuthApiError(message, { status: response.status });
  }
}

// This does NOT hard-delete anything server-side -- deleteAccount() sets
// the account to a pending_deletion status (see auth.controller.ts's own
// comment). Callers must present copy that reflects that ("your request
// has been received"), never "your account has been deleted".
export async function deleteAccount(accessToken: string, password: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/delete-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ password }),
    });
  } catch (networkError) {
    throw new AuthApiError("Couldn't reach the Soccernity server. Please try again shortly.", {
      cause: networkError,
    });
  }

  if (!response.ok) {
    const message = response.status === 401 ? "That password is incorrect." : "Couldn't process that request.";
    throw new AuthApiError(message, { status: response.status });
  }
}

export async function registerUser(payload: RegisterRequest): Promise<RegisterResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Refresh token is an httpOnly cookie per Build Plan Section 5.7.
      credentials: "include",
      body: JSON.stringify(payload),
    });
  } catch (networkError) {
    // Expected during Sprint 1 until B2 merges and a server is actually
    // running at API_BASE_URL -- this is not a bug in this request.
    throw new AuthApiError(
      "Couldn't reach the Soccernity server. The account service may not be available yet -- try again shortly.",
      { cause: networkError },
    );
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new AuthApiError(
      (body && typeof body.message === "string" && body.message) || `Registration failed (${response.status}).`,
      { status: response.status, cause: body },
    );
  }

  return body as RegisterResponse;
}
