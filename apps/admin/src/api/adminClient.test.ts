import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AdminApiError, adminFetch, installAdminAuthBridge } from "./adminClient";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("adminClient / adminFetch", () => {
  let tokens: { accessToken: string; refreshToken: string | null };
  const onTokensRotated = vi.fn();
  const onAuthLost = vi.fn();

  beforeEach(() => {
    tokens = { accessToken: "acc-old", refreshToken: "ref-1" };
    onTokensRotated.mockReset();
    onAuthLost.mockReset();
    installAdminAuthBridge({
      getAccessToken: () => tokens.accessToken,
      getRefreshToken: () => tokens.refreshToken,
      onTokensRotated: (t) => {
        tokens = { ...t };
        onTokensRotated(t);
      },
      onAuthLost,
    });
  });

  afterEach(() => {
    installAdminAuthBridge(null);
    vi.unstubAllGlobals();
  });

  it("attaches the bearer token and returns parsed JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await adminFetch<{ ok: boolean }>("/admin/profile");

    expect(result).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer acc-old");
  });

  it("refreshes once on 401 and retries the original request", async () => {
    const fetchMock = vi
      .fn()
      // 1st: original request → 401
      .mockResolvedValueOnce(jsonResponse(401, { message: "expired" }))
      // 2nd: POST /admin/auth/refresh → new pair
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: "acc-new", refreshToken: "ref-2" }))
      // 3rd: retried original → 200
      .mockResolvedValueOnce(jsonResponse(200, { id: "admin-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await adminFetch<{ id: string }>("/admin/profile");

    expect(result).toEqual({ id: "admin-1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toContain("/admin/auth/refresh");
    expect(onTokensRotated).toHaveBeenCalledWith({ accessToken: "acc-new", refreshToken: "ref-2" });
    // retried request carried the rotated token
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer acc-new");
  });

  it("signals onAuthLost when the refresh itself fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: "expired" }))
      .mockResolvedValueOnce(jsonResponse(401, { message: "refresh rejected" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(adminFetch("/admin/profile")).rejects.toBeInstanceOf(AdminApiError);
    expect(onAuthLost).toHaveBeenCalledOnce();
  });

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
