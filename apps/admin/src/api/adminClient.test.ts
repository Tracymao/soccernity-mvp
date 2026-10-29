import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AdminApiError, adminFetch, installAdminAuthBridge } from "./adminClient";
import { getAdminAccessToken, initAdminSessionChannel } from "../lib/adminSession";
import { clearAdminTestSession, seedAdminSession } from "../test/session";

const API = "http://localhost:3000";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("adminClient / adminFetch", () => {
  const onAuthLost = vi.fn();

  beforeEach(() => {
    clearAdminTestSession();
    window.localStorage.clear();
    initAdminSessionChannel();
    seedAdminSession("acc-old");
    onAuthLost.mockReset();
    installAdminAuthBridge({ onAuthLost });
  });

  afterEach(() => {
    installAdminAuthBridge(null);
    vi.unstubAllGlobals();
  });

  function refreshCalls(fetchMock: { mock: { calls: unknown[][] } }) {
    return fetchMock.mock.calls.filter(([u]) => u === `${API}/admin/auth/refresh`);
  }

  it("attaches the in-memory bearer token and returns parsed JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await adminFetch<{ ok: boolean }>("/admin/profile");

    expect(result).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer acc-old");
    // Ordinary calls authenticate with the header alone: no cookie credentials.
    expect(init.credentials).toBeUndefined();
  });

  it("refreshes once on 401 through the cookie and replays the original request with the new token", async () => {
    const fetchMock = vi
      .fn()
      // 1st: original request → 401
      .mockResolvedValueOnce(jsonResponse(401, { message: "expired" }))
      // 2nd: POST /admin/auth/refresh → new access token (the refresh token stays in the cookie)
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: "acc-new" }))
      // 3rd: replayed original → 200
      .mockResolvedValueOnce(jsonResponse(200, { id: "admin-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await adminFetch<{ id: string }>("/admin/profile");

    expect(result).toEqual({ id: "admin-1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(`${API}/admin/auth/refresh`);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("X-Auth-Mode")).toBe("cookie");
    expect(init.body).toBeUndefined();
    expect(getAdminAccessToken()).toBe("acc-new");
    // the replay carried the rotated token
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer acc-new");
  });

  it("several concurrent 401s cause exactly one refresh, and each request is replayed once", async () => {
    const fetchMock = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      if (url === `${API}/admin/auth/refresh`) return jsonResponse(200, { accessToken: "acc-new" });
      return init?.headers?.Authorization === "Bearer acc-new"
        ? jsonResponse(200, { ok: true })
        : jsonResponse(401, { message: "expired" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await Promise.all([
      adminFetch("/admin/a"),
      adminFetch("/admin/b"),
      adminFetch("/admin/c"),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refreshCalls(fetchMock)).toHaveLength(1);
    // 3 originals + 1 refresh + 3 replays, no more
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it("replays at most once: a second 401 after the refresh is surfaced, not retried again", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === `${API}/admin/auth/refresh`
        ? jsonResponse(200, { accessToken: "acc-new" })
        : jsonResponse(401, { message: "still no" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(adminFetch("/admin/profile")).rejects.toBeInstanceOf(AdminApiError);

    expect(refreshCalls(fetchMock)).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([u]) => u === `${API}/admin/profile`)).toHaveLength(2);
  });

  it("drops the in-memory session and signals onAuthLost when the refresh is rejected", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: "expired" }))
      .mockResolvedValueOnce(jsonResponse(401, { message: "refresh rejected" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(adminFetch("/admin/profile")).rejects.toBeInstanceOf(AdminApiError);

    expect(onAuthLost).toHaveBeenCalledOnce();
    expect(getAdminAccessToken()).toBeNull();
  });

  it.each([403, 503])(
    "leaves the session alone when the refresh answers %i (a configuration or transient error is not a sign-out)",
    async (status) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(401, { message: "expired" }))
        .mockResolvedValueOnce(jsonResponse(status, { message: "nope" }));
      vi.stubGlobal("fetch", fetchMock);

      await expect(adminFetch("/admin/profile")).rejects.toBeInstanceOf(AdminApiError);

      expect(onAuthLost).not.toHaveBeenCalled();
      expect(getAdminAccessToken()).toBe("acc-old");
    },
  );

  it("does not attempt a refresh for auth:false calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { message: "nope" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(adminFetch("/admin/auth/login", { auth: false, body: {} })).rejects.toBeInstanceOf(
      AdminApiError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onAuthLost).not.toHaveBeenCalled();
  });
});
