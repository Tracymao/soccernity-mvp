// B-247 / Decision Log #422 (Build Plan 5.7) -- the Admin Console session lives in MEMORY.
//
// The admin access token is held in this module's variable and nowhere else: not in
// localStorage, sessionStorage, IndexedDB, a URL, or a cookie readable by script. The
// refresh token is an httpOnly, host-only, SameSite=Strict cookie (`sn_admin_rt`,
// Path /admin/auth) that JavaScript cannot read at all; the API sets, rotates and
// clears it. adminRefresh.ts / AdminAuthContext.tsx use it to restore the session
// at start-up and to rotate the access token, so a page reload begins with no token
// and gets one back through POST /admin/auth/refresh before the console renders.
//
// DELIBERATELY SEPARATE from apps/web's session handling
// (apps/web/src/lib/session.ts), which this file mirrors by design but never
// imports -- apps/admin is a separate Vite build that cannot resolve apps/web
// anyway. The Admin Console authenticates against the isolated AdminUser auth path
// (Decision Log #54): its own JWT signing secret (ADMIN_JWT_SECRET), an
// `aud: "admin-console"` claim, its own cookie name and path, and a disjoint
// `admin:refresh:*` Redis namespace. A User token and an admin token are mutually
// unusable (services/api/test/admin-auth-isolation.e2e-spec.ts), so nothing here
// shares a storage key, channel name or lock name with the web app.
//
// Cross-tab: tabs share the session through the cookie, and the refresh token
// ROTATES, so two tabs must never refresh with the same cookie at once. The lock
// lives in adminRefresh.ts (the same idea as apps/web's B-164); what this file adds
// is a BroadcastChannel so the tab that rotated can hand the new access token to
// the others (they would otherwise each have to rotate again) and so a sign-out in
// one tab signs out the rest.

let channelName = "sn-admin-session";

let accessToken: string | null = null;
const listeners = new Set<() => void>();

// True while this tab is restoring the session at start-up: a signed-out tab must
// not adopt a token broadcast by another tab (it never signed in), but one that is
// mid-restore should (the other tab just did the rotation it was about to do).
let restoring = false;
// Bumped every time the token is set from outside a sign-in (refresh or broadcast).
let tokenVersion = 0;

type ChannelMessage = { type: "token"; accessToken: string } | { type: "signout" };

let channel: BroadcastChannel | null | undefined;

function getChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  if (typeof BroadcastChannel === "undefined") {
    channel = null;
    return channel;
  }
  try {
    channel = new BroadcastChannel(channelName);
    channel.onmessage = (event: MessageEvent) => {
      const message = event.data as Partial<ChannelMessage> | null;
      if (!message || typeof message !== "object") return;
      if (message.type === "signout") {
        setToken(null);
      } else if (message.type === "token" && typeof message.accessToken === "string") {
        // Only a tab that has (or is restoring) a session adopts it.
        if (accessToken !== null || restoring) {
          tokenVersion += 1;
          setToken(message.accessToken);
        }
      }
    };
  } catch {
    channel = null;
  }
  return channel;
}

function post(message: ChannelMessage): void {
  try {
    getChannel()?.postMessage(message);
  } catch {
    /* a closed channel must never break sign-in or sign-out */
  }
}

function setToken(next: string | null): void {
  if (accessToken === next) return;
  accessToken = next;
  for (const listener of [...listeners]) listener();
}

// Starts listening on the channel as early as possible so a message sent before
// the first read is not lost.
export function initAdminSessionChannel(): void {
  getChannel();
}

export function getAdminAccessToken(): string | null {
  return accessToken;
}

export function subscribeAdminSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface AdminSessionTokens {
  accessToken: string;
}

// The one writer for a fresh sign-in. The refresh token never reaches JavaScript:
// the API put it in the cookie.
export function storeAdminSession(tokens: AdminSessionTokens): void {
  setToken(tokens.accessToken);
}

// Used by adminRefresh.ts after a successful rotation: sets the token, bumps the
// version and tells the other tabs.
export function replaceAdminAccessToken(next: string): void {
  tokenVersion += 1;
  setToken(next);
  post({ type: "token", accessToken: next });
}

// Ends the session in this tab and tells the others. The cookie itself is cleared
// by the API (POST /admin/auth/logout) or is already dead server-side (a rejected
// refresh).
export function clearAdminSession(): void {
  setToken(null);
  post({ type: "signout" });
}

// Clears this tab without telling the others -- for a failed start-up restore,
// where a broadcast could race a legitimate sign-in in another tab.
export function dropAdminSessionLocally(): void {
  setToken(null);
}

export function setAdminSessionRestoring(value: boolean): void {
  restoring = value;
}

export function getAdminSessionVersion(): number {
  return tokenVersion;
}

// Test-only: BroadcastChannel delivers between worker threads of the same process,
// so parallel test files would hear each other. Each file gets its own channel name
// (src/test/setup.ts).
export function __setAdminSessionChannelNameForTests(name: string): void {
  channelName = name;
}

export function getAdminSessionChannelName(): string {
  return channelName;
}

// Test-only: forget everything this module holds. Never called by app code.
export function __resetAdminSessionForTests(): void {
  accessToken = null;
  restoring = false;
  tokenVersion = 0;
  if (channel) {
    try {
      channel.close();
    } catch {
      /* ignore */
    }
  }
  channel = undefined;
  listeners.clear();
}

// Decodes the (already-server-verified) admin access token's payload WITHOUT
// signature verification -- display/convenience only, never a trust boundary. Every
// real authorization decision is made server-side by AdminJwtAuthGuard against a
// fresh Postgres read (Build Plan Section 5.7). services/api's admin-token.types.ts
// defines the payload as `{ sub, role, aud: "admin-console" }`.
export interface DecodedAdminToken {
  sub: string;
  role: string;
}

export function decodeAdminToken(token: string): DecodedAdminToken | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(payloadBase64)) as Partial<DecodedAdminToken>;
    if (typeof payload.sub !== "string" || typeof payload.role !== "string") return null;
    return { sub: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}
