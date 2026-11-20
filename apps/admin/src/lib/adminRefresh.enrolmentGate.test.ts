// B-271: the refresh gate. When ADMIN_2FA_ENFORCED is on and the admin has no two-factor, POST /admin/auth/refresh
// answers 401 with body code admin_two_factor_enrolment_required. Every OTHER 401 must keep meaning "signed out".
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { refreshAdminToken, restoreAdminSession } from "./adminRefresh";
import { getAdminAccessToken, initAdminSessionChannel } from "./adminSession";
import { clearAdminTestSession, seedAdminSession } from "../test/session";
import { AdminApiError, adminFetch, installAdminAuthBridge } from "../api/adminClient";

function json(status: number, body: unknown): Response {
  return new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const GATE = { statusCode: 401, message: "Two-factor enrolment is required.", code: "admin_two_factor_enrolment_required" };

beforeEach(() => {
  clearAdminTestSession();
  window.localStorage.clear();
  initAdminSessionChannel();
});
afterEach(() => {
  installAdminAuthBridge(null);
  vi.unstubAllGlobals();
});

describe("refresh outcome for the two-factor gate", () => {
  it("a 401 with the gate's code is enrolment-required", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(401, GATE)));
    await expect(refreshAdminToken(null)).resolves.toBe("enrolment-required");
    expect(getAdminAccessToken()).toBeNull();
  });

  it.each([
    ["no body", undefined],
    ["a different code", { statusCode: 401, message: "Invalid refresh token", code: "something_else" }],
    ["a message only", { statusCode: 401, message: "No refresh cookie" }],
    ["a non-object body", "plain text"],
  ])("a 401 with %s stays a plain sign-out", async (_name, body) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(typeof body === "string" ? body : body ? JSON.stringify(body) : "", { status: 401 })),
    );
    await expect(refreshAdminToken(null)).resolves.toBe("signed-out");
  });

  it("start-up restore reports the gate so the login screen can explain it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(401, GATE)));
    await expect(restoreAdminSession()).resolves.toBe("enrolment-required");
  });
});

describe("adminFetch on the gate", () => {
  it("ends the session and tells the bridge WHY; an ordinary rejected refresh passes no reason", async () => {
    const onAuthLost = vi.fn();
    installAdminAuthBridge({ onAuthLost });
    seedAdminSession("acc-old");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(401, { message: "expired" }))
        .mockResolvedValueOnce(json(401, GATE)),
    );
    await expect(adminFetch("/admin/profile")).rejects.toBeInstanceOf(AdminApiError);
    expect(onAuthLost).toHaveBeenCalledWith("two-factor-enrolment-required");
    expect(getAdminAccessToken()).toBeNull();

    // the same call with an ordinary refresh 401: onAuthLost() with NO argument
    onAuthLost.mockReset();
    seedAdminSession("acc-old-2");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(401, { message: "expired" }))
        .mockResolvedValueOnce(json(401, { message: "Invalid refresh token" })),
    );
    await expect(adminFetch("/admin/profile")).rejects.toBeInstanceOf(AdminApiError);
    expect(onAuthLost).toHaveBeenCalledOnce();
    expect(onAuthLost.mock.calls[0]).toEqual([]);
  });
});
