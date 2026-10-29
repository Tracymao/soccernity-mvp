import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { login, logoutSession, reactivateAccount, registerUser } from "./auth";
import type { RegisterRequest } from "./auth";
import { restoreSession } from "../lib/silentRefresh";

// B-246: every call to the five cookie routes (login, register, refresh,
// reactivate-account, logout) sends `X-Auth-Mode: cookie` and
// `credentials: "include"`, so the API sets / reads / clears the httpOnly
// refresh cookie and the browser sends it across the web and API origins.
const API = "http://localhost:3000";
const realFetch = window.fetch;
let backend: ReturnType<typeof vi.fn>;

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function lastCall(path: string) {
  const call = backend.mock.calls.filter(([u]) => u === `${API}${path}`).at(-1);
  expect(call, `a request to ${path}`).toBeDefined();
  const [, init] = call as [string, NonNullable<Parameters<typeof fetch>[1]>];
  return { init, headers: new Headers(init.headers) };
}

beforeEach(() => {
  backend = vi.fn();
  window.fetch = backend as unknown as typeof fetch;
});

afterEach(() => {
  window.fetch = realFetch;
});

describe("the five cookie routes (B-246)", () => {
  it("login: cookie mode, credentials include, and 'Stay signed in' is sent", async () => {
    backend.mockResolvedValue(ok({ accessToken: "a", accessTokenExpiresIn: 900, refreshTokenExpiresAt: "x", user: {} }));

    await login({ email: "a@b.co", password: "pw", staySignedIn: true });

    const { init, headers } = lastCall("/auth/login");
    expect(headers.get("X-Auth-Mode")).toBe("cookie");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({ email: "a@b.co", password: "pw", staySignedIn: true });
  });

  it("login without the control ticked sends staySignedIn: false (a session cookie)", async () => {
    backend.mockResolvedValue(ok({ accessToken: "a", accessTokenExpiresIn: 900, refreshTokenExpiresAt: "x", user: {} }));

    await login({ email: "a@b.co", password: "pw", staySignedIn: false });

    expect(JSON.parse(lastCall("/auth/login").init.body as string).staySignedIn).toBe(false);
  });

  it("register: cookie mode and credentials include", async () => {
    backend.mockResolvedValue(ok({ accessToken: "a", accessTokenExpiresIn: 900, refreshTokenExpiresAt: "x", user: {}, guardian: null }));

    await registerUser({ email: "a@b.co", password: "pw" } as unknown as RegisterRequest);

    const { init, headers } = lastCall("/auth/register");
    expect(headers.get("X-Auth-Mode")).toBe("cookie");
    expect(init.credentials).toBe("include");
  });

  it("reactivate-account: cookie mode and credentials include", async () => {
    backend.mockResolvedValue(ok({ accessToken: "a", accessTokenExpiresIn: 900, refreshTokenExpiresAt: "x", user: {} }));

    await reactivateAccount("a@b.co", "pw");

    const { init, headers } = lastCall("/auth/reactivate-account");
    expect(headers.get("X-Auth-Mode")).toBe("cookie");
    expect(init.credentials).toBe("include");
  });

  it("refresh (the start-up restore): cookie mode, credentials include, no body", async () => {
    backend.mockResolvedValue(ok({ accessToken: "a" }));

    await restoreSession();

    const { init, headers } = lastCall("/auth/refresh");
    expect(headers.get("X-Auth-Mode")).toBe("cookie");
    expect(init.credentials).toBe("include");
    expect(init.body).toBeUndefined();
  });

  it("logout: cookie mode, credentials include, no body and no token from script", async () => {
    backend.mockResolvedValue(new Response(null, { status: 204 }));

    await logoutSession();

    const { init, headers } = lastCall("/auth/logout");
    expect(headers.get("X-Auth-Mode")).toBe("cookie");
    expect(init.credentials).toBe("include");
    expect(init.body).toBeUndefined();
    expect(headers.get("Authorization")).toBeNull();
  });

  it("logout never throws, even when the network is down", async () => {
    backend.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(logoutSession()).resolves.toBeUndefined();
  });
});
