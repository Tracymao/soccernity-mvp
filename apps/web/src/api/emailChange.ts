// Email change (build register B-059, Decision Log #472 adopted default (f)).
// Backend: services/api/src/modules/email-change/ (README there).
//
//   POST /users/me/email-change { password, newEmail, twoFactorCode? }   (signed in)
//     202 { status: "verification_sent" }
//     403 wrong_password            the password is wrong
//     403 two_factor_required       two-factor is on and no code was sent
//     403 two_factor_invalid        the code is wrong, replayed or spent
//     403 guardian_consent_pending  a restricted-pending minor (GuardianConsentGuard)
//     400 email_change_not_accepted ONE answer for every reason the new address cannot be used
//     503 email_change_unavailable  no link could be built (server configuration)
//     429                           too many attempts (Retry-After; the page never prints a wait)
//
//   POST /auth/email-change/confirm { token }                            (public: the secret
//     in the emailed link is the credential)
//     204, or 400 email_change_link_invalid for an unknown, used, expired or superseded link.
//
// Identity-confirmation errors are 403 on purpose (a 401 would make the shared silent-refresh
// layer refresh and replay the request, spending the failed-attempt budget twice).
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export const EMAIL_CHANGE_WRONG_PASSWORD = "wrong_password";
export const EMAIL_CHANGE_TWO_FACTOR_REQUIRED = "two_factor_required";
export const EMAIL_CHANGE_TWO_FACTOR_INVALID = "two_factor_invalid";
export const EMAIL_CHANGE_CONSENT_PENDING = "guardian_consent_pending";
export const EMAIL_CHANGE_NOT_ACCEPTED = "email_change_not_accepted";
export const EMAIL_CHANGE_UNAVAILABLE = "email_change_unavailable";
export const EMAIL_CHANGE_LINK_INVALID = "email_change_link_invalid";

export class EmailChangeApiError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message);
    this.name = "EmailChangeApiError";
    this.status = options?.status;
    this.code = options?.code;
  }
}

export interface EmailChangeRequest {
  password: string;
  newEmail: string;
  twoFactorCode?: string;
}

async function bodyCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { code?: unknown };
    return typeof body.code === "string" ? body.code : undefined;
  } catch {
    return undefined;
  }
}

export async function requestEmailChange(accessToken: string, payload: EmailChangeRequest): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/users/me/email-change`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new EmailChangeApiError("Couldn't reach the Soccernity server. Please try again shortly.");
  }
  if (!response.ok) {
    throw new EmailChangeApiError(`Couldn't start the email change (${response.status}).`, {
      status: response.status,
      code: await bodyCode(response),
    });
  }
}

export async function confirmEmailChange(token: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/email-change/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch {
    throw new EmailChangeApiError("Couldn't reach the Soccernity server. Please try again shortly.");
  }
  if (!response.ok) {
    throw new EmailChangeApiError(`Couldn't confirm the email change (${response.status}).`, {
      status: response.status,
      code: await bodyCode(response),
    });
  }
}
