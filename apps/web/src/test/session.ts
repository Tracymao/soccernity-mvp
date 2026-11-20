// B-246 -- the one shared way a unit test puts an apps/web page into a signed-in
// (or signed-out) state. The access token lives in lib/session.ts's in-memory
// store, NOT in browser storage, so a test that wrote "sn_access_token" to
// sessionStorage would no longer sign anyone in. Seed the store instead.
import { dropSessionLocally, getStoredAccessToken, storeSession } from "../lib/session";

// Signs the page in with `accessToken` (no cross-tab broadcast).
export function seedSession(accessToken: string): void {
  storeSession({ accessToken });
}

// Signs the page out (no cross-tab broadcast).
export function clearSession(): void {
  dropSessionLocally();
}

// What the app currently holds, for assertions ("a sign-in stored this token").
export function heldAccessToken(): string | null {
  return getStoredAccessToken();
}
