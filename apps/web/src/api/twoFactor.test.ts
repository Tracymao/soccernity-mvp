// B-087 / B-111: the two-factor API client (api/twoFactor.ts) and the sign-in second step
// (completeTwoFactorLogin in api/auth.ts). Real fetch is stubbed; the wire shapes mirror
// services/api modules/two-factor.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeTwoFactorLogin,
  isTwoFactorChallenge,
  login,
  reactivateAccount,
  TWO_FACTOR_CHALLENGE_EXPIRED_MESSAGE,
} from "./auth";
import {
  confirmTwoFactorEnrolment,
  disableTwoFactor,
  getTwoFactorStatus,
  regenerateBackupCodes,
  startTwoFactorEnrolment,
} from "./twoFactor";

const API = "http://localhost:3000";
let fetchMock: ReturnType<typeof vi.fn>;

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function empty(status: number): Response {
  return new Response(null, { status });
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function lastCall() {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: url as string, init: init as NonNullable<Parameters<typeof fetch>[1]> & { headers: Record<string, string> } };
}

describe("settings endpoints", () => {
  it("GET /auth/two-factor/status with the bearer token", async () => {
    fetchMock.mockResolvedValue(json(200, { enabled: true, backupCodesRemaining: 9 }));
    await expect(getTwoFactorStatus("tok")).resolves.toEqual({ enabled: true, backupCodesRemaining: 9 });
    const { url, init } = lastCall();
    expect(url).toBe(`${API}/auth/two-factor/status`);
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("enrol/start returns the secret and the otpauth URI", async () => {
    fetchMock.mockResolvedValue(json(200, { secret: "S", otpauthUri: "otpauth://totp/x" }));
    await expect(startTwoFactorEnrolment("tok")).resolves.toEqual({ secret: "S", otpauthUri: "otpauth://totp/x" });
    expect(lastCall().url).toBe(`${API}/auth/two-factor/enrol/start`);
    expect(lastCall().init.method).toBe("POST");
  });

  it("enrol/start on an already-on account is the coded 409", async () => {
    fetchMock.mockResolvedValue(json(409, { code: "two_factor_already_enabled", message: "x" }));
    await expect(startTwoFactorEnrolment("tok")).rejects.toMatchObject({ code: "two_factor_already_enabled", status: 409 });
  });

  it("enrol/confirm sends { code } and returns the backup codes", async () => {
    fetchMock.mockResolvedValue(json(200, { backupCodes: ["A", "B"] }));
    await expect(confirmTwoFactorEnrolment("tok", "482017")).resolves.toEqual(["A", "B"]);
    expect(lastCall().url).toBe(`${API}/auth/two-factor/enrol/confirm`);
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ code: "482017" });
  });

  it("enrol/confirm: 401 is a wrong code, 429 is locked, 400 is an expired setup", async () => {
    fetchMock.mockResolvedValueOnce(json(401, { message: "That code did not work. Check it and try again." }));
    await expect(confirmTwoFactorEnrolment("tok", "1")).rejects.toMatchObject({ code: "two_factor_invalid_code" });
    fetchMock.mockResolvedValueOnce(json(429, { message: "x" }));
    await expect(confirmTwoFactorEnrolment("tok", "1")).rejects.toMatchObject({ code: "two_factor_locked", status: 429 });
    fetchMock.mockResolvedValueOnce(json(400, { code: "two_factor_no_pending_enrolment", message: "x" }));
    await expect(confirmTwoFactorEnrolment("tok", "1")).rejects.toMatchObject({ code: "two_factor_no_pending" });
  });

  it("regenerate sends { password } and returns the codes; a 401 is a wrong password", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { backupCodes: ["Z"] }));
    await expect(regenerateBackupCodes("tok", "pw")).resolves.toEqual(["Z"]);
    expect(lastCall().url).toBe(`${API}/auth/two-factor/backup-codes/regenerate`);
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ password: "pw" });
    fetchMock.mockResolvedValueOnce(json(401, { message: "Incorrect password" }));
    await expect(regenerateBackupCodes("tok", "bad")).rejects.toMatchObject({ code: "two_factor_wrong_password" });
  });

  it("disable resolves on 204; a 401 is a wrong password; a 409 not-enabled is coded", async () => {
    fetchMock.mockResolvedValueOnce(empty(204));
    await expect(disableTwoFactor("tok", "pw")).resolves.toBeUndefined();
    expect(lastCall().url).toBe(`${API}/auth/two-factor/disable`);
    fetchMock.mockResolvedValueOnce(json(401, { message: "Incorrect password" }));
    await expect(disableTwoFactor("tok", "bad")).rejects.toMatchObject({ code: "two_factor_wrong_password" });
    fetchMock.mockResolvedValueOnce(json(409, { code: "two_factor_not_enabled", message: "x" }));
    await expect(disableTwoFactor("tok", "pw")).rejects.toMatchObject({ code: "two_factor_not_enabled" });
  });

  it("a network failure is an AuthApiError with the plain message", async () => {
    fetchMock.mockRejectedValue(new TypeError("boom"));
    await expect(getTwoFactorStatus("tok")).rejects.toMatchObject({ name: "AuthApiError" });
  });

  it("never logs a response body", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m));
    fetchMock.mockResolvedValue(json(200, { secret: "TOPSECRETVALUE", otpauthUri: "otpauth://x?secret=TOPSECRETVALUE" }));
    await startTwoFactorEnrolment("tok");
    expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toContain("TOPSECRETVALUE");
    vi.restoreAllMocks();
  });
});

