import { afterEach, describe, expect, it, vi } from "vitest";
import { adminLogin, changeAdminPassword } from "./adminAuth";
import { replaceAdminAccessToken, getAdminAccessToken, clearAdminSession } from "../lib/adminSession";

describe("adminLogin", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Founder decision 2026-10-29: the admin session cookie is non-persistent. The API issues a
  // persistent cookie only for `staySignedIn: true`, so the client must never send it.
  it("does not ask for a persistent session (no staySignedIn in the request body)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: "acc", admin: { id: "a1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await adminLogin("admin@example.com", "pw");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as { body: string; credentials: string };
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body).toEqual({ email: "admin@example.com", password: "pw" });
    expect(body.staySignedIn).not.toBe(true);
    expect(init.credentials).toBe("include");
  });
});

// B-310: a password change revokes every session of the account, the caller's own included, so the API answers 200
// with a fresh session for this device. The client must send the cookie-mode header and credentials (so the API can
// read the CURRENT cookie and set the NEW one) and report the fresh access token back to its caller.
describe("changeAdminPassword (B-310)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearAdminSession();
  });

  it("sends cookie mode + credentials and returns the fresh access token", async () => {
    replaceAdminAccessToken("old-access");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: "fresh-access", accessTokenExpiresIn: 900 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await changeAdminPassword("old-pw", "new-password-1");

    expect(result).toEqual({ accessToken: "fresh-access" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string>; credentials: string; body: string };
    expect(init.credentials).toBe("include");
    expect(init.headers["X-Auth-Mode"]).toBe("cookie");
    expect(init.headers["Authorization"]).toBe("Bearer old-access");
    expect(JSON.parse(init.body)).toEqual({ currentPassword: "old-pw", newPassword: "new-password-1" });
  });

  it("returns null for a 204 (the server issued no session: enforced two-factor, none enrolled)", async () => {
    replaceAdminAccessToken("old-access");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(changeAdminPassword("old-pw", "new-password-1")).resolves.toBeNull();
  });

  it("does NOT store a session itself (the caller does)", async () => {
    replaceAdminAccessToken("old-access");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ accessToken: "fresh-access" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await changeAdminPassword("old-pw", "new-password-1");

    expect(getAdminAccessToken()).toBe("old-access");
  });
});
