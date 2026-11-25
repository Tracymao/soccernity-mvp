// Decision Log #571 (code-only): where a visitor goes back to after logging in.
//
// A "return to" value travels in the URL (`/login?returnTo=...`) and is typed by whoever builds
// the link, so it is untrusted input. An unrestricted one is an open redirect. This is therefore
// an ALLOW-LIST: only the search page (`/search`, with its query string) is accepted. Anything
// else, including absolute URLs, `//host`, backslash forms, control characters, encoded path
// tricks and anything over 300 characters, returns null and the visitor lands where they land
// today. Other pages can be added later one at a time, each with its own test and Decision Log row.

const MAX_LENGTH = 300;
const ALLOWED_PATH = "/search";
// A parse origin no real address can have (".invalid" is reserved), so any input that escapes it,
// such as "//host", "/\host" or "javascript:", shows up as a different origin.
const PARSE_BASE = "http://return.invalid";
// Any control character, space or DEL anywhere in the raw input, and any backslash.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\u0000-\u0020\u007f\\]/;

/** A same-site path and query to navigate to after login, or null when `raw` is not allowed. */
export function safeReturnTo(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_LENGTH) return null;
  if (FORBIDDEN_CHARS.test(raw)) return null;
  // One "/" first, and not a second one (a protocol-relative "//host").
  if (raw[0] !== "/" || raw[1] === "/") return null;

  // The path as typed, before any "?" or "#", must be exactly the allowed one. Checking the raw
  // text (not only the parsed URL) stops "/%2e%2e/search" style forms, which the URL parser
  // would normalise into an allowed-looking path.
  const rawPath = raw.split(/[?#]/, 1)[0];
  if (rawPath !== ALLOWED_PATH) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw, PARSE_BASE);
  } catch {
    return null;
  }
  if (parsed.origin !== PARSE_BASE) return null;
  if (parsed.pathname !== ALLOWED_PATH) return null;

  // Path and query only. A hash is dropped.
  return parsed.pathname + parsed.search;
}

/** `/login` with a `returnTo` carrying `returnTo`, or plain `/login` when it is not allowed. */
export function buildLoginLink(returnTo: string): string {
  const safe = safeReturnTo(returnTo);
  return safe === null ? "/login" : `/login?returnTo=${encodeURIComponent(safe)}`;
}
