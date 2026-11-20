// api/emailChange.ts: the request shapes and the codes read from the body.
import { describe, it, expect, vi, afterEach } from "vitest";
import { EmailChangeApiError, confirmEmailChange, requestEmailChange } from "./emailChange";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fn = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}), ...response });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("requestEmailChange", () => {
  it("POSTs the three inputs with the bearer token", async () => {
    const fetchFn = stubFetch({ ok: true, status: 202 });
    await requestEmailChange("tok", { password: "p", newEmail: "a@b.co", twoFactorCode: "123456" });
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toMatch(/\/users\/me\/email-change$/);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({ password: "p", newEmail: "a@b.co", twoFactorCode: "123456" });
  });

  it("carries the status and the body code of a refusal", async () => {
    stubFetch({ status: 403, json: async () => ({ code: "wrong_password", message: "anything" }) });
    await expect(requestEmailChange("tok", { password: "p", newEmail: "a@b.co" })).rejects.toMatchObject({
      status: 403,
      code: "wrong_password",
    });
  });

  it("tolerates a body that is not JSON", async () => {
    stubFetch({
      status: 429,
      json: async () => {
        throw new Error("no json");
      },
    });
    await expect(requestEmailChange("tok", { password: "p", newEmail: "a@b.co" })).rejects.toMatchObject({
      status: 429,
      code: undefined,
    });
  });

  it("turns a network failure into an error with no status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const error = await requestEmailChange("tok", { password: "p", newEmail: "a@b.co" }).catch((e) => e);
    expect(error).toBeInstanceOf(EmailChangeApiError);
    expect(error.status).toBeUndefined();
  });
});

describe("confirmEmailChange", () => {
  it("POSTs the token with no Authorization header", async () => {
    const fetchFn = stubFetch({ ok: true, status: 204 });
    await confirmEmailChange("secret");
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toMatch(/\/auth\/email-change\/confirm$/);
    expect(JSON.parse(init.body)).toEqual({ token: "secret" });
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("carries the invalid-link code", async () => {
    stubFetch({ status: 400, json: async () => ({ code: "email_change_link_invalid" }) });
    await expect(confirmEmailChange("x")).rejects.toMatchObject({ status: 400, code: "email_change_link_invalid" });
  });
});
