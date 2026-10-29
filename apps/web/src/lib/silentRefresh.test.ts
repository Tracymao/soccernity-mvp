import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { installSilentRefresh, restoreSession } from "./silentRefresh";
import { getSessionChannelName, getStoredAccessToken, initSessionChannel } from "./session";
import { clearSession, seedSession } from "../test/session";

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;
const API = "http://localhost:3000";
const realFetch = window.fetch;
let backend: ReturnType<typeof vi.fn>;

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function auth(init?: FetchInit): string | null {
  return new Headers(init?.headers).get("Authorization");
}

function refreshCalls() {
  return backend.mock.calls.filter(([u]) => u === `${API}/auth/refresh`);
}

function noStorageHoldsAToken() {
  for (const store of [window.sessionStorage, window.localStorage]) {
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i) as string;
      expect(key).not.toMatch(/token/i);
    }
  }
  expect(document.cookie).toBe("");
}

beforeEach(() => {
  clearSession();
  window.sessionStorage.clear();
  window.localStorage.clear();
  backend = vi.fn();
  window.fetch = backend as unknown as typeof fetch;
  installSilentRefresh();
  initSessionChannel();
});

afterEach(() => {
  window.fetch = realFetch;
});

describe("start-up restore (B-246)", () => {
  it("restores the session with ONE cookie refresh: POST, X-Auth-Mode: cookie, credentials include, no body", async () => {
    backend.mockResolvedValue(json(200, { accessToken: "restored", accessTokenExpiresIn: 900 }));

    await restoreSession();

    expect(getStoredAccessToken()).toBe("restored");
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

    await expect(restoreSession()).resolves.toBeUndefined();

    expect(getStoredAccessToken()).toBeNull();
    expect(refreshCalls()).toHaveLength(1);
  });

  it("a server error or a network failure leaves the page signed out and does not throw", async () => {
    backend.mockResolvedValue(json(503));
    await expect(restoreSession()).resolves.toBeUndefined();
    expect(getStoredAccessToken()).toBeNull();
  });

  it("a network failure does not throw either", async () => {
    backend.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(restoreSession()).resolves.toBeUndefined();
    expect(getStoredAccessToken()).toBeNull();
  });

  it("is single-flight: React StrictMode's double effect (and any second caller) shares one refresh", async () => {
    let resolve!: (r: Response) => void;
    backend.mockImplementation(() => new Promise<Response>((r) => (resolve = r)));

    const a = restoreSession();
    const b = restoreSession();
    expect(a).toBe(b);
    // (the no-Web-Locks lease fallback polls for a moment before it sends the request)
    await vi.waitFor(() => expect(refreshCalls()).toHaveLength(1));
    resolve(json(200, { accessToken: "once" }));
    await Promise.all([a, b]);
    await restoreSession();

    expect(refreshCalls()).toHaveLength(1);
    expect(getStoredAccessToken()).toBe("once");
  });

  it("removes tokens the old build left in browser storage, without migrating them into a session", async () => {
    window.sessionStorage.setItem("sn_access_token", "old-a");
    window.localStorage.setItem("sn_refresh_token", "old-r");
    backend.mockResolvedValue(json(401));

    await restoreSession();

    expect(window.sessionStorage.getItem("sn_access_token")).toBeNull();
    expect(window.localStorage.getItem("sn_refresh_token")).toBeNull();
    expect(getStoredAccessToken()).toBeNull();
    // Nothing was sent to the API from the leftovers.
    for (const [, init] of refreshCalls()) expect(init.body).toBeUndefined();
  });

  it("does not refresh when a session is already held", async () => {
    seedSession("already-signed-in");
    await restoreSession();
    expect(refreshCalls()).toHaveLength(0);
    expect(getStoredAccessToken()).toBe("already-signed-in");
  });
});

