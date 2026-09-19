import { describe, it, expect, vi, afterEach } from "vitest";
import { AuthApiError, confirmGuardianConsent, declineGuardianConsent } from "./auth";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("guardian consent decline/confirm client", () => {
  it("POSTs the token to /auth/guardian-consent/decline, unauthenticated", async () => {
    const fetchMock = mockFetch(200, { message: "Guardian consent declined." });
    await declineGuardianConsent("tok");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/auth\/guardian-consent\/decline$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ consentToken: "tok" });
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("passes through a non-generic 400 message (already confirmed)", async () => {
    mockFetch(400, { message: "Consent for this account has already been confirmed. Request a withdrawal link instead." });
    await expect(declineGuardianConsent("tok")).rejects.toThrow(/already been confirmed/);
  });

  it("collapses the backend's generic rejection to the invalid-link message", async () => {
    mockFetch(400, { message: "Invalid or expired consent token" });
    await expect(declineGuardianConsent("tok")).rejects.toThrow(/invalid or has expired/i);
  });

  it("maps 429 to a rate-limit message and validation-array 400s to the generic one", async () => {
    mockFetch(429, {});
    await expect(declineGuardianConsent("tok")).rejects.toThrow(/too many attempts/i);
    mockFetch(400, { message: ["consentToken must be a UUID"] });
    await expect(confirmGuardianConsent("tok")).rejects.toBeInstanceOf(AuthApiError);
  });
});
