import { describe, it, expect, vi, afterEach } from "vitest";
import { getUserSettings, updateUserSettings, UserSettingsApiError } from "./userSettings";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(response: Partial<Response> | Error) {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("userSettings client", () => {
  it("GETs /users/me/settings with the bearer token", async () => {
    const fn = stubFetch({ ok: true, json: async () => ({ dmPermission: "none", mediaSensitive: true }) });
    await expect(getUserSettings("tok")).resolves.toEqual({ dmPermission: "none", mediaSensitive: true });
    const [url, init] = fn.mock.calls[0] as unknown as [string, { method?: string; body?: string; headers: unknown }];
    expect(url).toMatch(/\/users\/me\/settings$/);
    expect(init.method).toBeUndefined();
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("PATCHes only the fields it is given, as JSON", async () => {
    const fn = stubFetch({ ok: true, json: async () => ({ dmPermission: "everyone", mediaSensitive: true }) });
    await updateUserSettings("tok", { mediaSensitive: true });
    const [, init] = fn.mock.calls[0] as unknown as [string, { method?: string; body?: string; headers: unknown }];
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ mediaSensitive: true }));
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("throws with the status on a non-OK answer", async () => {
    stubFetch({ ok: false, status: 400 });
    await expect(updateUserSettings("tok", { dmPermission: "none" })).rejects.toMatchObject({
      name: "UserSettingsApiError",
      status: 400,
    });
  });

  it("throws a plain error when the server cannot be reached", async () => {
    stubFetch(new TypeError("fetch failed"));
    await expect(getUserSettings("tok")).rejects.toBeInstanceOf(UserSettingsApiError);
  });
});
