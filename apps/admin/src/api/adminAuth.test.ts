import { afterEach, describe, expect, it, vi } from "vitest";
import { adminLogin } from "./adminAuth";

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
