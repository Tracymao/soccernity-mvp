// Shared handling for the server's under-16 tier (Under16RestrictionGuard,
// services/api: 403 with `code: "under_16_restricted"`) on the messaging,
// Bants and Community Groups routes.
//
// The server's own `message` for that code names the age threshold ("...not
// available for accounts under 16."), so it must NEVER be shown as-is: the
// UI deliberately reveals no threshold and implies nothing about the user
// having done anything wrong. Every failed response is therefore passed
// through apiFailure(), which swaps in UNDER_16_MESSAGE when the code
// matches and otherwise behaves exactly as each api client did before.
//
// Same shape as the guardian-consent 403 handling (a 403 the caller can tell
// apart), but shown as a plain inline message rather than a
// /guardian-consent link -- there is nothing for an under-16 to go and do.
export const UNDER_16_RESTRICTED_CODE = "under_16_restricted";
export const UNDER_16_MESSAGE = "This isn't available for your account yet.";

export interface ApiErrorOptions {
  status?: number;
  code?: string;
}

export function isUnder16Restricted(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === UNDER_16_RESTRICTED_CODE
  );
}

// Builds the error for a non-ok response. `useServerMessage` preserves the
// per-endpoint choice between the server's own message (write endpoints) and
// a fixed fallback (read endpoints).
export async function apiFailure<E extends Error>(
  make: (message: string, options: ApiErrorOptions) => E,
  response: Response,
  fallback: string,
  useServerMessage: boolean,
): Promise<E> {
  const body = await response.json().catch(() => null);
  if (body && body.code === UNDER_16_RESTRICTED_CODE) {
    return make(UNDER_16_MESSAGE, { status: response.status, code: UNDER_16_RESTRICTED_CODE });
  }
  let message = fallback;
  if (useServerMessage && body) {
    if (typeof body.message === "string") message = body.message;
    else if (Array.isArray(body.message) && typeof body.message[0] === "string") message = body.message[0];
  }
  return make(message, { status: response.status });
}
