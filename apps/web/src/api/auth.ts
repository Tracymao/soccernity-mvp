// Auth Service client -- MVP Build Plan Section 4.1.
//
// *** NOT CONFIRMED WIRED TO A LIVE ENDPOINT AS OF THESE PRS. ***
// `POST /auth/login` (PR B3) and `POST /auth/register` (PR B2) are
// spec'd in Build Plan Section 4.1 but neither's controller/DTO had
// merged to `main` as of Sprint 1 F2/F3 -- only the auth
// *infrastructure* (PR B1: password hashing, token issuance, Redis
// refresh-token store, rate-limit guard -- see
// services/api/src/modules/auth/README.md) is in. There is no NestJS
// route to call yet for either.
//
// This module makes the real request shapes (per Section 4.1 + the
// concrete token spec in Section 5.7, and Section 3's User/Guardian
// field names mirrored in services/api/prisma/schema.prisma) so that
// once B2/B3 land, wiring is a base-URL/env change, not a rewrite.
// Until then, calling either function will reject with a network/404
// error against whatever origin the app is served from -- this is
// intentional; it is not mocked or faked to look like a working demo.
// LoginPage.tsx and RegisterStep.tsx surface that failure as a real
// error state rather than pretending to succeed. Reconcile both shapes
// against the real DTOs once B2/B3 land -- do not assume either is
// correct until then.
import type { GuardianRelationship } from "../pages/signup/types";

// No VITE_ env convention existed anywhere in apps/web before these PRs.
// Falls back to services/api's default local port (services/api/src/main.ts).
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export interface LoginRequest {
  email: string;
  password: string;
}

// Section 5.7: access token is short-lived (15 min) and carries only
// `userId` + `role` -- no `is_minor`/`consent_status` trusted claims.
// Refresh token is rotating/revocable (Redis-backed per PR B1). Exact
// response field names are NOT fixed by Section 4 (it's an endpoint
// list, "not a full OpenAPI spec") -- this shape is this PR's best-guess
// scaffolding pending B3, and should be reconciled against the real DTO
// when that PR lands.
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: "fan" | "player" | "admin";
  };
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

export interface RegisterResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    isMinor: boolean;
    verificationStatus: string;
  };
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
