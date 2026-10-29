import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { refreshAdminToken, restoreAdminSession } from "./adminRefresh";
import { getAdminAccessToken, getAdminSessionChannelName, initAdminSessionChannel } from "./adminSession";
import { clearAdminTestSession, seedAdminSession } from "../test/session";

const API = "http://localhost:3000";
let backend: ReturnType<typeof vi.fn>;

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function refreshCalls() {
  return backend.mock.calls.filter(([u]) => u === `${API}/admin/auth/refresh`);
}

function noStorageHoldsAToken() {
  for (const store of [window.sessionStorage, window.localStorage]) {
    for (let i = 0; i < store.length; i += 1) {
      expect(store.key(i) as string).not.toMatch(/token/i);
    }
  }
  expect(document.cookie).toBe("");
}

beforeEach(() => {
  clearAdminTestSession();
  window.sessionStorage.clear();
  window.localStorage.clear();
  backend = vi.fn();
  vi.stubGlobal("fetch", backend);
  initAdminSessionChannel();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("start-up restore (B-247)", () => {
  it("restores the session with ONE cookie refresh: POST, X-Auth-Mode: cookie, credentials include, no body", async () => {
    backend.mockResolvedValue(json(200, { accessToken: "restored", accessTokenExpiresIn: 900 }));

    await restoreAdminSession();

    expect(getAdminAccessToken()).toBe("restored");
    expect(refreshCalls()).toHaveLength(1);
    const [, init] = refreshCalls()[0];
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("X-Auth-Mode")).toBe("cookie");
    expect(init.credentials).toBe("include");
    expect(init.body).toBeUndefined();
    // The restored token is in memory only.
    noStorageHoldsAToken();
  });

  it.each([401, 403])("a %i with no usable cookie means signed out, not an error", async (status) => {
    backend.mockResolvedValue(json(status, { message: "No refresh cookie" }));

    await expect(restoreAdminSession()).resolves.toBe(status === 401 ? "signed-out" : "forbidden");

    expect(getAdminAccessToken()).toBeNull();
    expect(refreshCalls()).toHaveLength(1);
  });

  it("a server error leaves the page signed out and does not throw", async () => {
    backend.mockResolvedValue(json(503));
    await expect(restoreAdminSession()).resolves.toBe("failed");
    expect(getAdminAccessToken()).toBeNull();
  });

  it("a network failure does not throw either", async () => {
    backend.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(restoreAdminSession()).resolves.toBe("failed");
    expect(getAdminAccessToken()).toBeNull();
  });

  it("is single-flight: React StrictMode's double effect (and any second caller) shares one refresh", async () => {
    let resolve!: (r: Response) => void;
    backend.mockImplementation(() => new Promise<Response>((r) => (resolve = r)));

    const a = restoreAdminSession();
    const b = restoreAdminSession();
    expect(a).toBe(b);
    // (the no-Web-Locks lease fallback polls for a moment before it sends the request)
    await vi.waitFor(() => expect(refreshCalls()).toHaveLength(1));
    resolve(json(200, { accessToken: "once" }));
    await Promise.all([a, b]);
    await restoreAdminSession();

    expect(refreshCalls()).toHaveLength(1);
    expect(getAdminAccessToken()).toBe("once");
  });

  it("removes tokens the old build left in localStorage, without migrating them into a session", async () => {
    window.localStorage.setItem("sn_admin_access_token", "old-a");
    window.localStorage.setItem("sn_admin_refresh_token", "old-r");
    backend.mockResolvedValue(json(401));

    await restoreAdminSession();

    expect(window.localStorage.getItem("sn_admin_access_token")).toBeNull();
    expect(window.localStorage.getItem("sn_admin_refresh_token")).toBeNull();
    expect(getAdminAccessToken()).toBeNull();
    // Nothing was sent to the API from the leftovers.
    for (const [, init] of refreshCalls()) expect(init.body).toBeUndefined();
  });

  it("does not refresh when a session is already held", async () => {
    seedAdminSession("already-signed-in");
    await expect(restoreAdminSession()).resolves.toBe("skipped");
    expect(refreshCalls()).toHaveLength(0);
    expect(getAdminAccessToken()).toBe("already-signed-in");
  });
});

describe("refreshAdminToken", () => {
  it("shares ONE server call between concurrent callers (the cookie rotates on every use)", async () => {
    seedAdminSession("old");
    backend.mockResolvedValue(json(200, { accessToken: "new" }));

    const results = await Promise.all([
      refreshAdminToken("old"),
      refreshAdminToken("old"),
      refreshAdminToken("old"),
    ]);

    expect(results).toEqual(["ok", "ok", "ok"]);
    expect(refreshCalls()).toHaveLength(1);
    expect(getAdminAccessToken()).toBe("new");
  });

  it("does not call the server when the token held now differs from the rejected one (another request already rotated)", async () => {
    seedAdminSession("fresh");
    await expect(refreshAdminToken("stale")).resolves.toBe("ok");
    expect(refreshCalls()).toHaveLength(0);
  });
});

describe("cross-tab lock and the BroadcastChannel hand-off", () => {
  let otherTab: BroadcastChannel;

  beforeEach(() => {
    otherTab = new BroadcastChannel(getAdminSessionChannelName());
  });

  function fakeLocks() {
    // A minimal Web Locks stand-in: serialises tasks per name, like the real API.
    let tail: Promise<unknown> = Promise.resolve();
    const request = vi.fn(<T,>(_name: string, task: () => Promise<T>): Promise<T> => {
      const run = tail.then(task, task);
      tail = run.catch(() => undefined);
      return run;
    });
    return { request };
  }

  afterEach(() => {
    otherTab.close();
    Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
  });

  it("takes the Web Lock around the refresh, under the admin lock name", async () => {
    const locks = fakeLocks();
    Object.defineProperty(navigator, "locks", { value: locks, configurable: true });
    seedAdminSession("old");
    backend.mockResolvedValue(json(200, { accessToken: "new" }));

    await expect(refreshAdminToken("old")).resolves.toBe("ok");

    expect(locks.request).toHaveBeenCalledTimes(1);
    expect(locks.request).toHaveBeenCalledWith("sn-admin-refresh-token-rotation", expect.any(Function));
    expect(refreshCalls()).toHaveLength(1);
  });

  it("hands the new access token to the other tabs after a refresh", async () => {
    const heard = new Promise<unknown>((resolve) => {
      otherTab.onmessage = (event: MessageEvent) => resolve(event.data);
    });
    seedAdminSession("old");
    backend.mockResolvedValue(json(200, { accessToken: "new" }));

    await refreshAdminToken("old");

    expect(await heard).toEqual({ type: "token", accessToken: "new" });
  });

  it("a second tab adopts the rotated token without calling the server", async () => {
    // The lock is held elsewhere until released; meanwhile 'another tab' rotates and broadcasts.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const request = vi.fn(async <T,>(_n: string, task: () => Promise<T>): Promise<T> => {
      await held;
      return task();
    });
    Object.defineProperty(navigator, "locks", { value: { request }, configurable: true });
    seedAdminSession("old");

    const pending = refreshAdminToken("old");
    await vi.waitFor(() => expect(request).toHaveBeenCalled());
    otherTab.postMessage({ type: "token", accessToken: "new" }); // the other tab rotated
    await vi.waitFor(() => expect(getAdminAccessToken()).toBe("new"));
    release();

    await expect(pending).resolves.toBe("ok");
    expect(refreshCalls()).toHaveLength(0);
  });

  it("a restoring tab that is handed a token by the tab holding the lock does not call the server", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const request = vi.fn(async <T,>(_n: string, task: () => Promise<T>): Promise<T> => {
      await held;
      return task();
    });
    Object.defineProperty(navigator, "locks", { value: { request }, configurable: true });
    backend.mockResolvedValue(json(401));

    const restoring = restoreAdminSession();
    await vi.waitFor(() => expect(request).toHaveBeenCalled());
    otherTab.postMessage({ type: "token", accessToken: "handed-over" });
    await vi.waitFor(() => expect(getAdminAccessToken()).toBe("handed-over"));
    release();
    await restoring;

    expect(refreshCalls()).toHaveLength(0);
    expect(getAdminAccessToken()).toBe("handed-over");
  });

  it("falls back to a localStorage lease where the Web Locks API is missing, and waits out a live lease", async () => {
    expect(navigator.locks).toBeUndefined();
    seedAdminSession("old");
    // Another tab holds the lease for a moment, then rotates, broadcasts and releases.
    window.localStorage.setItem(
      "sn_admin_refresh_lock",
      JSON.stringify({ owner: "other-tab", until: Date.now() + 5_000 }),
    );
    setTimeout(() => {
      otherTab.postMessage({ type: "token", accessToken: "new" });
      window.localStorage.removeItem("sn_admin_refresh_lock");
    }, 120);

    await expect(refreshAdminToken("old")).resolves.toBe("ok");

    expect(refreshCalls()).toHaveLength(0);
    expect(window.localStorage.getItem("sn_admin_refresh_lock")).toBeNull();
    // The lease holds no token.
    expect(window.localStorage.getItem("sn_admin_access_token")).toBeNull();
  });

  it("a lease left by a dead tab does not block the refresh", async () => {
    seedAdminSession("old");
    window.localStorage.setItem(
      "sn_admin_refresh_lock",
      JSON.stringify({ owner: "dead-tab", until: Date.now() - 1 }),
    );
    backend.mockResolvedValue(json(200, { accessToken: "new" }));

    await expect(refreshAdminToken("old")).resolves.toBe("ok");

    expect(refreshCalls()).toHaveLength(1);
    expect(window.localStorage.getItem("sn_admin_refresh_lock")).toBeNull();
  });
});