describe("silent refresh (B-017, on the cookie session)", () => {
  it("on a 401 refreshes once through the cookie and replays the request with the new token", async () => {
    seedSession("old");
    backend.mockImplementation(async (url: string, init?: FetchInit) => {
      if (url === `${API}/auth/refresh`) return json(200, { accessToken: "new" });
      return auth(init) === "Bearer new" ? json(200, { ok: true }) : json(401);
    });

    const response = await window.fetch(`${API}/posts/feed`, { headers: { Authorization: "Bearer old" } });

    expect(response.status).toBe(200);
    expect(getStoredAccessToken()).toBe("new");
    expect(refreshCalls()).toHaveLength(1);
    const [, init] = refreshCalls()[0];
    expect(new Headers(init.headers).get("X-Auth-Mode")).toBe("cookie");
    expect(init.credentials).toBe("include");
    expect(init.body).toBeUndefined();
    // The refresh request carries no Authorization header and no token in the body.
    expect(new Headers(init.headers).get("Authorization")).toBeNull();
    noStorageHoldsAToken();
  });

  it("shares ONE refresh between parallel 401s (the cookie rotates on every use)", async () => {
    seedSession("old");
    backend.mockImplementation(async (url: string, init?: FetchInit) => {
      if (url === `${API}/auth/refresh`) return json(200, { accessToken: "new" });
      return auth(init) === "Bearer new" ? json(200) : json(401);
    });

    const calls = await Promise.all([
      window.fetch(`${API}/a`, { headers: { Authorization: "Bearer old" } }),
      window.fetch(`${API}/b`, { headers: { Authorization: "Bearer old" } }),
      window.fetch(`${API}/c`, { headers: { Authorization: "Bearer old" } }),
    ]);

    expect(calls.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshCalls()).toHaveLength(1);
  });

  it("replays a request at most once: a second 401 after the refresh is returned, not retried again", async () => {
    seedSession("old");
    backend.mockImplementation(async (url: string) =>
      url === `${API}/auth/refresh` ? json(200, { accessToken: "new" }) : json(401),
    );

    const response = await window.fetch(`${API}/posts/feed`, { headers: { Authorization: "Bearer old" } });

    expect(response.status).toBe(401);
    expect(refreshCalls()).toHaveLength(1);
    // original + one replay
    expect(backend.mock.calls.filter(([u]) => u === `${API}/posts/feed`)).toHaveLength(2);
  });

  it("drops the in-memory session and returns the 401 when the refresh is rejected (401)", async () => {
    seedSession("old");
    backend.mockResolvedValue(json(401));

    const response = await window.fetch(`${API}/posts/feed`, { headers: { Authorization: "Bearer old" } });

    expect(response.status).toBe(401);
    expect(getStoredAccessToken()).toBeNull();
  });

  it("keeps the session on a 403 (an Origin / configuration problem is not a sign-out) and on a 5xx", async () => {
    for (const status of [403, 503]) {
      seedSession("old");
      backend.mockReset();
      backend.mockImplementation(async (url: string) => (url === `${API}/auth/refresh` ? json(status) : json(401)));

      const response = await window.fetch(`${API}/posts/feed`, { headers: { Authorization: "Bearer old" } });

      expect(response.status).toBe(401);
      expect(getStoredAccessToken()).toBe("old");
    }
  });

  it("does not refresh for login / logout / register, for requests without a bearer token, or for other hosts", async () => {
    seedSession("old");
    backend.mockResolvedValue(json(401));

    await window.fetch(`${API}/auth/login`, { method: "POST", headers: { Authorization: "Bearer old" } });
    await window.fetch(`${API}/auth/logout`, { method: "POST" });
    await window.fetch(`${API}/clubs`);
    await window.fetch("https://elsewhere.example/x", { headers: { Authorization: "Bearer old" } });

    expect(refreshCalls()).toHaveLength(0);
    expect(getStoredAccessToken()).toBe("old");
  });

  it("replays with the held token, without refreshing again, when another request already refreshed", async () => {
    seedSession("fresh");
    backend.mockImplementation(async (_url: string, init?: FetchInit) =>
      auth(init) === "Bearer fresh" ? json(200) : json(401),
    );

    const response = await window.fetch(`${API}/posts/feed`, { headers: { Authorization: "Bearer stale" } });

    expect(response.status).toBe(200);
    expect(refreshCalls()).toHaveLength(0);
  });

  describe("cross-tab lock (B-164) and the BroadcastChannel hand-off", () => {
    let otherTab: BroadcastChannel;

    beforeEach(() => {
      otherTab = new BroadcastChannel(getSessionChannelName());
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

    it("takes the Web Lock around the refresh", async () => {
      const locks = fakeLocks();
      Object.defineProperty(navigator, "locks", { value: locks, configurable: true });
      seedSession("old");
      backend.mockImplementation(async (url: string, init?: FetchInit) => {
        if (url === `${API}/auth/refresh`) return json(200, { accessToken: "new" });
        return auth(init) === "Bearer new" ? json(200) : json(401);
      });

      const response = await window.fetch(`${API}/a`, { headers: { Authorization: "Bearer old" } });

      expect(response.status).toBe(200);
      expect(locks.request).toHaveBeenCalledTimes(1);
      expect(locks.request).toHaveBeenCalledWith("sn-refresh-token-rotation", expect.any(Function));
      expect(refreshCalls()).toHaveLength(1);
    });

    it("the start-up restore also takes the lock", async () => {
      const locks = fakeLocks();
      Object.defineProperty(navigator, "locks", { value: locks, configurable: true });
      backend.mockResolvedValue(json(200, { accessToken: "restored" }));

      await restoreSession();

      expect(locks.request).toHaveBeenCalledTimes(1);
      expect(getStoredAccessToken()).toBe("restored");
    });

    it("hands the new access token to the other tabs after a refresh", async () => {
      const heard = new Promise<unknown>((resolve) => {
        otherTab.onmessage = (event: MessageEvent) => resolve(event.data);
      });
      seedSession("old");
      backend.mockImplementation(async (url: string, init?: FetchInit) => {
        if (url === `${API}/auth/refresh`) return json(200, { accessToken: "new" });
        return auth(init) === "Bearer new" ? json(200) : json(401);
      });

      await window.fetch(`${API}/a`, { headers: { Authorization: "Bearer old" } });

      expect(await heard).toEqual({ type: "token", accessToken: "new" });
    });

    it("does not call the server when another tab rotated and broadcast the token while this one waited for the lock", async () => {
      // The lock is held elsewhere until released; meanwhile 'another tab' rotates and broadcasts.
      let release!: () => void;
      const held = new Promise<void>((r) => (release = r));
      const request = vi.fn(async <T,>(_n: string, task: () => Promise<T>): Promise<T> => {
        await held;
        return task();
      });
      Object.defineProperty(navigator, "locks", { value: { request }, configurable: true });
      seedSession("old");
      backend.mockImplementation(async (_url: string, init?: FetchInit) =>
        auth(init) === "Bearer new" ? json(200) : json(401),
      );

      const pending = window.fetch(`${API}/feed`, { headers: { Authorization: "Bearer old" } });
      await vi.waitFor(() => expect(request).toHaveBeenCalled());
      otherTab.postMessage({ type: "token", accessToken: "new" }); // the other tab rotated
      await vi.waitFor(() => expect(getStoredAccessToken()).toBe("new"));
      release();

      expect((await pending).status).toBe(200);
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

      const restoring = restoreSession();
      await vi.waitFor(() => expect(request).toHaveBeenCalled());
      otherTab.postMessage({ type: "token", accessToken: "handed-over" });
      await vi.waitFor(() => expect(getStoredAccessToken()).toBe("handed-over"));
      release();
      await restoring;

      expect(refreshCalls()).toHaveLength(0);
      expect(getStoredAccessToken()).toBe("handed-over");
    });

    it("falls back to a localStorage lease where the Web Locks API is missing, and waits out a live lease", async () => {
      expect(navigator.locks).toBeUndefined();
      seedSession("old");
      // Another tab holds the lease for a moment, then rotates, broadcasts and releases.
      window.localStorage.setItem("sn_refresh_lock", JSON.stringify({ owner: "other-tab", until: Date.now() + 5_000 }));
      setTimeout(() => {
        otherTab.postMessage({ type: "token", accessToken: "new" });
        window.localStorage.removeItem("sn_refresh_lock");
      }, 120);
      backend.mockImplementation(async (_url: string, init?: FetchInit) =>
        auth(init) === "Bearer new" ? json(200) : json(401),
      );

      const response = await window.fetch(`${API}/feed`, { headers: { Authorization: "Bearer old" } });

      expect(response.status).toBe(200);
      expect(refreshCalls()).toHaveLength(0);
      expect(window.localStorage.getItem("sn_refresh_lock")).toBeNull();
      // The lease holds no token.
      expect(window.localStorage.getItem("sn_access_token")).toBeNull();
    });

    it("a lease left by a dead tab does not block the refresh", async () => {
      seedSession("old");
      window.localStorage.setItem("sn_refresh_lock", JSON.stringify({ owner: "dead-tab", until: Date.now() - 1 }));
      backend.mockImplementation(async (url: string, init?: FetchInit) => {
        if (url === `${API}/auth/refresh`) return json(200, { accessToken: "new" });
        return auth(init) === "Bearer new" ? json(200) : json(401);
      });

      const response = await window.fetch(`${API}/feed`, { headers: { Authorization: "Bearer old" } });

      expect(response.status).toBe(200);
      expect(refreshCalls()).toHaveLength(1);
      expect(window.localStorage.getItem("sn_refresh_lock")).toBeNull();
    });
  });
});
