// B-085: the social sign-in client. Errors are told apart by the server's `code`; the providers call never throws.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  SOCIAL_AUTH_FAILED,
  completeSocialCallback,
  getEnabledSocialProviders,
  registerSocial,
  requestSocialEmailCode,
  startSocialSignIn,
  verifySocialEmailCode,
} from "./socialAuth";
import { AuthApiError } from "./auth";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("getEnabledSocialProviders", () => {
  it("returns the enabled providers", async () => {
    fetchMock.mockResolvedValue(json(200, { providers: ["google", "facebook"] }));
    expect(await getEnabledSocialProviders()).toEqual(["google", "facebook"]);
  });

  it("never returns Apple or anything it does not know", async () => {
    fetchMock.mockResolvedValue(json(200, { providers: ["apple", "google", "twitter", 3] }));
    expect(await getEnabledSocialProviders()).toEqual(["google"]);
  });

  it("returns none on an empty list, a bad status, a bad body or a network failure", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { providers: [] }));
    expect(await getEnabledSocialProviders()).toEqual([]);
    fetchMock.mockResolvedValueOnce(json(500, {}));
    expect(await getEnabledSocialProviders()).toEqual([]);
    fetchMock.mockResolvedValueOnce(json(200, { providers: "google" }));
    expect(await getEnabledSocialProviders()).toEqual([]);
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await getEnabledSocialProviders()).toEqual([]);
  });
});

describe("startSocialSignIn", () => {
  it("posts the Stay signed in choice and returns the authorisation URL", async () => {
    fetchMock.mockResolvedValue(json(200, { authorizationUrl: "https://provider.example/auth?state=abc" }));
    await expect(startSocialSignIn("google", true)).resolves.toEqual({
      authorizationUrl: "https://provider.example/auth?state=abc",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toMatch(/\/auth\/social\/google\/start$/);
    expect(JSON.parse(init.body as string)).toEqual({ staySignedIn: true });
  });

  it("carries the server's code on a refusal", async () => {
    fetchMock.mockResolvedValue(json(404, { code: "social_provider_unavailable", message: "x" }));
    await expect(startSocialSignIn("facebook", false)).rejects.toMatchObject({
      status: 404,
      code: "social_provider_unavailable",
    });
  });
});

describe("completeSocialCallback", () => {
  it("uses cookie mode (header and credentials) and maps a signed-in answer without the status field", async () => {
    fetchMock.mockResolvedValue(json(200, { status: "signed_in", accessToken: "acc", user: { nextStep: "none" } }));
    const result = await completeSocialCallback("google", "c", "s");
    expect(result).toEqual({
      status: "signed_in",
      response: { accessToken: "acc", user: { nextStep: "none" } },
    });
    const init = fetchMock.mock.calls[0][1] as { credentials?: string; headers: Record<string, string>; body: string };
    expect(init.credentials).toBe("include");
    expect((init.headers as Record<string, string>)["X-Auth-Mode"]).toBe("cookie");
    expect(JSON.parse(init.body as string)).toEqual({ code: "c", state: "s" });
  });

  it("maps a two-factor challenge", async () => {
    fetchMock.mockResolvedValue(
      json(200, { status: "two_factor_required", twoFactorRequired: true, challengeToken: "ct" }),
    );
    const result = await completeSocialCallback("facebook", "c", "s");
    expect(result).toEqual({
      status: "two_factor_required",
      challenge: { twoFactorRequired: true, challengeToken: "ct" },
    });
  });

  it("maps registration_required with the token and profile", async () => {
    const profile = { displayName: "Jane Doe", email: null, emailVerified: false, needsEmail: true };
    fetchMock.mockResolvedValue(json(200, { status: "registration_required", socialRegistrationToken: "rt", profile }));
    expect(await completeSocialCallback("facebook", "c", "s")).toEqual({
      status: "registration_required",
      socialRegistrationToken: "rt",
      profile,
    });
  });

  it("throws with the server's code when the provider did not confirm", async () => {
    fetchMock.mockResolvedValue(json(401, { code: SOCIAL_AUTH_FAILED, message: "no" }));
    await expect(completeSocialCallback("google", "c", "s")).rejects.toMatchObject({ status: 401, code: SOCIAL_AUTH_FAILED });
  });

  it("reports a network failure as an AuthApiError", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(completeSocialCallback("google", "c", "s")).rejects.toBeInstanceOf(AuthApiError);
  });
});

describe("email code and register", () => {
  it("requests and verifies a code", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { sent: true }));
    await requestSocialEmailCode("tok", "jane@example.com");
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/social\/email-code$/);
    expect(JSON.parse((fetchMock.mock.calls[0][1] as { credentials?: string; headers: Record<string, string>; body: string }).body as string)).toEqual({
      socialRegistrationToken: "tok",
      email: "jane@example.com",
    });
    fetchMock.mockResolvedValueOnce(json(200, { email: "jane@example.com", emailVerified: true }));
    await expect(verifySocialEmailCode("tok", "123456")).resolves.toEqual({
      email: "jane@example.com",
      emailVerified: true,
    });
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/auth\/social\/email-code\/verify$/);
  });

  it("carries codes on verify and rate-limit refusals", async () => {
    fetchMock.mockResolvedValueOnce(json(400, { code: "social_email_code_invalid", message: "x" }));
    await expect(verifySocialEmailCode("tok", "000000")).rejects.toMatchObject({ code: "social_email_code_invalid" });
    fetchMock.mockResolvedValueOnce(json(429, { code: "social_email_code_rate_limited", message: "x" }));
    await expect(requestSocialEmailCode("tok", "a@b.co")).rejects.toMatchObject({
      status: 429,
      code: "social_email_code_rate_limited",
    });
  });

  it("registers in cookie mode and carries the 409 code", async () => {
    fetchMock.mockResolvedValueOnce(json(201, { accessToken: "a", user: {}, guardian: null }));
    await registerSocial({ socialRegistrationToken: "tok", displayName: "Jane Doe", dateOfBirth: "1990-01-02", countryCode: "GB" });
    const init = fetchMock.mock.calls[0][1] as { credentials?: string; headers: Record<string, string>; body: string };
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/social\/register$/);
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).not.toHaveProperty("email");
    expect(JSON.parse(init.body as string)).not.toHaveProperty("password");

    fetchMock.mockResolvedValueOnce(json(409, { code: "social_signup_unavailable", message: "x" }));
    await expect(
      registerSocial({ socialRegistrationToken: "tok", displayName: "J", dateOfBirth: "1990-01-02", countryCode: "GB" }),
    ).rejects.toMatchObject({ status: 409, code: "social_signup_unavailable" });
  });
});
