// Auth Service client -- MVP Build Plan Section 4.1.
//
// *** NOT WIRED TO A LIVE ENDPOINT AS OF THIS PR (Sprint 1, F2). ***
// `POST /auth/login` is spec'd in Build Plan Section 4.1 but its
// controller/DTO (PR B3) had not merged to `main` as of this PR -- only
// the auth *infrastructure* (PR B1: password hashing, token issuance,
// Redis refresh-token store, rate-limit guard -- see
// services/api/src/modules/auth/README.md) is in. There is no NestJS
// route to call yet.
//
// This module makes the real request shape (per Section 4.1 + the
// concrete token spec in Section 5.7) so that once B3 lands, wiring is a
// base-URL/env change, not a rewrite. Until then, calling `login()` will
// reject with a network/404 error against whatever origin the app is
// served from -- this is intentional; it is not mocked or faked to look
// like a working demo. LoginPage.tsx surfaces that failure as a real
// error state rather than pretending to succeed.
//
// No `VITE_API_BASE_URL` convention exists yet in apps/web (checked --
// no .env/.env.example in this app as of this PR). Defaulting to
// same-origin `/auth/...` here; revisit once B2-B6/F1 settle on a real
// API base URL + proxy story (Decision Log candidate if not already
// covered elsewhere).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

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

export class AuthApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
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
  } catch {
    // Network-level failure -- expected right now, since no backend route
    // exists yet for this endpoint. Surface as a typed error so the UI
    // can distinguish "backend unreachable" from "bad credentials".
    throw new AuthApiError("Could not reach the Soccernity server. Please try again shortly.");
  }

  if (!response.ok) {
    let message = "Something went wrong signing you in.";
    if (response.status === 401) {
      message = "That email and password don't match.";
    }
    throw new AuthApiError(message, response.status);
  }

  return (await response.json()) as LoginResponse;
}
