// Social sign-in client (B-085; backend B-084, services/api modules/social-auth). Google and Facebook only:
// Apple has no button and no endpoint anywhere (Decision Log #378, #468).
//
// Every route is public (a person signing in has no session yet). The credentials are the single-use OAuth `state`
// and the short-lived social registration token, which live in memory only (lib/socialSignIn.ts keeps the `state`
// for the browser round trip). Errors are told apart by the server's `code`, never its wording.
import { COOKIE_MODE_HEADERS } from "../lib/cookieMode";
import { AuthApiError, type RegisterResponse, type LoginResponse, type TwoFactorChallenge } from "./auth";
import type { GuardianRelationship } from "../pages/signup/types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export const SOCIAL_PROVIDERS = ["google", "facebook"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export function isSocialProvider(value: unknown): value is SocialProvider {
  return typeof value === "string" && (SOCIAL_PROVIDERS as readonly string[]).includes(value);
}

export const SOCIAL_PROVIDER_LABELS: Record<SocialProvider, string> = {
  google: "Google",
  facebook: "Facebook",
};

// The stable codes services/api/src/modules/social-auth/social-auth.constants.ts puts on its errors.
export const SOCIAL_AUTH_FAILED = "social_auth_failed";
export const SOCIAL_PROVIDER_UNAVAILABLE = "social_provider_unavailable";
export const SOCIAL_REGISTRATION_INVALID = "social_registration_invalid";
export const SOCIAL_EMAIL_NOT_NEEDED = "social_email_not_needed";
export const SOCIAL_EMAIL_REQUIRED = "social_email_required";
export const SOCIAL_EMAIL_CODE_INVALID = "social_email_code_invalid";
export const SOCIAL_EMAIL_CODE_RATE_LIMITED = "social_email_code_rate_limited";
// 409 from POST /auth/social/register: one generic answer that names no cause (an existing account, a taken email...).
export const SOCIAL_SIGNUP_UNAVAILABLE = "social_signup_unavailable";

export interface SocialProfile {
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  needsEmail: boolean;
}

export type SocialCallbackResult =
  | { status: "signed_in"; response: LoginResponse }
  | { status: "two_factor_required"; challenge: TwoFactorChallenge }
  | { status: "registration_required"; socialRegistrationToken: string; profile: SocialProfile };

async function post(path: string, body: unknown, cookieMode: boolean): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cookieMode ? COOKIE_MODE_HEADERS : {}) },
      ...(cookieMode ? { credentials: "include" as const } : {}),
      body: JSON.stringify(body),
    });
  } catch (networkError) {
    throw new AuthApiError("Couldn't reach the Soccernity server. Please try again shortly.", {
      cause: networkError,
    });
  }
}

async function failure(response: Response, fallback: string): Promise<AuthApiError> {
  const body = (await response.json().catch(() => null)) as { code?: unknown; message?: unknown } | null;
  return new AuthApiError(typeof body?.message === "string" && body.message ? body.message : fallback, {
    status: response.status,
    code: typeof body?.code === "string" ? body.code : undefined,
  });
}

// GET /auth/social/providers -> the providers that are switched on. Never throws: a server that cannot be reached, or
// that answers anything unexpected, means "show no buttons" (the buttons are optional; password sign-in is unaffected).
export async function getEnabledSocialProviders(): Promise<SocialProvider[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/social/providers`);
    if (!response.ok) return [];
    const body = (await response.json()) as { providers?: unknown };
    if (!Array.isArray(body.providers)) return [];
    return body.providers.filter(isSocialProvider);
  } catch {
    return [];
  }
}

export async function startSocialSignIn(
  provider: SocialProvider,
  staySignedIn: boolean,
): Promise<{ authorizationUrl: string }> {
  const response = await post(`/auth/social/${provider}/start`, { staySignedIn }, false);
  if (!response.ok) throw await failure(response, "Couldn't start the sign-in. Please try again.");
  return (await response.json()) as { authorizationUrl: string };
}

export async function completeSocialCallback(
  provider: SocialProvider,
  code: string,
  state: string,
): Promise<SocialCallbackResult> {
  const response = await post(`/auth/social/${provider}/callback`, { code, state }, true);
  if (!response.ok) throw await failure(response, "Social sign-in did not work.");
  const body = (await response.json()) as Record<string, unknown> & { status: string };
  if (body.status === "signed_in") {
    const { status: _status, ...rest } = body;
    void _status;
    return { status: "signed_in", response: rest as unknown as LoginResponse };
  }
  if (body.status === "two_factor_required") {
    const { status: _status, ...rest } = body;
    void _status;
    return { status: "two_factor_required", challenge: rest as unknown as TwoFactorChallenge };
  }
  if (body.status === "registration_required") {
    return {
      status: "registration_required",
      socialRegistrationToken: body.socialRegistrationToken as string,
      profile: body.profile as SocialProfile,
    };
  }
  throw new AuthApiError("Social sign-in did not work.", { status: 500 });
}

// The provider gave no email: send a one-time code to the address typed (always { sent: true }).
export async function requestSocialEmailCode(socialRegistrationToken: string, email: string): Promise<void> {
  const response = await post("/auth/social/email-code", { socialRegistrationToken, email }, false);
  if (!response.ok) throw await failure(response, "Couldn't send the code. Please try again.");
}

export async function verifySocialEmailCode(
  socialRegistrationToken: string,
  code: string,
): Promise<{ email: string }> {
  const response = await post("/auth/social/email-code/verify", { socialRegistrationToken, code }, false);
  if (!response.ok) throw await failure(response, "That code did not work.");
  return (await response.json()) as { email: string };
}

export interface SocialRegisterRequest {
  socialRegistrationToken: string;
  displayName: string;
  /** ISO 8601 date from the Age Gate. The provider's own birthday is never asked for or used. */
  dateOfBirth: string;
  countryCode: string;
  guardian?: { name: string; email: string; relationship: GuardianRelationship };
}

export async function registerSocial(payload: SocialRegisterRequest): Promise<RegisterResponse> {
  const response = await post("/auth/social/register", payload, true);
  if (!response.ok) throw await failure(response, `Registration failed (${response.status}).`);
  return (await response.json()) as RegisterResponse;
}
