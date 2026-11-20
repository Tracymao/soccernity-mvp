import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  clearAdminSession,
  decodeAdminToken,
  dropAdminSessionLocally,
  getAdminAccessToken,
  getAdminSessionChannelName,
  initAdminSessionChannel,
  replaceAdminAccessToken,
  setAdminSessionRestoring,
  storeAdminSession,
  subscribeAdminSession,
} from "./adminSession";
import { clearAdminTestSession } from "../test/session";

// A well-formed but unsigned JWT: header.payload.signature, payload
// base64url-encodes { sub, role, aud }.
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.sig`;
}

// The cross-tab channel is real here: a second BroadcastChannel instance on the
// same name stands in for "another tab" (Node delivers between instances).
let otherTab: BroadcastChannel;
let received: unknown[];

function nextMessage(): Promise<unknown> {
  return new Promise((resolve) => {
    otherTab.onmessage = (event: MessageEvent) => resolve(event.data);
  });
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30));
}

beforeEach(() => {
  clearAdminTestSession();
  window.sessionStorage.clear();
  window.localStorage.clear();
  received = [];
  otherTab = new BroadcastChannel(getAdminSessionChannelName());
  otherTab.onmessage = (event: MessageEvent) => received.push(event.data);
  initAdminSessionChannel();
});

afterEach(() => {
  otherTab.close();
});

describe("the in-memory admin session (B-247)", () => {
  it("holds the access token in memory and writes it to NO browser storage and NO cookie", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    storeAdminSession({ accessToken: "secret-admin-access-token" });

    expect(getAdminAccessToken()).toBe("secret-admin-access-token");
    expect(setItem).not.toHaveBeenCalled();
    for (const store of [window.sessionStorage, window.localStorage]) {
      expect(store.length).toBe(0);
    }
    expect(document.cookie).toBe("");
    expect(window.location.href).not.toContain("secret-admin-access-token");
    setItem.mockRestore();
  });

  it("replaces and clears the token and tells subscribers each time", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAdminSession(listener);

    storeAdminSession({ accessToken: "a1" });
    replaceAdminAccessToken("a2");
    expect(getAdminAccessToken()).toBe("a2");
    clearAdminSession();
    expect(getAdminAccessToken()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    storeAdminSession({ accessToken: "a3" });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("does not notify when the token did not change", () => {
    storeAdminSession({ accessToken: "same" });
    const listener = vi.fn();
    subscribeAdminSession(listener);
    storeAdminSession({ accessToken: "same" });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("cross-tab hand-off over the BroadcastChannel", () => {
  it("uses its own channel, not apps/web's", () => {
    expect(getAdminSessionChannelName()).toContain("sn-admin-session");
  });

  it("a token rotated here is broadcast to the other tabs", async () => {
    storeAdminSession({ accessToken: "a1" });
    const message = nextMessage();
    replaceAdminAccessToken("a2");
    expect(await message).toEqual({ type: "token", accessToken: "a2" });
  });

  it("a fresh sign-in is NOT broadcast (a signed-out tab must not be signed in by another tab)", async () => {
    storeAdminSession({ accessToken: "a1" });
    await flush();
    expect(received).toEqual([]);
  });

  it("a tab that has a session adopts a token another tab rotated", async () => {
    storeAdminSession({ accessToken: "a1" });
    otherTab.postMessage({ type: "token", accessToken: "rotated-elsewhere" });
    await vi.waitFor(() => expect(getAdminAccessToken()).toBe("rotated-elsewhere"));
  });

  it("a signed-out tab ignores a token broadcast (it never signed in)", async () => {
    otherTab.postMessage({ type: "token", accessToken: "not-mine" });
    await flush();
    expect(getAdminAccessToken()).toBeNull();
  });

  it("a tab that is restoring its session adopts the token the other tab just rotated", async () => {
    setAdminSessionRestoring(true);
    otherTab.postMessage({ type: "token", accessToken: "rotated-elsewhere" });
    await vi.waitFor(() => expect(getAdminAccessToken()).toBe("rotated-elsewhere"));
    setAdminSessionRestoring(false);
  });

  it("signing out in one tab signs out the others", async () => {
    storeAdminSession({ accessToken: "a1" });
    const message = nextMessage();
    clearAdminSession();
    expect(await message).toEqual({ type: "signout" });

    storeAdminSession({ accessToken: "a2" });
    otherTab.postMessage({ type: "signout" });
    await vi.waitFor(() => expect(getAdminAccessToken()).toBeNull());
  });

  it("dropping the session locally (a failed restore) does not broadcast a sign-out", async () => {
    storeAdminSession({ accessToken: "a1" });
    dropAdminSessionLocally();
    await flush();
    expect(received).toEqual([]);
  });

  it("ignores malformed channel messages", async () => {
    storeAdminSession({ accessToken: "a1" });
    otherTab.postMessage("nope");
    otherTab.postMessage({ type: "token" });
    otherTab.postMessage({ type: "token", accessToken: 42 });
    await flush();
    expect(getAdminAccessToken()).toBe("a1");
  });
});

describe("decodeAdminToken", () => {
  it("decodes sub + role from an admin token payload", () => {
    const token = fakeJwt({ sub: "admin-9", role: "moderator", aud: "admin-console" });
    expect(decodeAdminToken(token)).toEqual({ sub: "admin-9", role: "moderator" });
  });

  it("returns null for a malformed token", () => {
    expect(decodeAdminToken("not-a-jwt")).toBeNull();
    expect(decodeAdminToken("a.b")).toBeNull();
  });
});
