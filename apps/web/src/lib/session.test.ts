import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  clearStoredSession,
  getSessionChannelName,
  dropSessionLocally,
  getStoredAccessToken,
  initSessionChannel,
  replaceAccessToken,
  setSessionRestoring,
  storeSession,
  subscribeSession,
} from "./session";
import { clearSession } from "../test/session";

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
  clearSession();
  window.sessionStorage.clear();
  window.localStorage.clear();
  received = [];
  otherTab = new BroadcastChannel(getSessionChannelName());
  otherTab.onmessage = (event: MessageEvent) => received.push(event.data);
  initSessionChannel();
});

afterEach(() => {
  otherTab.close();
});

describe("the in-memory session (B-246)", () => {
  it("holds the access token in memory and writes it to NO browser storage and NO cookie", () => {
    storeSession({ accessToken: "secret-access-token" });

    expect(getStoredAccessToken()).toBe("secret-access-token");

    for (const store of [window.sessionStorage, window.localStorage]) {
      expect(store.length).toBe(0);
      for (let i = 0; i < store.length; i += 1) {
        expect(store.getItem(store.key(i) as string)).not.toContain("secret-access-token");
      }
    }
    expect(document.cookie).toBe("");
    expect(window.location.href).not.toContain("secret-access-token");
  });

  it("replaces and clears the token and tells subscribers each time", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSession(listener);

    storeSession({ accessToken: "a1" });
    replaceAccessToken("a2");
    expect(getStoredAccessToken()).toBe("a2");
    clearStoredSession();
    expect(getStoredAccessToken()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    storeSession({ accessToken: "a3" });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("does not notify when the token did not change", () => {
    storeSession({ accessToken: "same" });
    const listener = vi.fn();
    subscribeSession(listener);
    storeSession({ accessToken: "same" });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("cross-tab hand-off over the BroadcastChannel", () => {
  it("a token rotated here is broadcast to the other tabs", async () => {
    storeSession({ accessToken: "a1" });
    const message = nextMessage();
    replaceAccessToken("a2");
    expect(await message).toEqual({ type: "token", accessToken: "a2" });
  });

  it("a fresh sign-in is NOT broadcast (a signed-out tab must not be signed in by another tab)", async () => {
    storeSession({ accessToken: "a1" });
    await flush();
    expect(received).toEqual([]);
  });

  it("a tab that has a session adopts a token another tab rotated", async () => {
    storeSession({ accessToken: "a1" });
    otherTab.postMessage({ type: "token", accessToken: "rotated-elsewhere" });
    await vi.waitFor(() => expect(getStoredAccessToken()).toBe("rotated-elsewhere"));
  });

  it("a signed-out tab ignores a token broadcast (it never signed in)", async () => {
    otherTab.postMessage({ type: "token", accessToken: "not-mine" });
    await flush();
    expect(getStoredAccessToken()).toBeNull();
  });

  it("a tab that is restoring its session adopts the token the other tab just rotated", async () => {
    setSessionRestoring(true);
    otherTab.postMessage({ type: "token", accessToken: "rotated-elsewhere" });
    await vi.waitFor(() => expect(getStoredAccessToken()).toBe("rotated-elsewhere"));
    setSessionRestoring(false);
  });

  it("signing out in one tab signs out the others", async () => {
    storeSession({ accessToken: "a1" });
    const message = nextMessage();
    clearStoredSession();
    expect(await message).toEqual({ type: "signout" });

    storeSession({ accessToken: "a2" });
    otherTab.postMessage({ type: "signout" });
    await vi.waitFor(() => expect(getStoredAccessToken()).toBeNull());
  });

  it("dropping the session locally (a rejected refresh) does not broadcast a sign-out", async () => {
    storeSession({ accessToken: "a1" });
    dropSessionLocally();
    await flush();
    expect(received).toEqual([]);
  });

  it("ignores malformed channel messages", async () => {
    storeSession({ accessToken: "a1" });
    otherTab.postMessage("nope");
    otherTab.postMessage({ type: "token" });
    otherTab.postMessage({ type: "token", accessToken: 42 });
    await flush();
    expect(getStoredAccessToken()).toBe("a1");
  });
});