describe("sign-in second step", () => {
  it("isTwoFactorChallenge recognises the challenge and nothing else", () => {
    expect(isTwoFactorChallenge({ twoFactorRequired: true, challengeToken: "c", challengeExpiresInSeconds: 300 })).toBe(true);
    expect(isTwoFactorChallenge({ accessToken: "a", user: {} })).toBe(false);
    expect(isTwoFactorChallenge(null)).toBe(false);
    expect(isTwoFactorChallenge({ twoFactorRequired: true })).toBe(false);
  });

  it("login() and reactivateAccount() pass a challenge through untouched", async () => {
    const challenge = { twoFactorRequired: true, challengeToken: "c1", challengeExpiresInSeconds: 300 };
    fetchMock.mockResolvedValueOnce(json(200, challenge));
    await expect(login({ email: "a@b.co", password: "pw" })).resolves.toEqual(challenge);
    fetchMock.mockResolvedValueOnce(json(200, challenge));
    await expect(reactivateAccount("a@b.co", "pw")).resolves.toEqual(challenge);
  });

  it("POST /auth/login/two-factor sends only { challengeToken, code }, in cookie mode with credentials", async () => {
    fetchMock.mockResolvedValue(json(200, { accessToken: "a", user: {} }));
    await completeTwoFactorLogin("chal", "482017");
    const { url, init } = lastCall();
    expect(url).toBe(`${API}/auth/login/two-factor`);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.headers["X-Auth-Mode"]).toBe("cookie");
    expect(init.headers.Authorization).toBeUndefined();
    expect(JSON.parse(init.body as string)).toEqual({ challengeToken: "chal", code: "482017" });
  });

  it("a 401 with the server's expired-step message is the expired code; any other 401 is a wrong code", async () => {
    fetchMock.mockResolvedValueOnce(json(401, { message: TWO_FACTOR_CHALLENGE_EXPIRED_MESSAGE }));
    await expect(completeTwoFactorLogin("c", "1")).rejects.toMatchObject({ code: "two_factor_challenge_expired" });
    fetchMock.mockResolvedValueOnce(json(401, { message: "That code did not work. Check it and try again." }));
    await expect(completeTwoFactorLogin("c", "1")).rejects.toMatchObject({ code: "two_factor_invalid_code" });
    fetchMock.mockResolvedValueOnce(json(429, {}));
    await expect(completeTwoFactorLogin("c", "1")).rejects.toMatchObject({ code: "two_factor_locked" });
  });

  it("the expired-step message matches the server constant", () => {
    expect(TWO_FACTOR_CHALLENGE_EXPIRED_MESSAGE).toBe("This sign-in step has expired. Sign in again.");
  });
});
