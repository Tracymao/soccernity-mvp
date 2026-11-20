// Username-review client (B-139 part (c), Decision Log #467). Backs the "Ask for a review" card on
// the Create Profile screen for a user whose username an admin removed.
//
//   GET  /users/me/username-review  -> { state, requestableUntil }
//   POST /users/me/username-review  { message? } -> 201 { state: 'pending' }
//
// The server decides every state and every rule (who may ask, the 30-day window, one request per
// removal). This file maps its answers; it computes none of them. Errors are told apart by the
// stable `code`, never by the English message (services/api username-review README).
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

// `reinstated` is declared by the server but cannot be returned today: a reinstated user simply
// has a username again, which the onboarding routing already handles.
export type UsernameReviewState = "none" | "can_request" | "pending" | "declined" | "reinstated";

export interface UsernameReviewStatus {
  state: UsernameReviewState;
  // Non-null only for `can_request`. Not shown (no frame draws it); kept so the type matches.
  requestableUntil: string | null;
}

export const USERNAME_REVIEW_MESSAGE_MAX_LENGTH = 500;

export const USERNAME_REVIEW_NOT_AVAILABLE_CODE = "username_review_not_available";
export const USERNAME_REVIEW_WINDOW_CLOSED_CODE = "username_review_window_closed";
export const USERNAME_REVIEW_ALREADY_REQUESTED_CODE = "username_review_already_requested";
export const USERNAME_REVIEW_MESSAGE_INVALID_CODE = "username_review_message_invalid";

export class UsernameReviewApiError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message);
    this.name = "UsernameReviewApiError";
    this.status = options?.status;
    this.code = options?.code;
  }
}

async function authedFetch(accessToken: string, init?: { method?: string; body?: string }): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}/users/me/username-review`, {
      method: init?.method,
      body: init?.body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch {
    throw new UsernameReviewApiError("Couldn't reach the Soccernity server.");
  }
}

async function errorFrom(response: Response, fallback: string): Promise<UsernameReviewApiError> {
  const body = await response.json().catch(() => null);
  const message = body && typeof body.message === "string" ? body.message : fallback;
  return new UsernameReviewApiError(message, {
    status: response.status,
    code: body && typeof body.code === "string" ? body.code : undefined,
  });
}

export async function getUsernameReviewStatus(accessToken: string): Promise<UsernameReviewStatus> {
  const response = await authedFetch(accessToken);
  if (!response.ok) throw await errorFrom(response, `Couldn't load the review status (${response.status}).`);
  return (await response.json()) as UsernameReviewStatus;
}

// An empty message is not sent at all (the field is optional). The server trims it and judges the
// 500-character limit after trimming.
export async function requestUsernameReview(accessToken: string, message: string): Promise<UsernameReviewStatus> {
  const trimmed = message.trim();
  const response = await authedFetch(accessToken, {
    method: "POST",
    body: JSON.stringify(trimmed ? { message: trimmed } : {}),
  });
  if (!response.ok) throw await errorFrom(response, `Couldn't send your request (${response.status}).`);
  return (await response.json()) as UsernameReviewStatus;
}
