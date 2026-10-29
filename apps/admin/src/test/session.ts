// B-247 -- the one shared way a unit test puts an apps/admin page into a signed-in
// (or signed-out) state. The access token lives in lib/adminSession.ts's in-memory
// store, NOT in browser storage, so a test that wrote "sn_admin_access_token" to
// localStorage would no longer sign anyone in. Seed the store instead.
import {
  dropAdminSessionLocally,
  getAdminAccessToken,
  storeAdminSession,
} from "../lib/adminSession";

// Signs the page in with `accessToken` (no cross-tab broadcast).
export function seedAdminSession(accessToken: string): void {
  storeAdminSession({ accessToken });
}

// Signs the page out (no cross-tab broadcast).
export function clearAdminTestSession(): void {
  dropAdminSessionLocally();
}

// What the app currently holds, for assertions ("a sign-in stored this token").
export function heldAdminAccessToken(): string | null {
  return getAdminAccessToken();
}
