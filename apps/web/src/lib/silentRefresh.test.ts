import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { installSilentRefresh } from "./silentRefresh";
import { getStoredAccessToken, getStoredRefreshToken, storeSession } from "./session";

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

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  backend = vi.fn();
  window.fetch = backend as unknown as typeof fetch;
  installSilentRefresh();
});

afterEach(() => {
  window.fetch = realFetch;
});

describe("silent refresh (B-017)", () => {
  it("on a 401 rotates the session once and replays the request with the new token", async () => {
    storeSession({ accessToken: "old", refreshToken: "r1" }, false);
    backend.mockImplementation(async (url: string, init?: FetchInit) => {
      if (url === `${API}/auth/refresh`) {
        return json(200, { accessToken: "new", refreshToken: "r2" });
      }
      return auth(init) === "Bearer new" ? json(200, { ok: true }) : json(401);
    });

    const response = await window.fetch(`${API}/posts/feed`, { headers: { Authorization: "Bearer old" } });

    expect(response.status).toBe(200);
    expect(getStoredAccessToken()).toBe("new");
    expect(getStoredRefreshToken()).toBe("r2");
    expect(refreshCalls()).toHaveLength(1);
    expect(JSON.parse(refreshCalls()[0][1].body)).toEqual({ refreshToken: "r1" });
  });

  it("shares ONE rotation between parallel 401s (refresh tokens are single-use)", async () => {
    storeSession({ accessToken: "old", refreshToken: "r1" }, false);
    backend.mockImplementation(async (url: string, init?: FetchInit) => {
      if (url === `${API}/auth/refresh`) return json(200, { accessToken: "new", refreshToken: "r2" });
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

  it("clears the session and returns the 401 when the refresh is rejected", async () => {
    storeSession({ accessToken: "old", refreshToken: "dead" }, false);
    backend.mockResolvedValue(json(401));

    const response = await window.fetch(`${API}/posts/feed`, { headers: { Authorization: "Bearer old" } });

    expect(response.status).toBe(401);
    expect(getStoredAccessToken()).toBeNull();
    expect(getStoredRefreshToken()).toBeNull();
  });

  it("keeps the session on a transient refresh failure (5xx)", async () => {
    storeSession({ accessToken: "old", refreshToken: "r1" }, false);
    backend.mockImplementation(async (url: string) => (url === `${API}/auth/refresh` ? json(503) : json(401)));

    const response = await window.fetch(`${API}/posts/feed`, { headers: { Authorization: "Bearer old" } });

    expect(response.status).toBe(401);
    expect(getStoredRefreshToken()).toBe("r1");
  });

  it("does not refresh for login / logout, for requests without a bearer token, or for other hosts", async () => {
    storeSession({ accessToken: "old", refreshToken: "r1" }, false);
    backend.mockResolvedValue(json(401));

    await window.fetch(`${API}/auth/login`, { method: "POST", headers: { Authorization: "Bearer old" } });
    await window.fetch(`${API}/auth/logout`, { method: "POST" });
    await window.fetch(`${API}/clubs`);
    await window.fetch("https://elsewhere.example/x", { headers: { Authorization: "Bearer old" } });

    expect(refreshCalls()).toHaveLength(0);
    expect(getStoredRefreshToken()).toBe("r1");
  });

  it("replays with the stored token, without rotating again, when another request already refreshed", async () => {
    storeSession({ accessToken: "fresh", refreshToken: "r2" }, false);
    backend.mockImplementation(async (_url: string, init?: FetchInit) =>
      auth(init) === "Bearer fresh" ? json(200) : json(401),
    );

    const response = await window.fetch(`${API}/posts/feed`, { headers: { Authorization: "Bearer stale" } });

    expect(response.status).toBe(200);
    expect(refreshCalls()).toHaveLength(0);
  });
});
