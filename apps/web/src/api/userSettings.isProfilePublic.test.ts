// The Public profile field of the settings client (B-060). The older userSettings.test.ts is unchanged.
import { describe, it, expect, vi, afterEach } from "vitest";
import { updateUserSettings } from "./userSettings";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(response: Partial<Response>) {
  const fn = vi.fn(async () => response as Response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("userSettings client, isProfilePublic", () => {
  it("PATCHes isProfilePublic on its own and returns the saved effective settings", async () => {
    const fn = stubFetch({
      ok: true,
      json: async () => ({ dmPermission: "everyone", mediaSensitive: false, readReceipts: true, isProfilePublic: false }),
    });
    await expect(updateUserSettings("tok", { isProfilePublic: false })).resolves.toMatchObject({
      isProfilePublic: false,
    });
    const [, init] = fn.mock.calls[0] as unknown as [string, { method?: string; body?: string }];
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ isProfilePublic: false }));
  });

  it("an under-18 account's refused PATCH is a 403 the client reports with its status", async () => {
    stubFetch({ ok: false, status: 403 });
    await expect(updateUserSettings("tok", { isProfilePublic: false })).rejects.toMatchObject({ status: 403 });
  });
});
