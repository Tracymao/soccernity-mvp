// User two-factor RECOVERY client (B-278; backend B-276, services/api modules/two-factor/recovery,
// Decision Log #455, #456). For someone who lost BOTH the authenticator device and the backup codes.
//
//   POST /auth/two-factor/recovery/request          { email, password }  -> 202 { audience }
//   GET  /auth/two-factor/recovery/link/:token                           -> { state, kind, minor?, requestedAt? }
//   POST /auth/two-factor/recovery/confirm          { token }            -> { state: "waiting", executeAt, cancelToken }
//   POST /auth/two-factor/recovery/cancel           { cancelToken }      -> { state: "cancelled" }
//   POST /auth/two-factor/recovery/guardian/approve { token }            -> { state: "done" }
//   POST /auth/two-factor/recovery/guardian/decline { token }            -> { state: "declined" }
//
// No sign-in is involved: the person cannot sign in and a guardian has no account, so no call here
// sends the access token or cookies, and the session code is not touched. The ONLY GET is `link/:token`
// (it changes nothing, so an email scanner may open the link safely); every state-changing call is a POST
// that a page makes ONLY when a button is pressed.
//
// The password, every token and the cancel token are credentials. Callers keep them in component
// state only: never logged, never in storage or a URL. Nothing here logs.
//
// Errors branch on the API's stable `code` (api/twoFactorCodes.ts) and on the `state` the server puts
// on a rejected link action, never on message text.
import {
  TWO_FACTOR_RECOVERY_LINK_EXPIRED,
  TWO_FACTOR_RECOVERY_LINK_INVALID,
  TWO_FACTOR_RECOVERY_LINK_USED,
  TWO_FACTOR_RECOVERY_UNAVAILABLE,
} from "./twoFactorCodes";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

/** What a link looks like to a page. */
export type RecoveryLinkState = "valid" | "expired" | "used" | "invalid";
/** The states a REJECTED link action can report. */
export type RecoveryLinkProblem = Exclude<RecoveryLinkState, "valid">;
export type RecoveryAudience = "account" | "guardian" | "no_guardian";

export interface RecoveryLinkSummary {
  state: RecoveryLinkState;
  /** null when the link is unknown. */
  kind: "adult" | "guardian" | null;
  /** Only on a valid GUARDIAN link: the young person's PUBLIC name (never the real name). */
  minor?: { publicName: string };
  /** Only on a valid guardian link; ISO. */
  requestedAt?: string;
}

export interface ConfirmedRecovery {
  state: "waiting";
  /** ISO: when two-factor will be removed. */
  executeAt: string;
  /** Held in memory only; lets the page offer "This wasn't me". */
  cancelToken: string;
}

export class RecoveryApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  /** Set on a rejected link action (400): why the link cannot be used. */
  readonly linkProblem?: RecoveryLinkProblem;
  /** Whole seconds from a 429's Retry-After header, when the browser could read it. */
  readonly retryAfterSeconds?: number;
  readonly cause?: unknown;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      linkProblem?: RecoveryLinkProblem;
      retryAfterSeconds?: number;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "RecoveryApiError";
    this.status = options.status;
    this.code = options.code;
    this.linkProblem = options.linkProblem;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.cause = options.cause;
  }
}

const NETWORK_MESSAGE = "Couldn't reach the Soccernity server. Please try again shortly.";

async function send(path: string, init: Parameters<typeof fetch>[1]): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}/auth/two-factor/recovery${path}`, init);
  } catch (networkError) {
    throw new RecoveryApiError(NETWORK_MESSAGE, { cause: networkError });
  }
}

async function readBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const body = (await response.clone().json()) as unknown;
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function parseRetryAfter(response: Response): number | undefined {
  const value = response.headers.get("Retry-After");
  if (value === null) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined;
}

const PROBLEM_BY_CODE: Record<string, RecoveryLinkProblem> = {
  [TWO_FACTOR_RECOVERY_LINK_INVALID]: "invalid",
  [TWO_FACTOR_RECOVERY_LINK_EXPIRED]: "expired",
  [TWO_FACTOR_RECOVERY_LINK_USED]: "used",
};

/** Turns a non-OK response into the one error type the pages branch on. */
async function failure(response: Response): Promise<RecoveryApiError> {
  const body = await readBody(response);
  const code = typeof body.code === "string" ? body.code : undefined;
  const linkProblem = code ? PROBLEM_BY_CODE[code] : undefined;
  return new RecoveryApiError("That didn’t work.", {
    status: response.status,
    code,
    linkProblem,
    retryAfterSeconds: response.status === 429 ? parseRetryAfter(response) : undefined,
  });
}

async function postJson<T>(path: string, body: Record<string, string>): Promise<T> {
  const response = await send(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await failure(response);
  return (await response.json()) as T;
}

/**
 * Step 1: the person asks for a recovery link. A wrong password, an unknown email, two-factor off and
 * a closed account are ALL the same 202 `{ audience: "account" }` -- by design, so the page cannot (and
 * must not) tell them apart. 429 carries Retry-After; 503 `two_factor_recovery_unavailable` means Redis is down.
 */
export function requestRecovery(email: string, password: string): Promise<{ audience: RecoveryAudience }> {
  return postJson<{ audience: RecoveryAudience }>("/request", { email, password });
}

/** Reads a link's state. Changes nothing (safe for link scanners). */
export async function getRecoveryLink(token: string): Promise<RecoveryLinkSummary> {
  const response = await send(`/link/${encodeURIComponent(token)}`, { method: "GET" });
  if (!response.ok) throw await failure(response);
  return (await response.json()) as RecoveryLinkSummary;
}

/** Adult: starts the 24-hour wait. Button press only. */
export function confirmRecovery(token: string): Promise<ConfirmedRecovery> {
  return postJson<ConfirmedRecovery>("/confirm", { token });
}

/** Adult: cancels a waiting request with the cancel token. Button press only. */
export function cancelRecovery(cancelToken: string): Promise<{ state: "cancelled" }> {
  return postJson<{ state: "cancelled" }>("/cancel", { cancelToken });
}

/** Guardian: approves removing two-factor. Button press only. */
export function approveRecovery(token: string): Promise<{ state: "done" }> {
  return postJson<{ state: "done" }>("/guardian/approve", { token });
}

/** Guardian: "I didn't expect this". Button press only. */
export function declineRecovery(token: string): Promise<{ state: "declined" }> {
  return postJson<{ state: "declined" }>("/guardian/decline", { token });
}

export function isRecoveryUnavailable(error: unknown): boolean {
  return error instanceof RecoveryApiError && error.code === TWO_FACTOR_RECOVERY_UNAVAILABLE;
}
