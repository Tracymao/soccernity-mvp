// Auth API client for the signup entry flow (Sprint 1, PR F3).
//
// NOT CONFIRMED WIRED TO A LIVE ENDPOINT. As of this PR, B2
// (sprint-1/auth-register-verify-email) has not merged to main -- there is
// no server-side implementation of POST /auth/register to build or test
// against yet. The request/response shapes below are a best-effort
// scaffold built directly from MVP Build Plan Section 4.1 ("API Contract
// Sketch" -- explicitly "a build-ready endpoint list, not a full OpenAPI
// spec") and Section 3's User/Guardian field names (mirrored in
// services/api/prisma/schema.prisma). Reconcile against B2's actual
// request/response DTOs once it merges -- do not assume this is correct
// until then.
import type { GuardianRelationship } from "../pages/signup/types";

// No VITE_ env convention existed anywhere in apps/web before this PR.
// Falls back to services/api's default local port (services/api/src/main.ts).
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

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

export interface RegisterResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    isMinor: boolean;
    verificationStatus: string;
  };
}

export class RegisterError extends Error {
  // Not a TS parameter-property shorthand -- base eslint:recommended's
  // no-unused-vars (not @typescript-eslint's) doesn't recognise that
  // `public readonly cause` in the constructor signature assigns
  // `this.cause`, and misflags it as unused.
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "RegisterError";
    this.cause = cause;
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
    throw new RegisterError(
      "Couldn't reach the Soccernity server. The account service may not be available yet -- try again shortly.",
      networkError,
    );
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new RegisterError(
      (body && typeof body.message === "string" && body.message) || `Registration failed (${response.status}).`,
      body,
    );
  }

  return body as RegisterResponse;
}
